import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { startOfDay, subDays, startOfMonth, subMonths } from 'date-fns';

export interface PeriodSummary {
  period: 'week' | 'month' | 'year';
  range_start: string;
  range_end: string;
  current_streak: number;
  completion_rate: number; // 0-1
  total_time_minutes: number;
  avg_mood: number | null;
}

export interface DailyProgressRow {
  date: string; // ISO day start
  completed: number;
  total: number;
  completion_rate: number; // 0-1 per day
  mood_avg: number | null;
}

export interface HabitProgressRow {
  habit_id: string;
  habit_name: string | null;
  streak: number;
  completed_last_30: number;
  target_days: number | null; // from duration if provided
  progress_pct: number; // 0-1 toward target if target exists
}

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}

  // ---------- Public API Methods (called by controller) -----------------
  async summary(
    userId: string,
    period: 'week' | 'month' | 'year' = 'week',
  ): Promise<PeriodSummary> {
    if (!userId) throw new BadRequestException('User required');

    const days = period === 'week' ? 7 : period === 'month' ? 30 : 365;
    const end = startOfDay(new Date());
    const start = startOfDay(subDays(end, days - 1));

    const [habits, logs, moodAggs] = await Promise.all([
      this.prisma.habit.findMany({
        where: {
          user_id: userId,
          status: 1,
          deleted_at: null,
        },
      }),

      this.prisma.habitLog.findMany({
        where: {
          user_id: userId,
          day: { gte: start, lte: end },
        },
      }),

      this.prisma.moodDailyAggregate.findMany({
        where: { user_id: userId, date: { gte: start, lte: end } },
      }),
    ]);

    const totalHabitSlots = habits.length * days;
    const completionRate =
      totalHabitSlots > 0 ? logs.length / totalHabitSlots : 0;
    const totalMinutes = logs.reduce(
      (s, l) => s + (l.duration_minutes || 0),
      0,
    );

    const avgMood = moodAggs.length
      ? Number(
          (
            moodAggs.reduce((s, m) => s + m.avg_score, 0) / moodAggs.length
          ).toFixed(2),
        )
      : null;

    const currentStreak = await this.computeOverallStreak(userId);

    return {
      period,
      range_start: start.toISOString(),
      range_end: end.toISOString(),
      current_streak: currentStreak,
      completion_rate: Number(completionRate.toFixed(2)),
      total_time_minutes: totalMinutes,
      avg_mood: avgMood,
    };
  }

  // Unified progress: week (7 daily rows), month (30 daily rows), year (12 monthly rows)
  async progress(userId: string, period: 'week' | 'month' | 'year' = 'week') {
    if (!userId) throw new BadRequestException('User required');

    if (period === 'year') return this.yearlyProgress(userId);

    const days = period === 'week' ? 7 : 30;
    const end = startOfDay(new Date());
    const start = startOfDay(subDays(end, days - 1));

    const habits = await this.prisma.habit.findMany({
      where: {
        user_id: userId,
        status: 1,
        deleted_at: null,
      },
    });

    const [logs, moodAggs] = await Promise.all([
      this.prisma.habitLog.findMany({
        where: {
          user_id: userId,
          day: { gte: start, lte: end },
        },
      }),

      this.prisma.moodDailyAggregate.findMany({
        where: { user_id: userId, date: { gte: start, lte: end } },
      }),
    ]);

    const moodMap = new Map(
      moodAggs.map((a) => [
        startOfDay(new Date(a.date)).getTime(),
        a.avg_score,
      ]),
    );

    const logsByDay: Record<number, number> = {};
    for (const l of logs) {
      const key = startOfDay(new Date(l.day)).getTime();
      logsByDay[key] = (logsByDay[key] || 0) + 1;
    }

    const rows: DailyProgressRow[] = [];
    for (let i = 0; i < days; i++) {
      const d = startOfDay(subDays(end, days - 1 - i));
      const key = d.getTime();
      const completed = logsByDay[key] || 0;
      const total = habits.length;

      rows.push({
        date: d.toISOString(),
        completed,
        total,
        completion_rate: total > 0 ? Number((completed / total).toFixed(2)) : 0,
        mood_avg: moodMap.has(key) ? (moodMap.get(key) as number) : null,
      });
    }
    const avgComp = rows.length
      ? rows.reduce((s, r) => s + r.completion_rate, 0) / rows.length
      : 0;
    return {
      period,
      granularity: 'day',
      rows,
      summary: { average_completion_rate: Number(avgComp.toFixed(2)) },
    };
  }

  private async yearlyProgress(userId: string) {
    const months = 12;
    const endMonthStart = startOfMonth(new Date());
    const startMonth = startOfMonth(subMonths(endMonthStart, months - 1));
    const habits = await this.prisma.habit.findMany({
      where: { user_id: userId, status: 1, deleted_at: null },
    });
    const [logs, moodAggs] = await Promise.all([
      this.prisma.habitLog.findMany({
        where: {
          user_id: userId,
          day: { gte: startMonth, lte: endMonthStart },
        },
      }),
      this.prisma.moodDailyAggregate.findMany({
        where: {
          user_id: userId,
          date: { gte: startMonth, lte: endMonthStart },
        },
      }),
    ]);
    // Bucket logs by month start
    const logMonthMap: Record<number, number> = {};
    for (const l of logs) {
      const ms = startOfMonth(new Date(l.day)).getTime();
      logMonthMap[ms] = (logMonthMap[ms] || 0) + 1;
    }
    const moodMonthMap: Record<number, number[]> = {};
    for (const m of moodAggs) {
      const ms = startOfMonth(new Date(m.date)).getTime();
      (moodMonthMap[ms] = moodMonthMap[ms] || []).push(m.avg_score);
    }
    const rows: any[] = [];
    for (let i = 0; i < months; i++) {
      const monthStart = startOfMonth(subMonths(endMonthStart, months - 1 - i));
      const ms = monthStart.getTime();
      const completed = logMonthMap[ms] || 0;
      const daysInMonth = new Date(
        monthStart.getFullYear(),
        monthStart.getMonth() + 1,
        0,
      ).getDate();
      const total = habits.length * daysInMonth;
      const moodList = moodMonthMap[ms] || [];
      const mood_avg = moodList.length
        ? Number(
            (moodList.reduce((s, n) => s + n, 0) / moodList.length).toFixed(2),
          )
        : null;
      rows.push({
        date: monthStart.toISOString(),
        completed,
        total,
        completion_rate: total > 0 ? Number((completed / total).toFixed(2)) : 0,
        mood_avg,
      });
    }
    const avgComp = rows.length
      ? rows.reduce((s, r) => s + r.completion_rate, 0) / rows.length
      : 0;
    return {
      period: 'year',
      granularity: 'month',
      rows,
      summary: { average_completion_rate: Number(avgComp.toFixed(2)) },
    };
  }

  async habitProgress(
    userId: string,
    period: 'week' | 'month' | 'year' = 'month',
  ): Promise<{ period: string; habits: HabitProgressRow[] }> {
    if (!userId) throw new BadRequestException('User required');
    const now = startOfDay(new Date());
    const days = period === 'week' ? 7 : period === 'month' ? 30 : 365;
    const from = startOfDay(subDays(now, days - 1));
    const habits = await this.prisma.habit.findMany({
      where: { user_id: userId, status: 1, deleted_at: null },
      orderBy: { created_at: 'asc' },
    });
    const logs = await this.prisma.habitLog.findMany({
      where: { user_id: userId, day: { gte: from, lte: now } },
    });
    const logsByHabit: Record<string, number> = {};
    for (const l of logs)
      logsByHabit[l.habit_id] = (logsByHabit[l.habit_id] || 0) + 1;
    const rows: HabitProgressRow[] = [];
    for (const h of habits) {
      const streak = await this.computeHabitStreak(userId, h.id);
      const completed_range = logsByHabit[h.id] || 0;
      const target_days = h.duration ?? null; // user-defined goal (days)
      const denominator = period === 'week' ? 7 : period === 'month' ? 30 : 365;
      const progress_pct = target_days
        ? Number(Math.min(1, completed_range / target_days).toFixed(2))
        : Number((completed_range / denominator).toFixed(2));
      rows.push({
        habit_id: h.id,
        habit_name: h.habit_name,
        streak,
        completed_last_30: completed_range,
        target_days,
        progress_pct,
      });
    }
    return { period, habits: rows };
  }

  async habitProgressByCategory(
    userId: string,
    period: 'week' | 'month' | 'year' = 'month',
  ) {
    if (!userId) throw new BadRequestException('User required');
    const now = startOfDay(new Date());
    const days = period === 'week' ? 7 : period === 'month' ? 30 : 365;
    const from = startOfDay(subDays(now, days - 1));
    const denominator = period === 'week' ? 7 : period === 'month' ? 30 : 365;
    const categories = ['Meditation', 'SoundHealing', 'Journaling', 'Podcast'];
    const habits = await this.prisma.habit.findMany({
      where: { user_id: userId, status: 1, deleted_at: null },
      orderBy: { created_at: 'asc' },
    });
    const logs = await this.prisma.habitLog.findMany({
      where: { user_id: userId, day: { gte: from, lte: now } },
    });
    const logsByHabit: Record<string, number> = {};
    for (const l of logs)
      logsByHabit[l.habit_id] = (logsByHabit[l.habit_id] || 0) + 1;
    // Precompute streaks (could be parallel but sequential is fine for small counts)
    const streakCache: Record<string, number> = {};
    for (const h of habits) {
      streakCache[h.id] = await this.computeHabitStreak(userId, h.id);
    }
    const byCategory = categories.map((key) => {
      const label = key === 'SoundHealing' ? 'Sound healing' : key;
      const catHabits = habits.filter((h) => h.category === key);
      const habitDetails = catHabits.map((h) => {
        const completed_range = logsByHabit[h.id] || 0;
        const target_days = h.duration ?? null;
        const progress_pct = target_days
          ? Number(Math.min(1, completed_range / target_days).toFixed(2))
          : Number((completed_range / denominator).toFixed(2));
        return {
          habit_id: h.id,
          habit_name: h.habit_name,
          streak: streakCache[h.id],
          completed_last_30: completed_range,
          target_days,
          progress_pct,
        };
      });
      const completedSum = habitDetails.reduce(
        (s, h) => s + h.completed_last_30,
        0,
      );
      const potential = catHabits.length * denominator;
      const completion_rate =
        potential > 0 ? Number((completedSum / potential).toFixed(2)) : 0;
      return {
        category_key: key,
        category: label,
        habit_count: catHabits.length,
        completion_rate,
        habits: habitDetails,
      };
    });
    return { period, denominator_days: denominator, categories: byCategory };
  }

  async achievements(userId: string) {
    if (!userId) throw new BadRequestException('User required');
    // Define achievement templates
    const templates = [
      {
        key: 'first_week',
        name: 'First Week',
        description: '7 days in a row',
        condition: async () => (await this.computeOverallStreak(userId)) >= 7,
      },
      {
        key: 'meditation_master',
        name: 'Meditation Master',
        description: '30 hours of meditation',
        condition: async () => {
          /* we only have duration_minutes logged per habit */ const minutes =
            await this.totalMinutesAll(userId);
          return minutes >= 30 * 60;
        },
      },
      {
        key: 'consistent_spirit',
        name: 'Consistent Spirit',
        description: '30 day streak',
        condition: async () => (await this.computeOverallStreak(userId)) >= 30,
      },
      {
        key: 'wellness_warrior',
        name: 'Wellness Warrior',
        description: '100 routines',
        condition: async () => (await this.totalCompletions(userId)) >= 100,
      },
      {
        key: 'mindful_month',
        name: 'Mindful Month',
        description: 'Complete all daily routines for a month',
        condition: async () => await this.allDailyForMonth(userId),
      },
    ];
    const results = [] as any[];
    for (const t of templates) {
      let unlocked = false;
      try {
        unlocked = await t.condition();
      } catch {
        unlocked = false;
      }
      results.push({
        key: t.key,
        name: t.name,
        description: t.description,
        unlocked,
      });
    }
    const unlockedCount = results.filter((r) => r.unlocked).length;
    return {
      achievements: results,
      unlocked: unlockedCount,
      total: results.length,
    };
  }

  async overallProgress(userId: string) {
    if (!userId) throw new BadRequestException('User required');
    const habits = await this.prisma.habit.findMany({
      where: { user_id: userId, status: 1, deleted_at: null },
    });
    if (!habits.length) return { completion_rate: 0 };
    // last 30 days completion vs potential
    const end = startOfDay(new Date());
    const start = startOfDay(subDays(end, 29));
    const logs = await this.prisma.habitLog.findMany({
      where: { user_id: userId, day: { gte: start, lte: end } },
    });
    const potential = habits.length * 30;
    const rate = potential > 0 ? logs.length / potential : 0;
    return { completion_rate: Number(rate.toFixed(2)) };
  }

  // ---------- Internal Helpers ------------------------------------------
  private async computeOverallStreak(userId: string, maxDays = 400) {
    const end = startOfDay(new Date());
    const logs = await this.prisma.habitLog.findMany({
      where: {
        user_id: userId,
        day: { lte: end, gte: subDays(end, maxDays - 1) },
      },
      select: { day: true },
    });
    const daySet = new Set(
      logs.map((l) => startOfDay(new Date(l.day)).getTime()),
    );
    let streak = 0;
    let cursor = end.getTime();
    const dayMs = 86400000;
    for (let i = 0; i < maxDays; i++) {
      if (daySet.has(cursor)) {
        streak++;
        cursor -= dayMs;
      } else break;
    }
    return streak;
  }

  private async computeHabitStreak(
    userId: string,
    habitId: string,
    maxDays = 365,
  ) {
    const end = startOfDay(new Date());
    const logs = await this.prisma.habitLog.findMany({
      where: {
        user_id: userId,
        habit_id: habitId,
        day: { lte: end, gte: subDays(end, maxDays - 1) },
      },
      select: { day: true },
    });
    const daySet = new Set(
      logs.map((l) => startOfDay(new Date(l.day)).getTime()),
    );
    let streak = 0;
    let cursor = end.getTime();
    const dayMs = 86400000;
    for (let i = 0; i < maxDays; i++) {
      if (daySet.has(cursor)) {
        streak++;
        cursor -= dayMs;
      } else break;
    }
    return streak;
  }

  private async totalMinutesAll(userId: string) {
    const logs = await this.prisma.habitLog.findMany({
      where: { user_id: userId },
    });
    return logs.reduce((s, l) => s + (l.duration_minutes || 0), 0);
  }

  private async totalCompletions(userId: string) {
    return this.prisma.habitLog.count({ where: { user_id: userId } });
  }

  private async allDailyForMonth(userId: string) {
    // Condition: for each of last 30 days, completed all active habits that existed that day.
    const habits = await this.prisma.habit.findMany({
      where: { user_id: userId, status: 1, deleted_at: null },
    });
    if (!habits.length) return false;
    const end = startOfDay(new Date());
    for (let i = 0; i < 30; i++) {
      const day = startOfDay(subDays(end, i));
      const logs = await this.prisma.habitLog.findMany({
        where: { user_id: userId, day },
      });
      const count = new Set(logs.map((l) => l.habit_id)).size;
      if (count < habits.length) return false;
    }
    return true;
  }
}
