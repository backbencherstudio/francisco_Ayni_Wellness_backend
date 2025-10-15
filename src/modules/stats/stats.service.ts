import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { startOfDay, subDays, startOfMonth, subMonths } from 'date-fns';
import { RoutineItemStatus, RoutineStatus } from '@prisma/client';

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

    // Routines in range
    const routines = await this.prisma.routine.findMany({
      where: { user_id: userId, date: { gte: start, lte: end } },
      select: { id: true, date: true, status: true, completed_at: true },
    });
    const routineIds = routines.map((r) => r.id);
    const routineItems = routineIds.length
      ? await this.prisma.routineItem.findMany({
          where: { routine_id: { in: routineIds } },
          select: { duration_min: true, status: true },
        })
      : [];

    const routineGeneratedByDay = new Set<number>(
      routines.map((r) => startOfDay(new Date(r.date)).getTime()),
    );
    const routineCompletedByDay = new Set<number>(
      routines
        .filter((r) => r.status === RoutineStatus.completed || r.completed_at)
        .map((r) => startOfDay(new Date(r.date)).getTime()),
    );

    // Combined completion and minutes
    const totalHabitSlots = habits.length * days;
    const routineSlots = routineGeneratedByDay.size; // 1 routine per generated day
    const totalPotential = totalHabitSlots + routineSlots;
    const habitCompletions = logs.length;
    const routineCompletions = routineCompletedByDay.size;
    const completionRate = totalPotential > 0 ? (habitCompletions + routineCompletions) / totalPotential : 0;

    const habitMinutes = logs.reduce((s, l) => s + (l.duration_minutes || 0), 0);
    const routineMinutes = routineItems
      .filter((i) => i.status === RoutineItemStatus.completed)
      .reduce((s, i) => s + (i.duration_min || 0), 0);
    const totalMinutes = habitMinutes + routineMinutes;

    let avgMood: number | null = null;
    if (moodAggs.length) {
      avgMood = Number(
        (
          moodAggs.reduce((s, m) => s + m.avg_score, 0) / moodAggs.length
        ).toFixed(2),
      );
    } else {
      // Fallback: compute from mood entries if aggregates not available
      const entries = await this.prisma.moodEntry.findMany({
        where: { user_id: userId, created_at: { gte: start, lte: end } },
        select: { created_at: true, score: true },
      });
      if (entries.length) {
        const byDay: Record<number, number[]> = {};
        for (const e of entries) {
          const d = startOfDay(new Date(e.created_at)).getTime();
          (byDay[d] = byDay[d] || []).push(e.score);
        }
        const dailyAverages: number[] = Object.values(byDay).map((scores) =>
          scores.reduce((a, b) => a + b, 0) / scores.length,
        );
        if (dailyAverages.length) {
          avgMood = Number(
            (
              dailyAverages.reduce((s, n) => s + n, 0) /
              dailyAverages.length
            ).toFixed(2),
          );
        }
      }
      // If still null, use all-time average from all mood entries
      if (avgMood === null) {
        const overall = await this.prisma.moodEntry.aggregate({
          where: { user_id: userId },
          _avg: { score: true },
        });
        const val = overall._avg?.score as number | null | undefined;
        if (val != null) avgMood = Number(val.toFixed(2));
      }
    }

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

    // Routine-only progress
    const [routines, items, moodAggs, moodEntriesInRange] = await Promise.all([
      this.prisma.routine.findMany({
        where: { user_id: userId, date: { gte: start, lte: end } },
        select: { id: true, date: true },
      }),
      this.prisma.routineItem.findMany({
        where: { routine: { user_id: userId, date: { gte: start, lte: end } } },
        select: { routine_id: true, status: true },
      }),
      this.prisma.moodDailyAggregate.findMany({
        where: { user_id: userId, date: { gte: start, lte: end } },
      }),
      this.prisma.moodEntry.findMany({
        where: { user_id: userId, created_at: { gte: start, lte: end } },
        select: { created_at: true, score: true },
      }),
    ]);

    const moodMap = new Map(
      moodAggs.map((a) => [
        startOfDay(new Date(a.date)).getTime(),
        a.avg_score,
      ]),
    );
    // Build per-day mood average from entries for fallback
    const moodEntryDayAvg: Record<number, number> = {};
    if (moodEntriesInRange.length) {
      const byDay: Record<number, number[]> = {};
      for (const e of moodEntriesInRange) {
        const key = startOfDay(new Date(e.created_at)).getTime();
        (byDay[key] = byDay[key] || []).push(e.score);
      }
      for (const [k, arr] of Object.entries(byDay)) {
        moodEntryDayAvg[Number(k)] = arr.reduce((a, b) => a + b, 0) / arr.length;
      }
    }
    // Compute all-time mood average for final fallback
    const overallMoodAgg = await this.prisma.moodEntry.aggregate({
      where: { user_id: userId },
      _avg: { score: true },
    });
    const allTimeAvgMood = overallMoodAgg._avg?.score as number | null | undefined;

    // Map routine per day and aggregate items
    const routineIdByDay: Record<number, string> = {};
    for (const r of routines) {
      const key = startOfDay(new Date(r.date)).getTime();
      routineIdByDay[key] = r.id;
    }
    const itemsByRoutine: Record<string, { total: number; completed: number }> = {};
    for (const it of items) {
      const acc = (itemsByRoutine[it.routine_id] =
        itemsByRoutine[it.routine_id] || { total: 0, completed: 0 });
      acc.total += 1;
      if (it.status === 'completed') acc.completed += 1;
    }

    const rows: DailyProgressRow[] = [];
    for (let i = 0; i < days; i++) {
      const d = startOfDay(subDays(end, days - 1 - i));
  const key = d.getTime();
  const routineId = routineIdByDay[key];
  const totals = routineId ? itemsByRoutine[routineId] : undefined;
  const completed = totals ? totals.completed : 0;
  const total = totals ? totals.total : 0;

      rows.push({
        date: d.toISOString(),
        completed,
        total,
        completion_rate: total > 0 ? Number((completed / total).toFixed(2)) : 0,
        mood_avg: moodMap.has(key)
          ? (moodMap.get(key) as number)
          : moodEntryDayAvg[key] != null
          ? Number(moodEntryDayAvg[key].toFixed(2))
          : allTimeAvgMood != null
          ? Number((allTimeAvgMood as number).toFixed(2))
          : null,
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
    const [moodAggs, routines, items, moodEntries] = await Promise.all([
      this.prisma.moodDailyAggregate.findMany({
        where: {
          user_id: userId,
          date: { gte: startMonth, lte: endMonthStart },
        },
      }),
      this.prisma.routine.findMany({
        where: { user_id: userId, date: { gte: startMonth, lte: endMonthStart } },
        select: { id: true, date: true },
      }),
      this.prisma.routineItem.findMany({
        where: { routine: { user_id: userId, date: { gte: startMonth, lte: endMonthStart } } },
        select: { routine_id: true, status: true },
      }),
      this.prisma.moodEntry.findMany({
        where: { user_id: userId, created_at: { gte: startMonth, lte: endMonthStart } },
        select: { created_at: true, score: true },
      }),
    ]);
    const moodMonthMap: Record<number, number[]> = {};
    for (const m of moodAggs) {
      const ms = startOfMonth(new Date(m.date)).getTime();
      (moodMonthMap[ms] = moodMonthMap[ms] || []).push(m.avg_score);
    }
    // Build month-level mood averages from raw entries as fallback
    const moodMonthEntryMap: Record<number, number[]> = {};
    for (const me of moodEntries) {
      const ms = startOfMonth(new Date(me.created_at)).getTime();
      (moodMonthEntryMap[ms] = moodMonthEntryMap[ms] || []).push(me.score);
    }
    // All-time mood average for last resort
    const overallMood = await this.prisma.moodEntry.aggregate({
      where: { user_id: userId },
      _avg: { score: true },
    });
    const allTimeAvg = overallMood._avg?.score as number | null | undefined;
    const routineMonth: Record<string, number> = {};
    for (const r of routines) {
      routineMonth[r.id] = startOfMonth(new Date(r.date)).getTime();
    }
    const monthTotals: Record<number, { total: number; completed: number }> = {};
    for (const it of items) {
      const ms = routineMonth[it.routine_id];
      if (ms == null) continue;
      const acc = (monthTotals[ms] = monthTotals[ms] || { total: 0, completed: 0 });
      acc.total += 1;
      if (it.status === 'completed') acc.completed += 1;
    }
    const rows: any[] = [];
    for (let i = 0; i < months; i++) {
      const monthStart = startOfMonth(subMonths(endMonthStart, months - 1 - i));
      const ms = monthStart.getTime();
      const totals = monthTotals[ms] || { total: 0, completed: 0 };
      const completed = totals.completed;
      const total = totals.total;
      const moodList = moodMonthMap[ms] || [];
      let mood_avg: number | null = null;
      if (moodList.length) {
        mood_avg = Number(
          (moodList.reduce((s, n) => s + n, 0) / moodList.length).toFixed(2),
        );
      } else if ((moodMonthEntryMap[ms] || []).length) {
        const arr = moodMonthEntryMap[ms];
        mood_avg = Number(
          (arr.reduce((s, n) => s + n, 0) / arr.length).toFixed(2),
        );
      } else if (allTimeAvg != null) {
        mood_avg = Number((allTimeAvg as number).toFixed(2));
      }
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
          const minutes = await this.totalMinutesAll(userId);
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
    // last 30 days completion vs potential (combined habits + routines)
    const end = startOfDay(new Date());
    const start = startOfDay(subDays(end, 29));
    const [logs, routines] = await Promise.all([
      this.prisma.habitLog.findMany({
        where: { user_id: userId, day: { gte: start, lte: end } },
      }),
      this.prisma.routine.findMany({
        where: { user_id: userId, date: { gte: start, lte: end } },
        select: { date: true, status: true, completed_at: true },
      }),
    ]);
    const routineGeneratedByDay = new Set<number>(
      routines.map((r) => startOfDay(new Date(r.date)).getTime()),
    );
    const routineCompletedByDay = new Set<number>(
      routines
        .filter((r) => r.status === RoutineStatus.completed || r.completed_at)
        .map((r) => startOfDay(new Date(r.date)).getTime()),
    );
    const potential = habits.length * 30 + routineGeneratedByDay.size;
    const completed = logs.length + routineCompletedByDay.size;
    const rate = potential > 0 ? completed / potential : 0;
    return { completion_rate: Number(rate.toFixed(2)) };
  }

  // ---------- Internal Helpers ------------------------------------------
  private async computeOverallStreak(userId: string, maxDays = 400) {
    const end = startOfDay(new Date());
    const from = startOfDay(subDays(end, maxDays - 1));
    const [logs, routines] = await Promise.all([
      this.prisma.habitLog.findMany({
        where: { user_id: userId, day: { lte: end, gte: from } },
        select: { day: true },
      }),
      this.prisma.routine.findMany({
        where: { user_id: userId, date: { lte: end, gte: from } },
        select: { date: true, status: true, completed_at: true },
      }),
    ]);
    const habitDays = logs.map((l) => startOfDay(new Date(l.day)).getTime());
    const routineDays = routines
      .filter((r) => r.status === RoutineStatus.completed || r.completed_at)
      .map((r) => startOfDay(new Date(r.date)).getTime());
    const daySet = new Set<number>([...habitDays, ...routineDays]);
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
    const [logs, routineItems] = await Promise.all([
      this.prisma.habitLog.findMany({ where: { user_id: userId } }),
      this.prisma.routineItem.findMany({
        where: { routine: { user_id: userId } },
        select: { status: true, duration_min: true },
      }),
    ]);
    const habitMinutes = logs.reduce((s, l) => s + (l.duration_minutes || 0), 0);
    const routineMinutes = routineItems
      .filter((i) => i.status === RoutineItemStatus.completed)
      .reduce((s, i) => s + (i.duration_min || 0), 0);
    return habitMinutes + routineMinutes;
  }

  private async totalCompletions(userId: string) {
    const [habitCount, routineCount] = await Promise.all([
      this.prisma.habitLog.count({ where: { user_id: userId } }),
      this.prisma.routine.count({
        where: {
          user_id: userId,
          OR: [
            { status: RoutineStatus.completed },
            { completed_at: { not: null } },
          ],
        },
      }),
    ]);
    return habitCount + routineCount;
  }

  private async allDailyForMonth(userId: string) {
    // Condition: for each of last 30 days, the routine exists and is completed
    const end = startOfDay(new Date());
    for (let i = 0; i < 30; i++) {
      const day = startOfDay(subDays(end, i));
      const r = await this.prisma.routine.findFirst({
        where: { user_id: userId, date: day },
        select: { status: true, completed_at: true },
      });
      if (!r) return false;
      const done = r.status === RoutineStatus.completed || r.completed_at;
      if (!done) return false;
    }
    return true;
  }
}
