import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { CreateHabitDto } from './dto/create-habit.dto';
import { UpdateHabitDto } from './dto/update-habit.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { HabitCategory, $Enums } from '@prisma/client';
import { CompleteHabitDto } from './dto/complete-habit.dto';
import { startOfDay, subDays, getDay } from 'date-fns';

@Injectable()
export class HabitService {
  constructor(private prisma: PrismaService) {}

  // --- Helpers -----------------------------------------------------------
  private dayBucket(date: Date) {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }
  private prismaAny() {
    return this.prisma as any;
  }

  // Reminder slots are no longer exposed from HabitService

  async createHabit(userId: any, createHabitDto: CreateHabitDto) {
    try {
      if (!userId) {
        return { message: 'User not found', status: false };
      }

      const userExists = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (!userExists) {
        return {
          message: 'User not found (id does not exist in DB)',
          status: false,
          code: 'USER_NOT_FOUND',
        };
      }

      const existingHabit = await this.prisma.habit.findFirst({
        where: {
          user_id: userId,
          habit_name: createHabitDto.habit_name,
          deleted_at: null,
        },
      });
      if (existingHabit)
        return { message: 'Habit already exists', status: false };

      const habit = await this.prisma.habit.create({
        data: {
          habit_name: createHabitDto.habit_name,
          description: createHabitDto.description,
          category: createHabitDto.category as HabitCategory,
          frequency: createHabitDto.frequency as unknown as $Enums.Frequency,
          duration: createHabitDto.duration,
          user: { connect: { id: userId } },
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      return { message: 'Habit created successfully', status: true, habit };
    } catch (error: any) {
      if (error?.code === 'P2025') {
        return {
          message:
            'Related record not found (likely user missing). Please ensure the authenticated user exists in the database.',
          status: false,
          code: 'RELATION_NOT_FOUND',
          meta: error.meta,
        };
      }
      return { message: 'Error creating habit', status: false, error };
    }
  }

  async getAllHabits(userId: string) {
    if (!userId) throw new BadRequestException('User required');

    const list = await this.prisma.habit.findMany({
      where: { user_id: userId, deleted_at: null },
      orderBy: { created_at: 'desc' },
    });
    return { success: true, count: list.length, habits: list };
  }

  async getHabitById(userId: string, habitId: string) {
    if (!userId) throw new BadRequestException('User required');
    if (!habitId) throw new BadRequestException('Habit ID required');

    const habit = await this.prisma.habit.findFirst({
      where: { id: habitId, user_id: userId, deleted_at: null },
    });

    if (!habit) throw new NotFoundException('Habit not found');

    return { success: true, habit };
  }

  async completeHabit(userId: string, habitId: string, dto: CompleteHabitDto) {
    if (!userId) throw new BadRequestException('User required');
    if (!habitId) throw new BadRequestException('Habit ID required');

    const habit = await this.prisma.habit.findFirst({
      where: { id: habitId, user_id: userId, deleted_at: null },
    });
    if (!habit) throw new NotFoundException('Habit not found');

    const today = this.dayBucket(new Date());

    if (dto?.undo) {
      try {
        const deleted = await (this.prisma as any).habitLog.delete({
          where: { habit_id_day: { habit_id: habitId, day: today } },
        });
        return {
          success: true,
          message: 'Completion undone for today',
          habit_id: habitId,
          day: today,
          completed: false,
        };
      } catch (e) {
        return {
          success: true,
          message: 'No completion found for today to undo',
          habit_id: habitId,
          day: today,
          completed: false,
        };
      }
    }

    const log = await (this.prisma as any).habitLog.upsert({
      where: { habit_id_day: { habit_id: habitId, day: today } },
      create: {
        user_id: userId,
        habit_id: habitId,
        day: today,
        duration_minutes: dto?.duration_minutes ?? null,
        note: dto?.note ?? null,
      },
      update: {
        duration_minutes: dto?.duration_minutes ?? habit.duration,
        note: dto?.note ?? null,
        completed_at: new Date(),
        updated_at: new Date(),
      },
    });

    return {
      success: true,
      message: 'Habit completed for today',
      habit_id: habitId,
      day: today,
      completed: true,
      log,
    };
  }

  async habitHistory(userId: string, habitId: string, days = 30) {
    const prismaAny: any = this.prisma as any;

    if (typeof days === 'number' && days <= 0) {
      const logs = await prismaAny.habitLog.findMany({
        where: { user_id: userId, habit_id: habitId },
        orderBy: { day: 'asc' },
      });
      return { success: true, habit_id: habitId, days: 0, logs };
    }

    const from = subDays(new Date(), (days as number) - 1); 

    const logs = await prismaAny.habitLog.findMany({
      where: {
        user_id: userId,
        habit_id: habitId,
        day: { gte: this.dayBucket(from) },
      },
      orderBy: { day: 'asc' },
    });
    return { success: true, habit_id: habitId, days, logs };
  }

  // ---------------- Basic CRUD (single habit) ---------------------------

  async updateHabit(userId: string, habitId: string, dto: UpdateHabitDto) {
    if (!userId) throw new BadRequestException('User required');

    const existing = await this.prisma.habit.findFirst({
      where: { id: habitId, user_id: userId, deleted_at: null },
    });

    if (!existing) return { success: false, message: 'Habit not found' };

    if (dto.habit_name && dto.habit_name !== existing.habit_name) {
      const duplicate = await this.prisma.habit.findFirst({
        where: {
          user_id: userId,
          habit_name: dto.habit_name,
          id: { not: habitId },
          deleted_at: null,
        },
      });

      if (duplicate) return { success: false, message: 'Habit already exists' };
    }

    const updated = await this.prisma.habit.update({
      where: { id: habitId },
      data: {
        habit_name: dto.habit_name ?? existing.habit_name,
        description: dto.description ?? existing.description,
        category: dto.category ?? existing.category,
        frequency: (dto.frequency as any) ?? existing.frequency,
        duration: dto.duration ?? existing.duration,
        updated_at: new Date(),
      },
    });
    return {
      success: true,
      message: 'Habit updated',
      habit: { ...updated },
    };
  }

  async removeHabit(userId: string, habitId: string, hard = false) {
    if (!userId) throw new BadRequestException('User required');

    const existing = await this.prisma.habit.findFirst({
      where: { id: habitId, user_id: userId, deleted_at: null },
    });

    if (!existing) return { success: false, message: 'Habit not found' };

    if (hard) {
      await (this.prisma as any).reminders.deleteMany({
        where: { habit_id: habitId },
      });
      await this.prisma.habit.delete({
        where: {
          id: habitId,
        },
      });

      return {
        success: true,
        message: 'Habit permanently deleted and reminders removed',
      };
    }

    await (this.prisma as any).reminders.deleteMany({
      where: { habit_id: habitId },
    });
    const soft = await this.prisma.habit.update({
      where: { id: habitId },
      data: { deleted_at: new Date(), status: 0, updated_at: new Date() },
    });
    return {
      success: true,
      message: 'Habit deleted (soft) and reminders removed',
      habit: soft,
    };
  }

  // ---------------- Today's Habits -------------------------------------
  private isDueToday(
    frequency?: $Enums.Frequency | null,
    today: Date = new Date(),
  ) {
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
  }

  async getTodayHabits(userId: string) {
    if (!userId) throw new BadRequestException('User required');
    const today = this.dayBucket(new Date());
    console.log('today date:', today);

    const habits = await this.prisma.habit.findMany({
      where: { user_id: userId, deleted_at: null, status: 1 },
      orderBy: { created_at: 'desc' },
    });

    const due = habits.filter((h) => this.isDueToday(h.frequency as any));
    const ids = due.map((h) => h.id);

    const logs = await (this.prisma as any).habitLog.findMany({
      where: { habit_id: { in: ids.length ? ids : ['_none_'] }, day: today },
    });
    const byHabit = new Map<string, any>();
    logs.forEach((l: any) => byHabit.set(l.habit_id, l));

    const reminders = await (this.prisma as any).reminders.findMany({
      where: { habit_id: { in: ids.length ? ids : ['_none_'] }, active: true },
      orderBy: { created_at: 'asc' },
    });
    const reminderTimeByHabit = new Map<string, string | null>();
    for (const r of reminders) {
      if (!reminderTimeByHabit.has(r.habit_id)) {
        reminderTimeByHabit.set(r.habit_id, r.time ?? null);
      }
    }

    const items = due.map((h) => {
      const log = byHabit.get(h.id);
      return {
        id: h.id,
        habit_name: h.habit_name,
        description: h.description,
        category: h.category,
        frequency: h.frequency,
        duration: h.duration,
        preferred_time: h.preferred_time,
        reminder_time: h.reminder_time ?? reminderTimeByHabit.get(h.id) ?? null,
        completed: !!log,
        log: log
          ? {
              id: log.id,
              completed_at: log.completed_at,
              duration_minutes: log.duration_minutes,
              note: log.note,
            }
          : null,
      };
    });

    return { success: true, date: today, count: items.length, habits: items };
  }
}
