import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateHabitDto } from './dto/create-habit.dto';
import { UpdateHabitDto } from './dto/update-habit.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { HabitCategory, $Enums } from '@prisma/client';
import { normalizePreferred, validateReminderAgainstPreferred, getReminderSlots } from './preferred-time.util';
import { CompleteHabitDto } from './dto/complete-habit.dto';
import { startOfDay, subDays } from 'date-fns';

@Injectable()
export class HabitService {
  constructor(private prisma: PrismaService) {}

  // --- Helpers -----------------------------------------------------------
  private dayBucket(date: Date) { return startOfDay(date); }
  private prismaAny() { return this.prisma as any; }

  async getReminderSlots(preferredRaw: string) { return getReminderSlots(preferredRaw); }

  async createHabit(userId: any, createHabitDto: CreateHabitDto) {
    try {
      if (!userId) {
        return { message: 'User not found', status: false };
      }

      // Ensure the user actually exists in the current database (avoids Prisma P2025 connect error)
      const userExists = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!userExists) {
        return { message: 'User not found (id does not exist in DB)', status: false, code: 'USER_NOT_FOUND' };
      }

      const existingHabit = await this.prisma.habit.findFirst({
        where: {
          user_id: userId,
          habit_name: createHabitDto.habit_name,
          reminder_time: createHabitDto.reminder_time,
        },
      });
      if (existingHabit) {
        return { message: 'Habit already exists', status: false };
      }

      const existingReminder = await this.prisma.habit.findFirst({
        where: {
          user_id: userId,
          reminder_time: createHabitDto.reminder_time,
        },
      });
      if (existingReminder) {
        return {
          message: 'Reminder time already used for another habit',
          status: false,
        };
      }

      // Normalize preferred_time: accept either enum key or mapped label
  const preferredTimeKey = normalizePreferred(createHabitDto.preferred_time);

      // Validate reminder within window if preferred provided
      if (preferredTimeKey && createHabitDto.reminder_time) {
        validateReminderAgainstPreferred(createHabitDto.reminder_time, preferredTimeKey);
      }

      // Normalize reminder_time to HH:MM:SS for storage
      let normalizedReminder: string | undefined = createHabitDto.reminder_time;
      if (normalizedReminder) {
        const isoMatch = normalizedReminder.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
        if (isoMatch) {
          const hh = isoMatch[1];
            const mm = isoMatch[2];
            const ss = isoMatch[3] ?? '00';
            normalizedReminder = `${hh}:${mm}:${ss}`;
        } else {
          // If full datetime provided, extract time part
          const dtMatch = normalizedReminder.match(/T(\d{2}:\d{2}:\d{2})/);
          if (dtMatch) normalizedReminder = dtMatch[1];
        }
      }

      const habit = await this.prisma.habit.create({
        data: {
          habit_name: createHabitDto.habit_name,
          description: createHabitDto.description,
          category: createHabitDto.category as HabitCategory,
          frequency: createHabitDto.frequency as unknown as $Enums.Frequency,
          preferred_time: preferredTimeKey,
          reminder_time: normalizedReminder,
          duration: createHabitDto.duration,
          user: { connect: { id: userId } },
        },
      });

      return { message: 'Habit created successfully', status: true, habit };
    } catch (error: any) {
      if (error?.code === 'P2025') {
        return {
          message: 'Related record not found (likely user missing). Please ensure the authenticated user exists in the database.',
          status: false,
          code: 'RELATION_NOT_FOUND',
          meta: error.meta,
        };
      }
      return { message: 'Error creating habit', status: false, error };
    }
  }

  async getAllReminders(userId: any) {
    try {
      if (!userId) {
        return { message: 'User not found', status: false };
      }

      const reminders = await this.prisma.habit.findMany({
        where: { user_id: userId, deleted_at: null },
        select: {
          id: true,
          habit_name: true,
          reminder_time: true,
          status: true,
          frequency: true,
        },
      });

      console.log('Fetched reminders:', reminders);

      return {
        message: 'Reminders fetched successfully',
        status: true,
        reminders,
      };
    } catch (error) {
      return { message: 'Error fetching reminders', status: false, error };
    }
  }

  async getUpcomingReminders(userId: any, windowMinutes?: number) {
    try {
      if (!userId) {
        return { message: 'User not found', status: false };
      }

      const now = new Date();
      // Default window: next 24 hours (today's upcoming)
      const effectiveWindowMinutes = windowMinutes || 24 * 60;
      const windowMs = effectiveWindowMinutes * 60 * 1000;

      const rawHabits = await this.prisma.habit.findMany({
        where: { user_id: userId, status: 1, deleted_at: null },
        select: {
          id: true,
          habit_name: true,
          reminder_time: true,
          status: true,
          frequency: true,
          created_at: true,
        },
      });

      console.log('rawHabits:', rawHabits);

      const parseTimeString = (timeStr: string): Date | null => {
        if (!timeStr) return null;
        // Expect formats like HH:mm or HH:mm:ss (24h). Trim & basic validation.
        const parts = timeStr.trim().split(':');
        if (parts.length < 2) return null;
        const [hhStr, mmStr, ssStr] = parts;
        const h = Number(hhStr);
        const m = Number(mmStr);
        const s = ssStr ? Number(ssStr) : 0;
        if (
          Number.isNaN(h) ||
          Number.isNaN(m) ||
          Number.isNaN(s) ||
          h < 0 ||
          h > 23 ||
          m < 0 ||
          m > 59 ||
          s < 0 ||
          s > 59
        ) {
          return null;
        }
        const candidate = new Date(now);
        candidate.setHours(h, m, s, 0);
        // If time already passed today, next occurrence is tomorrow.
        if (candidate.getTime() < now.getTime()) {
          candidate.setDate(candidate.getDate() + 1);
        }
        return candidate;
      };

      const nextOccurrenceForHabit = (
        h: (typeof rawHabits)[number],
      ): Date | null => {
        if (!h.reminder_time) return null;
        let candidate = parseTimeString(h.reminder_time);
        if (!candidate) return null;

        // Helper to advance candidate by one day keeping time
        const advanceOneDay = () => {
          candidate!.setDate(candidate!.getDate() + 1);
        };

        const habitCreatedDow = h.created_at
          ? new Date(h.created_at).getDay()
          : candidate.getDay();

        const isWeekday = (d: Date) => {
          const dow = d.getDay();
          return dow !== 0 && dow !== 6; // Mon-Fri
        };
        const isWeekend = (d: Date) => {
          const dow = d.getDay();
          return dow === 0 || dow === 6; // Sun(0) or Sat(6)
        };

        const freq = (h.frequency || 'Daily') as string;

        // Adjust candidate forward until it matches frequency constraints
        let safety = 0; // avoid infinite loop
        while (safety < 10) {
          if (candidate.getTime() < now.getTime()) {
            advanceOneDay();
            safety++;
            continue;
          }
          if (freq === 'Daily') break;
          if (freq === 'Weekly') {
            if (candidate.getDay() !== habitCreatedDow) {
              advanceOneDay();
              safety++;
              continue;
            }
            break;
          }
          if (freq === 'Weekdays') {
            if (!isWeekday(candidate)) {
              advanceOneDay();
              safety++;
              continue;
            }
            break;
          }
          if (freq === 'Weekends') {
            if (!isWeekend(candidate)) {
              advanceOneDay();
              safety++;
              continue;
            }
            break;
          }
          // Unknown frequency: treat as daily
          break;
        }
        return candidate;
      };

      const upcoming = rawHabits
        .map((h) => {
          const target = nextOccurrenceForHabit(h);
          if (!target) return null;
          const diff = target.getTime() - now.getTime();
          return diff >= 0 && diff <= windowMs
            ? { ...h, _target: target, _diffMs: diff }
            : null;
        })
        .filter(
          (
            x,
          ): x is (typeof rawHabits)[number] & {
            _target: Date;
            _diffMs: number;
          } => x !== null,
        )
        .sort((a, b) => a._diffMs - b._diffMs)
        .map(({ _target, _diffMs, created_at, ...rest }) => ({
          ...rest,
          next_occurrence: _target.toISOString(),
          minutes_until: Math.round(_diffMs / 60000),
          within_window: true,
        }));

      // If nothing in the current window, fall back to the next soonest reminders (up to 5) outside the window
      let reminders = upcoming;
      if (reminders.length === 0) {
        const fallback = rawHabits
          .map((h) => {
            const target = nextOccurrenceForHabit(h);
            if (!target) return null;
            const diff = target.getTime() - now.getTime();
            return diff >= 0 ? { ...h, _target: target, _diffMs: diff } : null;
          })
          .filter(
            (
              x,
            ): x is (typeof rawHabits)[number] & {
              _target: Date;
              _diffMs: number;
            } => x !== null,
          )
          .sort((a, b) => a._diffMs - b._diffMs)
          .slice(0, 5)
          .map(({ _target, _diffMs, created_at, ...rest }) => ({
            ...rest,
            next_occurrence: _target.toISOString(),
            minutes_until: Math.round(_diffMs / 60000),
            within_window: false,
          }));
        reminders = fallback;
      }

      return {
        message: 'Upcoming reminders fetched successfully',
        status: true,
        window_minutes: effectiveWindowMinutes,
        reminders,
      };
    } catch (error) {
      return {
        message: 'Error fetching upcoming reminders',
        status: false,
        error,
      };
    }
  }

  async turnOffOnReminder(userId: any, habitId: string) {
    try {
      if (!userId) {
        return { message: 'User not found', status: false };
      }

      const habit = await this.prisma.habit.findFirst({
        where: { id: habitId, user_id: userId, deleted_at: null },
      });
      if (!habit) {
        return { message: 'Habit not found', status: false };
      }

      const newStatus = habit.status === 1 ? 0 : 1;
      await this.prisma.habit.update({
        where: { id: habitId },
        data: { status: newStatus },
      });

      return {
        message: `Habit reminder turned ${newStatus === 1 ? 'on' : 'off'}`,
        status: true,
      };
    } catch (error) {
      return {
        message: 'Error turning off/on reminder',
        status: false,
        error,
      };
    }
  }


  // --- Habit Completion --------------------------------------------------
  async completeHabit(userId: string, habitId: string, dto: CompleteHabitDto) {
    if (!userId) throw new BadRequestException('User required');
    const prismaAny: any = this.prisma as any;
    try {
  const habit = await prismaAny.habit.findFirst({ where: { id: habitId, user_id: userId, deleted_at: null } });
      if (!habit) throw new NotFoundException('Habit not found');
      const today = this.dayBucket(new Date());
      if (dto.undo) {
        if (prismaAny.habitLog) {
          await prismaAny.habitLog.deleteMany({ where: { habit_id: habitId, day: today } });
        }
        const streak = await this.computeHabitStreak(userId, habitId);
        return { success: true, undone: true, streak };
      }
      let existing: any = null;
      if (prismaAny.habitLog?.findUnique) {
        existing = await prismaAny.habitLog.findUnique({ where: { habit_id_day: { habit_id: habitId, day: today } } }).catch(()=>null);
      }
      // Fallback if compound unique not present
      if (!existing && prismaAny.habitLog?.findFirst) {
        existing = await prismaAny.habitLog.findFirst({ where: { habit_id: habitId, day: today } }).catch(()=>null);
      }
      if (existing) {
        if (dto.duration_minutes || dto.note) {
          const updated = await prismaAny.habitLog.update({
            where: existing.id ? { id: existing.id } : { habit_id_day: { habit_id: habitId, day: today } },
            data: {
              duration_minutes: dto.duration_minutes ?? existing.duration_minutes,
              note: dto.note ?? existing.note,
              updated_at: new Date(),
            },
          }).catch(()=>existing); // if update fails, return existing
          const streak = await this.computeHabitStreak(userId, habitId);
          return { success: true, already_completed: true, log: updated, streak };
        }
        const streak = await this.computeHabitStreak(userId, habitId);
        return { success: true, already_completed: true, log: existing, streak };
      }
      if (!prismaAny.habitLog?.create) throw new Error('HabitLog model not available on Prisma client');
      const log = await prismaAny.habitLog.create({ data: { user_id: userId, habit_id: habitId, day: today, duration_minutes: dto.duration_minutes, note: dto.note } });
      const streak = await this.computeHabitStreak(userId, habitId);
      return { success: true, log, streak };
    } catch (err) {
      return { success: false, message: 'Error completing habit', error: err instanceof Error ? err.message : err };
    }
  }

  private async computeHabitStreak(userId: string, habitId: string, maxDays = 365) {
    const prismaAny: any = this.prisma as any;
    const logs = await prismaAny.habitLog.findMany({ where: { habit_id: habitId, user_id: userId }, orderBy: { day: 'desc' }, take: maxDays });
    if (!logs.length) return 0;
    let streak = 0;
    let cursor = this.dayBucket(new Date());
    const dayMs = 86400000;
    const daySet = new Set(logs.map(l=>this.dayBucket(new Date(l.day)).getTime()));
    for (let i=0;i<maxDays;i++) {
      if (daySet.has(cursor.getTime())) streak++; else break;
      cursor = new Date(cursor.getTime() - dayMs);
    }
    return streak;
  }

  async getHabitsToday(userId: string) {
    const prismaAny: any = this.prisma as any;
    const today = this.dayBucket(new Date());
  const habits = await prismaAny.habit.findMany({ where: { user_id: userId, status: 1, deleted_at: null }, orderBy: { created_at: 'asc' } });
    if (!habits.length) return { success: true, habits: [] };
    const logs = await prismaAny.habitLog.findMany({ where: { user_id: userId, day: today } });
    const logMap = new Map<string, any>(logs.map(l=>[l.habit_id,l]));
    const enriched = await Promise.all(habits.map(async h => ({
      id: h.id,
      habit_name: h.habit_name,
      description: h.description,
      frequency: h.frequency,
      category: h.category,
      reminder_time: h.reminder_time,
      completed: logMap.has(h.id),
      log: logMap.get(h.id) || null,
      streak: await this.computeHabitStreak(userId, h.id)
    })));
    return { success: true, habits: enriched };
  }

  async habitHistory(userId: string, habitId: string, days = 30) {
    const prismaAny: any = this.prisma as any;
    const from = subDays(new Date(), days-1); // inclusive
    const logs = await prismaAny.habitLog.findMany({ where: { user_id: userId, habit_id: habitId, day: { gte: this.dayBucket(from) } }, orderBy: { day: 'asc' } });
    return { success: true, habit_id: habitId, days, logs };
  }

  async summary(userId: string, rangeDays = 7) {
    const prismaAny: any = this.prisma as any;
    const from = this.dayBucket(subDays(new Date(), rangeDays-1));
  const habits = await prismaAny.habit.findMany({ where: { user_id: userId, status: 1, deleted_at: null } });
    const logs = await prismaAny.habitLog.findMany({ where: { user_id: userId, day: { gte: from } } });
    const logsByHabit: Record<string, number> = {};
    for (const l of logs) logsByHabit[l.habit_id] = (logsByHabit[l.habit_id]||0)+1;
    const totalActive = habits.length;
    const today = this.dayBucket(new Date()).getTime();
    const todayLogs = logs.filter(l=>this.dayBucket(new Date(l.day)).getTime() === today).length;
    // per-day completion rate last N days (completed habit entries / (totalActive * days))
    const completionRate = totalActive>0? (logs.length / (totalActive * rangeDays)) : 0;
    // overall streak: consecutive days with at least one log
    const daySet = new Set(logs.map(l=>this.dayBucket(new Date(l.day)).getTime()));
    let overallStreak = 0; let cursor = this.dayBucket(new Date()).getTime(); const dayMs=86400000;
    for (let i=0;i<400;i++){ if (daySet.has(cursor)) { overallStreak++; cursor -= dayMs; } else break; }
    const perHabit = habits.map(h=>({ habit_id: h.id, habit_name: h.habit_name, streak: logsByHabit[h.id]? undefined: 0 }));
    return { success: true, range_days: rangeDays, total_active: totalActive, completed_today: todayLogs, completion_rate: Number(completionRate.toFixed(2)), overall_streak: overallStreak };
  }

    // Browse by category: count active (status=1) non-deleted habits per category
    async browseByCategory(userId: string) {
      if (!userId) throw new BadRequestException('User required');
      // Use groupBy for existing categories
      const grouped = await this.prisma.habit.groupBy({
        where: { user_id: userId, deleted_at: null, status: 1 },
        by: ['category'],
        _count: { category: true },
      });
      const categoriesFixed = ['Meditation','SoundHealing','Journaling','Podcast'];
      const countsMap = new Map<string, number>();
      for (const g of grouped) if (g.category) countsMap.set(g.category, g._count.category);
      const categories = categoriesFixed.map(cat => ({
        category: cat === 'SoundHealing' ? 'Sound healing' : cat,
        key: cat,
        count: countsMap.get(cat) || 0
      }));
      return { success: true, categories };
    }

    // Get habits by a single category (active + not deleted)
    async getByCategory(userId: string, categoryRaw: string) {
      if (!userId) throw new BadRequestException('User required');
      if (!categoryRaw) return { success: false, message: 'Category required' };
      // Normalize: accept variants (sound-healing, sound_healing, Sound healing, etc.)
      const normalized = categoryRaw
        .trim()
        .replace(/[-_]/g, ' ')
        .toLowerCase();
      const mapping: Record<string,string> = {
        'meditation': 'Meditation',
        'sound healing': 'SoundHealing',
        'soundhealing': 'SoundHealing',
        'journaling': 'Journaling',
        'podcast': 'Podcast'
      };
      const enumValue = mapping[normalized];
      if (!enumValue) return { success: false, message: 'Invalid category', allowed: Object.values(mapping) };
      const prismaAny: any = this.prisma as any;
      const today = this.dayBucket(new Date());
      const habits = await prismaAny.habit.findMany({
        where: { user_id: userId, deleted_at: null, status: 1, category: enumValue },
        orderBy: { created_at: 'asc' }
      });
      if (!habits.length) return { success: true, category: enumValue, habits: [] };
      const logs = await prismaAny.habitLog.findMany({ where: { user_id: userId, day: today, habit_id: { in: habits.map(h=>h.id) } } });
      const logMap = new Map<string, any>(logs.map(l=>[l.habit_id,l]));
      const enriched = await Promise.all(habits.map(async h => ({
        id: h.id,
        habit_name: h.habit_name,
        description: h.description,
        reminder_time: h.reminder_time,
        frequency: h.frequency,
        category_key: h.category,
        category: h.category === 'SoundHealing' ? 'Sound healing' : h.category,
        completed_today: logMap.has(h.id),
        today_log: logMap.get(h.id) || null,
        streak: await this.computeHabitStreak(userId, h.id)
      })));
      return { success: true, category: enumValue, habits: enriched };
    }

  // Expose preferred time slots utility (could be reused by controller)
  listPreferredSlots(preferred: string) { return this.getReminderSlots(preferred); }

  // ---------------- Basic CRUD (single habit) ---------------------------
  private normalizeReminderTime(raw?: string): string | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim();
    // Accept HH:MM or HH:MM:SS
    const isoMatch = trimmed.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (isoMatch) {
      const hh = isoMatch[1];
      const mm = isoMatch[2];
      const ss = isoMatch[3] ?? '00';
      return `${hh}:${mm}:${ss}`;
    }
    // Extract from datetime
    const dtMatch = trimmed.match(/T(\d{2}:\d{2}:\d{2})/);
    if (dtMatch) return dtMatch[1];
    return trimmed; // fallback untouched
  }

  async findOne(userId: string, habitId: string) {
    if (!userId) throw new BadRequestException('User required');
    const prismaAny: any = this.prisma as any;
    const habit = await prismaAny.habit.findFirst({ where: { id: habitId, user_id: userId, deleted_at: null } });
    if (!habit) return { success: false, message: 'Habit not found' };
    const today = this.dayBucket(new Date());
    const log = await prismaAny.habitLog.findFirst({ where: { habit_id: habitId, user_id: userId, day: today } });
    const streak = await this.computeHabitStreak(userId, habitId);
    return { success: true, habit: { ...habit, completed_today: !!log, today_log: log || null, streak } };
  }

  async updateHabit(userId: string, habitId: string, dto: UpdateHabitDto) {
    if (!userId) throw new BadRequestException('User required');
    const existing = await this.prisma.habit.findFirst({ where: { id: habitId, user_id: userId, deleted_at: null } });
    if (!existing) return { success: false, message: 'Habit not found' };

    // Determine new preferred_time (normalize if provided)
    let preferred_time = existing.preferred_time as any;
    if (dto.preferred_time !== undefined) {
      preferred_time = normalizePreferred(dto.preferred_time) as any;
    }

    // Reminder time normalization & validation
    let reminder_time = existing.reminder_time;
    if (dto.reminder_time !== undefined) {
      const norm = this.normalizeReminderTime(dto.reminder_time);
      if (preferred_time && norm) {
        validateReminderAgainstPreferred(norm, preferred_time);
      }
      // Uniqueness: ensure no other habit for this user uses same reminder_time
      if (norm) {
        const conflict = await this.prisma.habit.findFirst({
          where: { user_id: userId, reminder_time: norm, id: { not: habitId }, deleted_at: null },
        });
        if (conflict) {
          throw new BadRequestException('Another habit already uses this reminder_time');
        }
      }
      reminder_time = norm;
    } else if (preferred_time && reminder_time) {
      // Validate existing reminder still fits new window
      validateReminderAgainstPreferred(reminder_time, preferred_time);
    }

    // Habit name + reminder uniqueness (optional: only check if habit_name or reminder_time changed)
    if ((dto.habit_name && dto.habit_name !== existing.habit_name) || (dto.reminder_time && dto.reminder_time !== existing.reminder_time)) {
      const duplicate = await this.prisma.habit.findFirst({
        where: {
          user_id: userId,
            habit_name: dto.habit_name ?? existing.habit_name,
            reminder_time: reminder_time,
            id: { not: habitId },
            deleted_at: null,
        },
      });
      if (duplicate) throw new BadRequestException('Habit with same name & reminder_time already exists');
    }

    const updated = await this.prisma.habit.update({
      where: { id: habitId },
      data: {
        habit_name: dto.habit_name ?? existing.habit_name,
        description: dto.description ?? existing.description,
        category: dto.category ?? existing.category,
        frequency: (dto.frequency as any) ?? existing.frequency,
        preferred_time: preferred_time ?? existing.preferred_time,
        reminder_time: reminder_time,
        duration: dto.duration ?? existing.duration,
        updated_at: new Date(),
      },
    });
    const streak = await this.computeHabitStreak(userId, habitId);
    return { success: true, message: 'Habit updated', habit: { ...updated, streak } };
  }

  async removeHabit(userId: string, habitId: string, hard = false) {
    if (!userId) throw new BadRequestException('User required');
    const existing = await this.prisma.habit.findFirst({ where: { id: habitId, user_id: userId, deleted_at: null } });
    if (!existing) return { success: false, message: 'Habit not found' };
    if (hard) {
      await this.prisma.habit.delete({ where: { id: habitId } });
      return { success: true, message: 'Habit permanently deleted' };
    }
    const soft = await this.prisma.habit.update({ where: { id: habitId }, data: { deleted_at: new Date(), status: 0, updated_at: new Date() } });
    return { success: true, message: 'Habit deleted (soft)', habit: soft };
  }
}
