import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationService as AppNotificationService } from '../application/notification/notification.service';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  normalizePreferred,
  validateReminderAgainstPreferred,
  getReminderSlots,
} from 'src/common/helper/preferred-time.util';

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class RemindersService {
  constructor(
    private appNotification: AppNotificationService,
    private prisma: PrismaService,
  ) {}

  // Helpers
  private normalizeTime(raw?: string) {
    if (!raw) return undefined;
    const trimmed = raw.trim();
    const m = trimmed.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) return `${m[1]}:${m[2]}:${m[3] ?? '00'}`;
    const dt = trimmed.match(/T(\d{2}:\d{2}:\d{2})/);
    return dt ? dt[1] : trimmed;
  }

  private normalizeDays(input?: string[] | string) {
    if (!input) return null;
    const arr = Array.isArray(input) ? input : String(input).split(',');
    const allow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const map: Record<string, string> = {
      mon: 'Mon',
      monday: 'Mon',
      tue: 'Tue',
      tuesday: 'Tue',
      wed: 'Wed',
      wednesday: 'Wed',
      thu: 'Thu',
      thursday: 'Thu',
      fri: 'Fri',
      friday: 'Fri',
      sat: 'Sat',
      saturday: 'Sat',
      sun: 'Sun',
      sunday: 'Sun',
    };
    const norm = arr
      .map((s) =>
        String(s || '')
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean)
      .map(
        (s) =>
          map[s] || (s.length >= 3 ? s[0].toUpperCase() + s.slice(1, 3) : s),
      )
      .filter((s) => allow.includes(s));
    const uniq = Array.from(new Set(norm));
    return uniq.length ? uniq.join(',') : null;
  }

  private dowLabelInTz(d: Date, tz?: string) {
    const z = tz || 'UTC';
    return dayjs(d).tz(z).format('ddd'); // Mon, Tue, ...
  }

  private allDaysCSV = 'Mon,Tue,Wed,Thu,Fri,Sat,Sun';

  private daysForFrequency(freq?: string | null, tz?: string): string | null {
    if (!freq) return this.allDaysCSV;
    switch (freq) {
      case 'Daily':
        return this.allDaysCSV;
      case 'Weekdays':
        return 'Mon,Tue,Wed,Thu,Fri';
      case 'Weekends':
        return 'Sat,Sun';
      case 'Weekly': {
        // Choose the current day in the provided timezone as the weekly day
        const todayLabel = this.dowLabelInTz(new Date(), tz);
        return todayLabel; // single day
      }
      default:
        return this.allDaysCSV;
    }
  }

  private buildScheduledAt(
    dateYYYYMMDD?: string,
    timeHHMMSS?: string,
    tz?: string,
  ): Date | null {
    if (!dateYYYYMMDD || !timeHHMMSS) return null;
    const zone = tz || 'UTC';
    const dt = dayjs
      .tz(`${dateYYYYMMDD} ${timeHHMMSS}`, 'YYYY-MM-DD HH:mm:ss', zone)
      .utc();
    return dt.toDate();
  }

  // Set reminders for habit or routine (common page flow)
  async setReminders(
    userId: string,
    body: {
      reminder_time: string;
      preferred_time?: string;
      habit_id?: string;
      routine_id?: string;
      date?: string;
      tz?: string;
      days?: string[] | string;
      name?: string;
    },
  ) {
    if (!userId) throw new BadRequestException('User ID is required');
    const {
      reminder_time,
      preferred_time,
      habit_id,
      routine_id,
      // date (ignored)
      date,
      tz,
      // days (ignored)
      days,
      name,
    } = body || ({} as any);

    if (!reminder_time)
      throw new BadRequestException('reminder_time is required');
    if (!habit_id && !routine_id)
      throw new BadRequestException('Provide habit_id or routine_id');
    if (habit_id && routine_id)
      throw new BadRequestException(
        'Provide only one of habit_id or routine_id',
      );

    const prefKey = normalizePreferred(preferred_time);
    if (prefKey) validateReminderAgainstPreferred(reminder_time, prefKey);

    const time = this.normalizeTime(reminder_time);
    const window = prefKey ? (prefKey as string).toLowerCase() : undefined;

    // Determine target type and compute scheduling rules per requirements
    let daysStr: string | null = null;
    let scheduled_at: Date | null = null;

    // Auto label & frequency-based days for Habit reminders
    let label = name || null;
    if (habit_id) {
      const h = await this.prisma.habit.findFirst({
        where: { id: habit_id, user_id: userId },
      });
      if (!h) throw new NotFoundException('Habit not found');
      if (!label && h.habit_name) label = h.habit_name;
      daysStr = this.daysForFrequency(h.frequency as any, tz);
      scheduled_at = null;
    }

    if (routine_id) {
      if (!label) label = 'Routine Reminder';
      if (!time) throw new BadRequestException('reminder_time is required');
      const z = tz || 'UTC';
      const todayInTz = dayjs().tz(z).format('YYYY-MM-DD');
      scheduled_at = this.buildScheduledAt(todayInTz, time, z);
      daysStr = null; // not used
    }

    // Prevent duplicate time slots per user (only one active reminder at a given time)
    const existingReminder = await this.prisma.reminders.findFirst({
      where: {
        user_id: userId,
        active: true,
        time: time || null,
      },
    });

    if (existingReminder) {
      return {
        success: false,
        message: 'Already have a reminder at that time',
      };
    }

    const created = await this.prisma.reminders.create({
      data: {
        user_id: userId,
        habit_id: habit_id || null,
        routine_id: routine_id || null,
        name: label,
        time: time || null,
        days: daysStr,
        tz: tz || 'UTC',
        window: window,
        active: true,
        scheduled_at,
      },
    });

    if (habit_id && time) {
      await this.prisma.habit
        .update({
          where: { id: habit_id },
          data: {
            reminder_time: time,
            preferred_time: (prefKey as any) ?? undefined,
          },
        })
        .catch(() => {});
    }
    if (routine_id && scheduled_at) {
      await this.prisma.routine
        .update({
          where: { id: routine_id },
          data: { remind_at: scheduled_at },
        })
        .catch(() => {});
    }
    return { success: true, reminder: created };
  }

  async getAllReminders(userId: string) {
    if (!userId) throw new BadRequestException('User not found');

    const items = await this.prisma.reminders.findMany({
      where: { user_id: userId },
      orderBy: [{ active: 'desc' }, { created_at: 'desc' }],
    });
    return { success: true, reminders: items };
  }

  async getUpcomingReminders(userId: string) {
    if (!userId) throw new BadRequestException('User not found');

    const now = new Date();

    const items = await this.prisma.reminders.findMany({
      where: { user_id: userId, active: true },
    });

    const today = dayjs.utc(now).format('YYYY-MM-DD');

    const upcoming = items
      .map((r) => {
        let when: Date | null = r.scheduled_at || null;
        if (!when && r.time) {
          const t = this.normalizeTime(r.time);
          const z = r.tz || 'UTC';
          const dayInTz = dayjs(now).tz(z).format('YYYY-MM-DD');
          const dow = dayjs(now).tz(z).format('ddd');
          const allow = r.days
            ? r.days.split(',')
            : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
          if (!allow.includes(dow)) return null;
          when = this.buildScheduledAt(dayInTz, t!, z);
        }
        if (!when) return null;
        if (dayjs.utc(when).format('YYYY-MM-DD') !== today) return null;
        if (when < now) return null;
        return {
          id: r.id,
          name: r.name || (r.habit_id ? 'Habit' : 'Routine'),
          time: r.time,
          scheduled_at: when,
          routine_id: r.routine_id,
          habit_id: r.habit_id,
        };
      })
      .filter(Boolean)
      .sort(
        (a: any, b: any) =>
          +new Date(a.scheduled_at) - +new Date(b.scheduled_at),
      )
      .slice(0, 3);
    return { success: true, coming_up_today: upcoming };
  }

  getReminderSlots(preferred: string) {
    return getReminderSlots(preferred);
  }

  async turnOffOnReminder(userId: string, id: string) {
    const r = await this.prisma.reminders.findFirst({
      where: { id, user_id: userId },
    });
    if (!r) throw new NotFoundException('Reminder not found');
    const updated = await this.prisma.reminders.update({
      where: { id },
      data: { active: !r.active, updated_at: new Date() },
    });
    return { success: true, reminder: updated };
  }

  async editReminder(userId: string, id: string, dto: UpdateReminderDto) {
    const r = await this.prisma.reminders.findFirst({
      where: { id, user_id: userId },
    });

    if (!r) throw new NotFoundException('Reminder not found');

    const prefRaw = (dto as any).preferred_time ?? (dto as any).window;
    const prefKey = normalizePreferred(prefRaw);

    const incomingTimeRaw =
      (dto as any).time ?? (dto as any).reminder_time ?? undefined;
    const time = incomingTimeRaw ? this.normalizeTime(incomingTimeRaw) : r.time;
    if (prefKey && time) validateReminderAgainstPreferred(time, prefKey);

    const daysStr =
      (dto as any).days !== undefined
        ? this.normalizeDays((dto as any).days)
        : r.days;
    const tz = (dto as any).tz || r.tz || 'UTC';

    const window = prefKey ? (prefKey as string).toLowerCase() : r.window;

    let scheduled_at = r.scheduled_at;

    // Prevent duplicate time slots per user (exclude current reminder id)
    const existingReminder = await this.prisma.reminders.findFirst({
      where: {
        user_id: userId,
        active: true,
        time: time || null,
        id: { not: id },
      },
    });

    if (existingReminder) {
      return {
        success: false,
        message: 'Already have a reminder at that time',
      };
    }

    if ((dto as any).date && time)
      scheduled_at = this.buildScheduledAt((dto as any).date, time, tz);

    const updated = await this.prisma.reminders.update({
      where: { id: id },
      data: {
        name: (dto as any).name ?? r.name,
        time,
        days: daysStr,
        tz,
        window,
        scheduled_at,
        updated_at: new Date(),
      },
    });
    return { success: true, reminder: updated };
  }

  async deleteReminder(userId: string, id: string) {
    const r = await this.prisma.reminders.findFirst({
      where: { id, user_id: userId },
    });
    if (!r) throw new NotFoundException('Reminder not found');
    await this.prisma.reminders.delete({ where: { id } });
    return { success: true };
  }
}
