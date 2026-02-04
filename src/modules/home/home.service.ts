import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getDay } from 'date-fns';

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

interface HomeDashboardResponse {
  success: boolean;
  date: string;
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
    percent: number;
  };
  meditation_minutes: number;
  mood: {
    score: number | null;
    entry_id: string | null;
  };
  meta: {
    generated_at: string;
  };
}

@Injectable()
export class HomeService {
  constructor(private prisma: PrismaService) {}

  private async getUserTimezone(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    return user?.timezone || 'UTC';
  }

  async today(userId: string): Promise<HomeDashboardResponse> {
    const prismaAny: any = this.prisma as any;

    const tz = await this.getUserTimezone(userId);
    const dayStart = dayjs().tz(tz).startOf('day');
    const nextDay = dayStart.add(1, 'day');

    const [user, habits, logs, routine, todayMood] = await Promise.all([
      prismaAny.user.findFirst({ where: { id: userId } }),

      prismaAny.habit.findMany({
        where: { user_id: userId, status: 1, deleted_at: null },
      }),

      prismaAny.habitLog.findMany({
        where: { user_id: userId, day: dayStart.toDate() },
      }),

      prismaAny.routine.findFirst({
        where: {
          user_id: userId,
          date: { gte: dayStart.toDate(), lt: nextDay.toDate() },
        },
        include: { items: true, mood_check: true },
      }),

      prismaAny.moodEntry.findFirst({
        where: {
          user_id: userId,
          created_at: { gte: dayStart.toDate(), lt: nextDay.toDate() },
          deleted_at: null,
        },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    // console.log("prisma any", user, habits, logs, routine, todayMood);

    const isDueToday = (
      frequency?: string | null,
      today: Date = new Date(),
    ) => {
      if (!frequency) return true;
      const dow = getDay(today);
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

    const dueHabits = habits.filter((h: any) =>
      isDueToday(h.frequency, dayStart.toDate()),
    );
    const totalHabits = dueHabits.length;
    const dueIds = dueHabits.map((h: any) => h.id);
    const habitCompleted = logs.filter((l: any) =>
      dueIds.includes(l.habit_id),
    ).length;
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
    for (const it of routineItems) {
      if (
        it.status === 'completed' &&
        (it.type === 'Meditation' || it.type === 'SoundHealing')
      ) {
        meditationMinutes += it.duration_min || 0;
      }
    }
    const moodScore =
      routine?.mood_check?.rating != null
        ? routine.mood_check.rating
        : todayMood
          ? todayMood.score
          : null;

    if (!user) {
      return {
        success: false,
        date: dayStart.toISOString(),
        greeting: this.buildGreeting(tz),
        user: {
          id: null,
          name: null,
          first_name: null,
          last_name: null,
          avatar: null,
        },
        routines: { total: 0, completed: 0, remaining: 0, percent: 0 },
        meditation_minutes: 0,
        mood: { score: null, entry_id: null },
        meta: { generated_at: new Date().toISOString() },
      };
    }

    const greeting = this.buildGreeting(tz);

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
      routines: { total, completed, remaining, percent },
      meditation_minutes: meditationMinutes,
      mood: { score: moodScore, entry_id: todayMood ? todayMood.id : null },
      meta: { generated_at: new Date().toISOString() },
    };
  }

  private buildGreeting(tz: string) {
    const hour = dayjs().tz(tz).hour();
    let partOfDay = 'Day';
    if (hour < 5) partOfDay = 'Night';
    else if (hour < 12) partOfDay = 'Morning';
    else if (hour < 17) partOfDay = 'Afternoon';
    else partOfDay = 'Evening';
    return { partOfDay, message: `Good ${partOfDay}` };
  }
}
