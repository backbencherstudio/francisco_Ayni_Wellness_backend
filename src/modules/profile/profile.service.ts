import { Injectable } from '@nestjs/common';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { StatsService } from '../stats/stats.service';

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

    // Pull habit logs (limit timeframe for efficiency?) We'll get stats via aggregate queries.
    const logs = await this.prisma.habitLog.findMany({
      where: { user_id: userId },
      select: { day: true, habit_id: true, duration_minutes: true },
    });
    const totalRoutines = logs.length;
    // Distinct active days
    const daySet = new Set(
      logs.map((l) => new Date(l.day).toISOString().slice(0, 10)),
    );
    const daysActive = daySet.size;

    // Current streak: consecutive days ending today with at least one log
    let streak = 0;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const dayIsoSet = new Set(Array.from(daySet).map((d) => d));
    for (;;) {
      const key = todayStart.toISOString().slice(0, 10);
      if (dayIsoSet.has(key)) {
        streak++;
        todayStart.setDate(todayStart.getDate() - 1);
      } else break;
    }
    // Meditation minutes: need habits for category filter
    const habitIds = Array.from(new Set(logs.map((l) => l.habit_id)));
    const habits = habitIds.length
      ? await this.prisma.habit.findMany({
          where: { id: { in: habitIds } },
          select: { id: true, category: true },
        })
      : [];
    const catMap = new Map(habits.map((h) => [h.id, h.category]));
    let meditationMinutes = 0;
    for (const l of logs) {
      if (catMap.get(l.habit_id) === 'Meditation')
        meditationMinutes += l.duration_minutes || 0;
    }
    const meditationHours = Number((meditationMinutes / 60).toFixed(1));

    // Level system (basic): each 100 routines = +1 level (minimum level 1)
    const level = Math.max(1, Math.floor(totalRoutines / 100) + 1);
    const currentLevelBase = (level - 1) * 100;
    const progressWithin = totalRoutines - currentLevelBase;
    const progressPct = Math.min(1, progressWithin / 100);

    return {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        member_since: user.created_at,
      },
      metrics: {
        level,
        level_progress_pct: Number(progressPct.toFixed(2)),
        days_active: daysActive,
        day_streak: streak,
        routines_done: totalRoutines,
        meditation_hours: meditationHours,
        meditation_minutes: meditationMinutes,
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
