import { Injectable } from '@nestjs/common';
import { CreateHabitDto } from './dto/create-habit.dto';
import { UpdateHabitDto } from './dto/update-habit.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { HabitCategory, $Enums } from '@prisma/client';

@Injectable()
export class HabitService {
  constructor(private prisma: PrismaService) {}

  async createHabit(userId: any, createHabitDto: CreateHabitDto) {
    try {
      if (!userId) {
        return { message: 'User not found', status: false };
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

      // Normalize preferred_time: accept either enum key or mapped label
      let preferredTimeKey: $Enums.PreferredTime | undefined = undefined;
      if (createHabitDto.preferred_time) {
        const v = createHabitDto.preferred_time;
        const labelToKey: Record<string, $Enums.PreferredTime> = {
          'Morning (6-10am)': 'Morning',
          'Afternoon (10am-2pm)': 'Afternoon',
          'Evening (2pm-6pm)': 'Evening',
          'Night (6pm-10pm)': 'Night',
        };
        const possibleKeys = new Set<$Enums.PreferredTime>([
          'Morning',
          'Afternoon',
          'Evening',
          'Night',
        ]);
        preferredTimeKey = possibleKeys.has(v as any)
          ? (v as $Enums.PreferredTime)
          : labelToKey[v];
      }

      const habit = await this.prisma.habit.create({
        data: {
          habit_name: createHabitDto.habit_name,
          description: createHabitDto.description,
          category: createHabitDto.category as HabitCategory,
          frequency: createHabitDto.frequency as unknown as $Enums.Frequency,
          preferred_time: preferredTimeKey,
          reminder_time: createHabitDto.reminder_time,
          duration: createHabitDto.duration,
          user: { connect: { id: userId } },
        },
      });

      return { message: 'Habit created successfully', status: true, habit };
    } catch (error) {
      return { message: 'Error creating habit', status: false, error };
    }
  }

  async getAllReminders(userId: any) {
    try {
      if (!userId) {
        return { message: 'User not found', status: false };
      }

      const reminders = await this.prisma.habit.findMany({
        where: { user_id: userId },
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
        where: { user_id: userId, status: 1 },
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

      const habit = await this.prisma.habit.findUnique({
        where: { id: habitId, user_id: userId },
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

  findAll() {
    return `This action returns all habit`;
  }

  findOne(id: number) {
    return `This action returns a #${id} habit`;
  }

  update(id: number, updateHabitDto: UpdateHabitDto) {
    return `This action updates a #${id} habit`;
  }

  remove(id: number) {
    return `This action removes a #${id} habit`;
  }
}
