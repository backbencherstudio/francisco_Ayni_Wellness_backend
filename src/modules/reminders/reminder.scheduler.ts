import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService as AppNotificationService } from '../application/notification/notification.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const dayjs = require('dayjs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const utc = require('dayjs/plugin/utc');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

// Runs every minute to deliver due reminders (habits + routines) from central Reminders table
@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);
  constructor(
    private prisma: PrismaService,
    private appNotification: AppNotificationService,
  ) {}

  private minuteBucket(d: Date) {
    const x = new Date(d);
    x.setSeconds(0, 0);
    return x;
  }

  private isDue(scheduledAt: Date, now: Date) {
    // due if scheduledAt <= now and within the last 10 minutes (grace window)
    const diffMs = now.getTime() - scheduledAt.getTime();
    return diffMs >= 0 && diffMs <= 10 * 60 * 1000; // 10 min window
  }

  private parseTimeHHMM(time?: string | null): string | null {
    if (!time) return null;
    const m = time.trim().match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    const hh = m[1];
    const mm = m[2];
    const ss = m[3] ?? '00';
    return `${hh}:${mm}:${ss}`;
  }

  private computeNextOccurrence(rem: { time?: string | null; days?: string | null; tz?: string | null }, fromDate?: Date) {
    const time = this.parseTimeHHMM(rem.time || undefined);
    if (!time) return null;
    const tz = rem.tz || 'UTC';
    const allowed = rem.days ? (rem.days.split(',').map((s) => s.trim()).filter(Boolean)) : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    let cursor = dayjs(fromDate ?? new Date()).tz(tz);
    for (let i = 0; i < 8; i++) {
      const targetDay = cursor.format('ddd');
      const candidate = dayjs.tz(`${cursor.format('YYYY-MM-DD')} ${time}`, 'YYYY-MM-DD HH:mm:ss', tz);
      const inAllowed = allowed.includes(targetDay);
      if (inAllowed && candidate.isAfter(dayjs())) return candidate.utc().toDate();
      cursor = cursor.add(1, 'day').hour(0).minute(0).second(0).millisecond(0);
    }
    const fallback = dayjs(fromDate ?? new Date()).tz(tz).add(1, 'day');
    return dayjs.tz(`${fallback.format('YYYY-MM-DD')} ${time}`, 'YYYY-MM-DD HH:mm:ss', tz).utc().toDate();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async run() {
    const now = new Date();
    const nowBucket = this.minuteBucket(now);
    try {
      // Fetch active reminders with scheduled_at not null and not already triggered recently
      const reminders = await this.prisma.reminders.findMany({
        where: {
          active: true,
          scheduled_at: { not: null, lte: now },
        },
        orderBy: { scheduled_at: 'asc' },
        take: 200,
      });

      for (const r of reminders) {
        if (!r.user_id || !r.scheduled_at) continue;
        // Skip if already triggered at or after this minute
        if (r.last_triggered_at && r.last_triggered_at >= nowBucket) continue;
        if (!this.isDue(r.scheduled_at, now)) continue;

        const title = r.name || (r.habit_id ? 'Habit Reminder' : r.routine_id ? 'Routine Reminder' : 'Reminder');
        const text = r.habit_id
          ? `${title}: It’s time for your habit.`
          : r.routine_id
          ? `${title}: Your routine is scheduled now.`
          : `${title}`;

        await this.appNotification.createAndDispatch({
          receiver_id: r.user_id,
          text,
          type: 'package',
          entity_id: r.routine_id || r.habit_id || undefined,
        });

        // Determine reschedule vs one-time
        let dataUpdate: any = { last_triggered_at: nowBucket, updated_at: now };
        const isRecurring = !!r.time; // time present implies recurrence
        if (isRecurring) {
          const next = this.computeNextOccurrence({ time: r.time, days: r.days, tz: r.tz }, new Date(now.getTime() + 60000));
          if (next) dataUpdate.scheduled_at = next;
        } else {
          // one-time: deactivate after firing
          dataUpdate.active = false;
        }
        await this.prisma.reminders.update({ where: { id: r.id }, data: dataUpdate });
      }

      // Fallback path for legacy habit reminders without Reminders rows (using Habit.reminder_time & frequency)
      await this.legacyHabitPass(now);
    } catch (err) {
      this.logger.error('Reminder scheduler error', err as any);
    }
  }

  private async legacyHabitPass(now: Date) {
    // Pick habits that have reminder_time set and status=1; compute due within this minute
    const habits = await this.prisma.habit.findMany({
      where: { status: 1, deleted_at: null, reminder_time: { not: null } },
      select: { id: true, user_id: true, reminder_time: true, frequency: true, created_at: true },
      take: 500,
    });
    const hh = now.getUTCHours().toString().padStart(2, '0');
    const mm = now.getUTCMinutes().toString().padStart(2, '0');
    const match = `${hh}:${mm}`;
    for (const h of habits) {
      if (!h.user_id || !h.reminder_time) continue;
      // Normalize stored time to HH:MM comparison
      const tm = h.reminder_time.slice(0, 5);
      if (tm !== match) continue;
      if (!this.frequencyMatches(h.frequency as any, now, h.created_at)) continue;

      await this.appNotification.createAndDispatch({
        receiver_id: h.user_id,
        text: 'Habit Reminder: It’s time for your habit.',
        type: 'package',
        entity_id: h.id,
      });
      // No last_triggered tracking for legacy path; acceptable as a best-effort fallback
    }
  }

  private frequencyMatches(freq: string | null, date: Date, createdAt?: Date | null) {
    if (!freq || freq === 'Daily') return true;
    const dow = date.getUTCDay();
    if (freq === 'Weekdays') return dow !== 0 && dow !== 6;
    if (freq === 'Weekends') return dow === 0 || dow === 6;
    if (freq === 'Weekly') {
      const createdDow = createdAt ? new Date(createdAt).getUTCDay() : dow;
      return dow === createdDow;
    }
    return true;
  }
}
