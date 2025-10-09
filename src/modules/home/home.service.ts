import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { startOfDay } from 'date-fns';

interface HomeDashboardResponse {
  success: boolean;
  date: string; // ISO day start
  greeting: { partOfDay: string; message: string };
  user: { id: string; name: string | null; first_name: string | null; last_name: string | null; avatar: string | null };
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
    const dayStart = startOfDay(new Date());
    const nextDay = new Date(dayStart.getTime() + 86400000);

    // Fetch core data in parallel
    const [user, habits, logs, todayMood] = await Promise.all([
      prismaAny.user.findFirst({ where: { id: userId } }),
      prismaAny.habit.findMany({ where: { user_id: userId, status: 1, deleted_at: null } }),
      prismaAny.habitLog.findMany({ where: { user_id: userId, day: dayStart } }),
      prismaAny.moodEntry.findFirst({
        where: { user_id: userId, created_at: { gte: dayStart, lt: nextDay }, deleted_at: null },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    const totalHabits = habits.length;
    // logs are unique per habit per day (constraint in schema), so count = completed
    const completed = logs.length;
    const remaining = Math.max(0, totalHabits - completed);
    const percent = totalHabits > 0 ? Math.round((completed / totalHabits) * 100) : 0;

    // Build quick lookup of habit categories for meditation minutes
    const habitCategoryMap = new Map<string, string>(habits.map((h: any) => [h.id, h.category]));
    let meditationMinutes = 0;
    for (const l of logs) {
      const cat = habitCategoryMap.get(l.habit_id);
      if (cat === 'Meditation') {
        meditationMinutes += l.duration_minutes || 0;
      }
    }

    const moodScore = todayMood ? todayMood.score : null;

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
      routines: { total: totalHabits, completed, remaining, percent },
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
