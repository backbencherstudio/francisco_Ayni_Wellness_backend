import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { startOfDay, getDay } from 'date-fns';

interface HomeDashboardResponse {
  success: boolean;
  date: string; // ISO day start
  greeting: { partOfDay: string; message: string };
  user: {
    id: string;
    name: string | null;
    first_name: string | null;
    last_name: string | null;
    avatar: string | null;
  };
  routines: {
    total: number;
    completed: number;
    remaining: number;
    percent: number; // 0-100 rounded
  };
  meditation_minutes: number;
  mood: {
    score: number | null; // 1-10 or null
    entry_id: string | null;
  };
  meta: {
    generated_at: string;
  };
}

@Injectable()
export class HomeService {
  constructor(private prisma: PrismaService) {}

  async today(userId: string): Promise<HomeDashboardResponse> {
    const prismaAny: any = this.prisma as any;
    // Use UTC midnight as canonical day boundary to match other services
    const dayStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    const nextDay = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1));

    // Fetch core data in parallel (habits + routine for today)
    const [user, habits, logs, routine, todayMood] = await Promise.all([
      prismaAny.user.findFirst({ where: { id: userId } }),

      prismaAny.habit.findMany({
        where: { user_id: userId, status: 1, deleted_at: null },
      }),

      prismaAny.habitLog.findMany({
        where: { user_id: userId, day: dayStart },
      }),

      prismaAny.routine.findFirst({
        where: { user_id: userId, date: { gte: dayStart, lt: nextDay } },
        include: { items: true, mood_check: true },
      }),

      prismaAny.moodEntry.findFirst({
        where: {
          user_id: userId,
          created_at: { gte: dayStart, lt: nextDay },
          deleted_at: null,
        },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    // Determine which habits are due today (respect frequency)
    const isDueToday = (frequency?: string | null, today: Date = new Date()) => {
      if (!frequency) return true;
      const dow = getDay(today); // 0=Sun..6=Sat
      switch (frequency) {
        case 'Daily':
          return true;
        case 'Weekdays':
          return dow >= 1 && dow <= 5;
        case 'Weekends':
          return dow === 0 || dow === 6;
        case 'Weekly':
          return true;
        default:
          return true;
      }
    };

    const dueHabits = habits.filter((h: any) => isDueToday(h.frequency));
    const totalHabits = dueHabits.length;
    // Only consider logs that correspond to due habits
    const dueIds = dueHabits.map((h: any) => h.id);
    const habitCompleted = logs.filter((l: any) => dueIds.includes(l.habit_id)).length;
    console.log('total habit', totalHabits);
    console.log('completed log', habitCompleted);

    // Routine item counts (today)
    const routineItems = routine?.items || [];
    const totalRoutineItems = routineItems.length;
    const routineItemsCompleted = routineItems.filter(
      (it: any) => it.status === 'completed',
    ).length;

    // Combined totals (habits + routine items)
    const total = totalHabits + totalRoutineItems;
    const completed = habitCompleted + routineItemsCompleted;
    const remaining = Math.max(0, total - completed);
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Build quick lookup of habit categories for meditation minutes
    const habitCategoryMap = new Map<string, string>(
      dueHabits.map((h: any) => [h.id, h.category]),
    );
    let meditationMinutes = 0;
    for (const l of logs) {
      const cat = habitCategoryMap.get(l.habit_id);
      if (cat === 'Meditation') {
        meditationMinutes += l.duration_minutes || 0;
      }
    }
    // Add routine items meditation/sound healing minutes (completed items)
    for (const it of routineItems) {
      if (
        it.status === 'completed' &&
        (it.type === 'Meditation' || it.type === 'SoundHealing')
      ) {
        meditationMinutes += it.duration_min || 0;
      }
    }
    // Mood rating: prefer routine mood check rating for today, fallback to MoodEntry
    const moodScore =
      routine?.mood_check?.rating != null
        ? routine.mood_check.rating
        : todayMood
          ? todayMood.score
          : null;

    const greeting = this.buildGreeting();

    return {
      success: true,
      date: dayStart.toISOString(),
      greeting,
      user: {
        id: user.id,
        name: user.name,
        first_name: user.first_name,
        last_name: user.last_name,
        avatar: user.avatar,
      },
      // UI label says Daily Routines; value is combined (habits + routine items) per requirement
      routines: { total, completed, remaining, percent },
      meditation_minutes: meditationMinutes,
      mood: { score: moodScore, entry_id: todayMood ? todayMood.id : null },
      meta: { generated_at: new Date().toISOString() },
    };
  }

  private buildGreeting() {
    const hour = new Date().getHours();
    let partOfDay = 'Day';
    if (hour < 5) partOfDay = 'Night';
    else if (hour < 12) partOfDay = 'Morning';
    else if (hour < 17) partOfDay = 'Afternoon';
    else partOfDay = 'Evening';
    return { partOfDay, message: `Good ${partOfDay}` };
  }
}
