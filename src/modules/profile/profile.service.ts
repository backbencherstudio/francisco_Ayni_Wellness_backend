import { Injectable } from '@nestjs/common';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { StatsService } from '../stats/stats.service';
import { startOfDay, subDays } from 'date-fns';
import { RoutineStatus } from '@prisma/client';

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statsService: StatsService,
  ) {}

  async getMe(user_id: any) {
    try {
      if (!user_id) {
        return { message: 'User not found', status: false };
      }

      const profile = await this.prisma.user.findUnique({
        where: { id: user_id },
        select: {
          id: true,
          email: true,
          name: true,
          created_at: true,
          updated_at: true,
          avatar: true,
        },
      });

      if (!profile) {
        return { message: 'Profile not found', status: false };
      }

      return {
        message: 'Profile fetched successfully',
        status: true,
        data: profile,
      };
    } catch (error) {
      return { message: 'Error fetching profile', status: false, error };
    }
  }

  async updateMe(user_id: any, updateProfileDto: UpdateProfileDto) {
    try {
      if (!user_id) {
        return { message: 'User not found', status: false };
      }

      const updated = await this.prisma.user.update({
        where: { id: user_id },
        data: {
          ...updateProfileDto,
        },
      });

      return {
        message: 'Profile updated successfully',
        status: true,
        data: updated,
      };
    } catch (error) {
      return { message: 'Error updating profile', status: false, error };
    }
  }

  // Profile overview metrics for dashboard
  async overview(userId: string) {
    if (!userId) return { success: false, message: 'User required' };

    // Fetch basic user
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        created_at: true,
      },
    });
    if (!user) return { success: false, message: 'User not found' };

    // ---------- Habits block ----------
    const habitLogs = await this.prisma.habitLog.findMany({
      where: { user_id: userId },
      select: {
        day: true,
        habit_id: true,
        duration_minutes: true,
      },
    });

    const habitsCompletedCount = habitLogs.length;

    const habitActiveDaySet = new Set(
      habitLogs.map((l) => startOfDay(new Date(l.day)).toISOString()),
    );
    const daysActive = habitActiveDaySet.size;

    // Current habit streak: consecutive days ending today with at least one habit log
    let habitStreak = 0;
    {
      const todayCursor = startOfDay(new Date());
      const habitDayIsoSet = new Set(habitActiveDaySet);

      for (;;) {
        const key = startOfDay(new Date(todayCursor)).toISOString();
        if (habitDayIsoSet.has(key)) {
          habitStreak++;
          todayCursor.setDate(todayCursor.getDate() - 1);
        } else break;
      }
    }
    
    // Meditation minutes from HABITS only
    const habitIds = Array.from(new Set(habitLogs.map((l) => l.habit_id)));
    const habitsForCats = habitIds.length
      ? await this.prisma.habit.findMany({
          where: { id: { in: habitIds } },
          select: { id: true, category: true },
        })
      : [];
    const catMap = new Map(habitsForCats.map((h) => [h.id, h.category]));
    let meditationMinutesHabits = 0;
    for (const l of habitLogs) {
      if (catMap.get(l.habit_id) === 'Meditation')
        meditationMinutesHabits += l.duration_minutes || 0;
    }

    // ---------- AI Routines block ----------
    const day0 = startOfDay(new Date());
    const weekStart = startOfDay(subDays(day0, 6));
    const monthStart = startOfDay(subDays(day0, 29));

    // Last 30 days routines and items
    const routinesLast30 = await this.prisma.routine.findMany({
      where: { user_id: userId, date: { gte: monthStart, lte: day0 } },
      select: { id: true, date: true, status: true, completed_at: true },
      orderBy: { date: 'desc' },
    });
    const routineIds30 = routinesLast30.map((r) => r.id);
    const routineItemsLast30 = routineIds30.length
      ? await this.prisma.routineItem.findMany({
          where: { routine_id: { in: routineIds30 } },
          select: {
            id: true,
            routine_id: true,
            status: true,
            duration_min: true,
            type: true,
            completed_at: true,
          },
        })
      : [];

    // Today routine
    const todayRoutine = await this.prisma.routine.findFirst({
      where: { user_id: userId, date: day0 },
      include: { Reminders: true },
    });
    const todayItems = todayRoutine
      ? await this.prisma.routineItem.findMany({
          where: { routine_id: todayRoutine.id },
        })
      : [];
    const itemsTotal = todayItems.length;
    const itemsCompleted = todayItems.filter(
      (i) => i.status === 'completed',
    ).length;
    const todayTotalDuration = todayItems.reduce(
      (s, i) => s + (i.duration_min || 0),
      0,
    );
    const todayCompletedDuration = todayItems
      .filter((i) => i.status === 'completed')
      .reduce((s, i) => s + (i.duration_min || 0), 0);
    const todayCompletionPct = itemsTotal
      ? Number((itemsCompleted / itemsTotal).toFixed(2))
      : 0;

    // Routine streak: consecutive days with COMPLETED routines
    const completedRoutineDates = new Set(
      routinesLast30
        .filter((r) => r.status === 'completed' || r.completed_at)
        .map((r) => startOfDay(new Date(r.date)).getTime()),
    );
    let routineStreak = 0;
    let cursor = startOfDay(new Date()).getTime();
    const dayMs = 86400000;
    for (let i = 0; i < 60; i++) {
      if (completedRoutineDates.has(cursor)) {
        routineStreak++;
        cursor -= dayMs;
      } else break;
    }

    // ---------- Combined (Habits + AI Routine) metrics ----------
    // All-time completed routines (dates) for union-based metrics
    const completedRoutinesAll = await this.prisma.routine.findMany({
      where: {
        user_id: userId,
        OR: [
          { status: RoutineStatus.completed },
          { completed_at: { not: null } },
        ],
      },
      select: { date: true },
    });
    const habitDayMsSet = new Set(
      habitLogs.map((l) => startOfDay(new Date(l.day)).getTime()),
    );
    const routineDayMsSet = new Set(
      completedRoutinesAll.map((r) => startOfDay(new Date(r.date)).getTime()),
    );
    const combinedDayMsArray: number[] = [
      ...(Array.from(habitDayMsSet.values()) as number[]),
      ...(Array.from(routineDayMsSet.values()) as number[]),
    ];
    const combinedDayMsSet = new Set<number>(combinedDayMsArray);
    const combinedDaysActive = combinedDayMsSet.size;
    // Combined streak: consecutive days with either habit log or completed routine
    let combinedStreak = 0;
    {
      let cursor2 = startOfDay(new Date()).getTime();
      for (let i = 0; i < 400; i++) {
        if (combinedDayMsSet.has(cursor2)) {
          combinedStreak++;
          cursor2 -= dayMs;
        } else break;
      }
    }

    // Weekly routine completion rate (last 7 days)
    const routinesLast7 = routinesLast30.filter(
      (r) => new Date(r.date).getTime() >= weekStart.getTime(),
    );
    const weekGenerated = routinesLast7.length;
    const weekCompleted = routinesLast7.filter(
      (r) => r.status === 'completed' || r.completed_at,
    ).length;
    const weekRoutineCompletionRate = weekGenerated
      ? Number((weekCompleted / weekGenerated).toFixed(2))
      : 0;

    // AI minutes: completed routine items duration in last 30 days
    const aiCompletedItems = routineItemsLast30.filter(
      (ri) => ri.status === 'completed',
    );
    const aiMinutesLast30 = aiCompletedItems.reduce(
      (s, i) => s + (i.duration_min || 0),
      0,
    );
    const aiMeditationMinutes = aiCompletedItems
      .filter((i) => i.type === 'Meditation')
      .reduce((s, i) => s + (i.duration_min || 0), 0);

    // ---------- Level: combine habit completions (all-time) + completed routines (all-time) ----------
    const routineCompletedAllTime = await this.prisma.routine.count({
      where: {
        user_id: userId,
        OR: [
          { status: RoutineStatus.completed },
          { completed_at: { not: null } },
        ],
      },
    });
    const combinedCompletions = habitsCompletedCount + routineCompletedAllTime;
    const level = Math.max(1, Math.floor(combinedCompletions / 100) + 1);
    const currentLevelBase = (level - 1) * 100;
    const progressWithin = combinedCompletions - currentLevelBase;
    const progressPct = Math.min(1, progressWithin / 100);

    const meditationHoursInt = Math.floor(
      (meditationMinutesHabits + aiMeditationMinutes) / 60,
    );

    return {
      user: {
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      },
      metrics: {
        level,
        level_progress_pct: Number(progressPct.toFixed(2)),
        days_active: combinedDaysActive,
        day_streak: combinedStreak,
        routines_done: combinedCompletions,
        meditation_hours: meditationHoursInt,
      },
    };
  }

  async achievedAchievements(userId: string) {
    if (!userId) return { success: false, message: 'User required' };
    // reuse stats service achievements method
    const full = await this.statsService.achievements(userId);
    const unlocked = full.achievements.filter((a) => a.unlocked);
    return {
      success: true,
      unlocked_count: unlocked.length,
      total: full.total,
      achievements: unlocked,
    };
  }
}
