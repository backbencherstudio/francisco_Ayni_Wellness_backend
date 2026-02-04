import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FirebaseStorageService } from '../firebase-storage/firebase-storage.service';
import { NotificationService as AppNotificationService } from '../application/notification/notification.service';
import { stat } from 'fs';

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class AiRoutinesService {
  constructor(
    private prisma: PrismaService,
    private gcs: FirebaseStorageService,
    private appNotification: AppNotificationService,
  ) {}

  private async getUserTimezone(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    return user?.timezone || 'UTC';
  }

  private dayRangeInTz(tz: string) {
    const start = dayjs().tz(tz).startOf('day');
    return { start: start.toDate(), end: start.add(1, 'day').toDate() };
  }

  async saveOnboarding(userId: string, preferences: any) {
    const profile = await this.prisma.userRoutineProfile.upsert({
      where: { user_id: userId },
      update: { preferences, onboarding_completed_at: new Date() },
      create: {
        user_id: userId,
        preferences,
        onboarding_completed_at: new Date(),
      },
    });
    return { success: true, profile };
  }

  async generateToday(userId: string, opts?: { moodCheckId?: string }) {
    const tz = await this.getUserTimezone(userId);
    const { start: today, end: nextDay } = this.dayRangeInTz(tz);

    const existing = await this.prisma.routine.findFirst({
      where: {
        user_id: userId,
        date: {
          gte: today,
          lt: nextDay,
        },
      },
    });
    if (existing) {
      return {
        success: true,
        message: 'Routine already exists for today',
        routine: existing,
      };
    }

    let latestMoodCheckId = opts?.moodCheckId || null;

    if (!latestMoodCheckId) {
      const latestCheck = await this.prisma.routineMoodCheck.findFirst({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        select: { id: true },
      });
      latestMoodCheckId = latestCheck?.id || null;
    }

    // Simplified plan: always 4 items (Meditation, SoundHealing, Journaling, Podcast)
    const items: Array<{
      type: 'Meditation' | 'SoundHealing' | 'Journaling' | 'Podcast';
      title: string;
      gcs_path?: string;
      content_type?: string;
      duration_min?: number;
      description?: string;
    }> = [];

    // Meditation (random from 'meditation' folder)
    const med = await this.pickRandom('meditation');
    if (med) {
      items.push({
        type: 'Meditation',
        title: 'Meditation',
        gcs_path: med.name,
        content_type: med.contentType || 'audio',
        duration_min: this.resolveDurationMinutesFromFile(med) ?? 10,
      });
    }

    // Sound Healing (random from 'sound_healing' folder)
    const sh = await this.pickRandom('sound_healing');
    if (sh) {
      items.push({
        type: 'SoundHealing',
        title: 'Sound Healing',
        gcs_path: sh.name,
        content_type: sh.contentType || 'audio',
        duration_min: this.resolveDurationMinutesFromFile(sh) ?? 10,
      });
    }

    // Journaling (random from 'journaling' folder; fallback to text-only prompt)
    const journaling = await this.pickRandom('journaling');
    if (journaling) {
      const meta = journaling?.customMetadata || {};
      items.push({
        type: 'Journaling',
        title:
          meta.title ||
          meta.name ||
          meta.prompt_title ||
          'Journaling',
        description:
          meta.prompt ||
          meta.description,
        gcs_path: journaling.name,
        content_type: journaling.contentType || 'text',
        duration_min: this.resolveDurationMinutesFromFile(journaling) ?? 10,
      });
    } else {
      items.push({
        type: 'Journaling',
        title: 'Journaling: Free Write',
        description: 'Write freely for 10 minutes about how you feel today.',
        duration_min: 10,
        content_type: 'text',
      });
    }

    const youtubeVideo = await this.pickRandomYoutubeVideo();

    if (youtubeVideo) {
      items.push({
        type: 'Podcast',
        title: youtubeVideo.title,
        gcs_path: `youtube:${youtubeVideo.videoId}`,
        content_type: 'video/youtube',
        duration_min: 15,
        description: youtubeVideo.description,
      });
    } else {
      const pod = await this.pickRandom('podcast');
      if (pod) {
        items.push({
          type: 'Podcast',
          title: 'Podcast',
          gcs_path: pod.name,
          content_type: pod.contentType || 'audio',
          duration_min: this.resolveDurationMinutesFromFile(pod) ?? 10,
        });
      }
    }

    // Fetch profile snapshot for future personalization/analytics
    const profile = await this.prisma.userRoutineProfile.findUnique({
      where: { user_id: userId },
    });
    const routine = await this.prisma.routine.create({
      data: {
        user_id: userId,
        date: today,
        status: 'generated',
        mood_check_id: latestMoodCheckId,
        profile_snapshot: profile?.preferences || undefined,
        items: {
          create: items.map((it, idx) => ({
            type: it.type as any,
            title: it.title,
            gcs_path: it.gcs_path,
            content_type: it.content_type,
            duration_min: it.duration_min,
            description: it.description,
            order: idx,
          })),
        },
      },
      include: { items: true },
    });

    try {
      await this.appNotification.createAndDispatch({
        receiver_id: userId,
        text: 'Your personalized routine is ready',
        type: 'package',
        entity_id: routine.id,
      });
    } catch {}

    return { success: true, routine };
  }

  private async pickRandom(prefix: string) {
    try {
      const files = await this.gcs.listPrefix(prefix);
      const valid = (files || []).filter(
        (f: any) => f && f.name && !f.name.endsWith('/'),
      );
      if (!valid.length) return null;
      const idx = Math.floor(Math.random() * valid.length);
      return valid[idx];
    } catch {
      return null;
    }
  }

  private async pickRandomYoutubeVideo() {
    const apiKey = process.env.YOUTUBE_API_KEY;
    const playlistId = process.env.YOUTUBE_PLAYLIST_ID;

    if (!apiKey || !playlistId) return null;

    try {
      // Fetch playlist items (max 50)
      const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${apiKey}`;

      const response = await fetch(url);
      const data: any = await response.json();

      if (!data.items || data.items.length === 0) return null;

      // Pick random
      const idx = Math.floor(Math.random() * data.items.length);
      const item = data.items[idx];
      const snippet = item.snippet;

      return {
        videoId: snippet.resourceId.videoId,
        title: snippet.title,
        description: snippet.description,
      };
    } catch (error) {
      console.error('Error fetching YouTube playlist:', error);
      return null;
    }
  }

  private resolveDurationMinutesFromFile(file: any): number | undefined {
    const meta = file?.customMetadata || {};
    const getNum = (v: any) => (v == null ? undefined : Number(v));
    const fromMin = getNum(meta.duration_min);
    if (!Number.isNaN(fromMin as any) && fromMin != null)
      return Math.max(1, Math.round(fromMin as number));
    const fromSec = getNum(meta.duration_sec);
    if (!Number.isNaN(fromSec as any) && fromSec != null)
      return Math.max(1, Math.round((fromSec as number) / 60));
    const fromMs = getNum(meta.duration_ms);
    if (!Number.isNaN(fromMs as any) && fromMs != null)
      return Math.max(1, Math.round((fromMs as number) / 60000));

    return undefined;
  }

  async listToday(userId: string) {
    const tz = await this.getUserTimezone(userId);
    const { start: today } = this.dayRangeInTz(tz);
    const routine = await this.prisma.routine.findUnique({
      where: { user_id_date: { user_id: userId, date: today } },
      include: { items: true },
    });
    return { success: true, routine };
  }

  async listHistory(userId: string, limit = 30) {
    const items = await this.prisma.routine.findMany({
      where: { user_id: userId },
      orderBy: { date: 'desc' },
      take: limit,
      include: { items: true },
    });
    return { success: true, data: items };
  }

  async getRoutineDetails(
    userId: string,
    routineId: string,
    withAssets = false,
  ) {
    const tz = await this.getUserTimezone(userId);
    const routine = await this.prisma.routine.findFirst({
      where: { id: routineId, user_id: userId },
      include: { items: true },
    });
    if (!routine) return { success: false, message: 'Not found' };

    // Total minutes
    const totalMinutes = (routine.items || []).reduce(
      (sum, it: any) => sum + (it.duration_min || 0),
      0,
    );

    const day = routine.date;
    const prevRoutines = await this.prisma.routine.findMany({
      where: { user_id: userId, date: { lte: day } },
      orderBy: { date: 'desc' },
      select: { id: true, date: true, status: true },
    });
    let streak = 0;
    let cursor = dayjs(day).tz(tz);
    for (const r of prevRoutines) {
      const sameDay =
        dayjs(r.date).tz(tz).format('YYYY-MM-DD') ===
        cursor.format('YYYY-MM-DD');
      if (sameDay && r.status === 'completed') {
        streak += 1;
        cursor = cursor.subtract(1, 'day');
      } else if (sameDay && r.status !== 'completed') {
        break;
      }
    }

    if (!withAssets) {
      return {
        success: true,
        routine: { ...routine, total_minutes: totalMinutes, streak },
      };
    }

    const items = await Promise.all(
      routine.items.map(async (it: any) => {
        if (
          it.content_type === 'video/youtube' &&
          it.gcs_path?.startsWith('youtube:')
        ) {
          const videoId = it.gcs_path.split(':')[1];
          return {
            ...it,
            signed_url: `https://www.youtube.com/watch?v=${videoId}`,
            video_id: videoId,
          };
        }

        if (it.gcs_path) {
          const url = await this.gcs
            .getFileSignedUrl(it.gcs_path)
            .catch(() => null);
          return { ...it, signed_url: url?.url || null };
        }
        return it;
      }),
    );
    return {
      success: true,
      routine: { ...routine, items, total_minutes: totalMinutes, streak },
    };
  }

  async startItem(userId: string, itemId: string) {
    const item = await this.prisma.routineItem.findUnique({
      where: { id: itemId },
      include: { routine: true },
    });
    if (!item || item.routine.user_id !== userId)
      return { success: false, message: 'Not found' };
    await this.prisma.routine.update({
      where: { id: item.routine_id },
      data: { status: 'started' },
    });
    return { success: true };
  }

  async completeItem(userId: string, itemId: string) {
    const item = await this.prisma.routineItem.findUnique({
      where: { id: itemId },
      include: { routine: true },
    });
    if (!item || item.routine.user_id !== userId)
      return { success: false, message: 'Not found' };
    await this.prisma.routineItem.update({
      where: { id: itemId },
      data: { status: 'completed', completed_at: new Date() },
    });
    const remaining = await this.prisma.routineItem.count({
      where: { routine_id: item.routine_id, status: 'pending' },
    });
    if (remaining === 0) {
      await this.prisma.routine.update({
        where: { id: item.routine_id },
        data: { status: 'completed', completed_at: new Date() },
      });
    }
    return { success: true };
  }

  async recordMoodAndGenerate(
    userId: string,
    body: {
      description?: string;
      emotion?: string;
      prompts?: string[];
      rating?: number;
      score?: number;
      emotions?: string[];
      statements?: string[];
      note?: string;
    },
  ) {
    const primaryEmotion =
      body.emotion ||
      (Array.isArray(body.emotions) ? body.emotions[0] : undefined);
    const selectedStatements = body.prompts || body.statements || [];
    const description = body.description || body.note;

    // check today already has mood check
    const tz = await this.getUserTimezone(userId);
    const { start: today, end: nextDay } = this.dayRangeInTz(tz);

    const existingMoodCheck = await this.prisma.routineMoodCheck.findFirst({
      where: {
        user_id: userId,
        created_at: { gte: today, lt: nextDay },
      },
    });
    if (existingMoodCheck) {
      return { success: false, message: 'Mood check already submitted today' };
    }

    const check = await this.prisma.routineMoodCheck.create({
      data: {
        user_id: userId,
        rating: body.rating ?? body.score,
        emotions: primaryEmotion ? [primaryEmotion] : (body.emotions ?? []),
        statements: selectedStatements,
        note: description,
      },
    });
    return this.generateToday(userId, { moodCheckId: check.id });
  }

  async listTodayWithSignedAssets(userId: string) {
    const res = await this.listToday(userId);
    const routine = res.routine;
    if (!routine) return res;
    const items = await Promise.all(
      routine.items.map(async (it: any) => {
        // Handle YouTube items
        if (
          it.content_type === 'video/youtube' &&
          it.gcs_path?.startsWith('youtube:')
        ) {
          const videoId = it.gcs_path.split(':')[1];
          return {
            ...it,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            signed_url: `https://www.youtube.com/watch?v=${videoId}`,
            video_id: videoId,
          };
        }

        if (it.gcs_path) {
          const url = await this.gcs
            .getFileSignedUrl(it.gcs_path)
            .catch((e) => {
              return null;
            });
          return {
            ...it,
            url: url?.url || null,
            signed_url: url?.url || null,
            url_source: url?.source || null,
          };
        }
        return it;
      }),
    );
    return { success: true, routine: { ...routine, items } };
  }

  async submitJournal(userId: string, itemId: string, text: string) {
    const trimmed = (text || '').trim();
    if (!trimmed)
      return { success: false, message: 'Journal text is required' };
    const item = await this.prisma.routineItem.findUnique({
      where: { id: itemId },
      include: { routine: true },
    });
    if (!item || item.routine.user_id !== userId)
      return { success: false, message: 'Not found' };
    if (item.type !== 'Journaling')
      return { success: false, message: 'Not a journaling item' };

    const now = new Date();
    const updated = await this.prisma.routineItem.update({
      where: { id: itemId },
      data: {
        journal_text: trimmed,
        status: 'completed',
        completed_at: now,
        updated_at: now,
      },
    });

    const remaining = await this.prisma.routineItem.count({
      where: { routine_id: item.routine_id, status: 'pending' },
    });
    if (remaining === 0) {
      await this.prisma.routine.update({
        where: { id: item.routine_id },
        data: { status: 'completed', completed_at: now },
      });
    }

    return { success: true, item: updated };
  }

  async getJournalHistory(userId: string, limit = 20) {
    const items = await this.prisma.routineItem.findMany({
      where: {
        routine: { user_id: userId },
        type: 'Journaling',
        status: 'completed',
        journal_text: { not: null },
      },
      orderBy: { completed_at: 'desc' },
      take: limit,
      include: {
        routine: {
          select: { id: true, date: true, status: true, completed_at: true },
        },
      },
    });
    const itemsWithAssets = await Promise.all(
      items.map(async (it: any) => {
        if (it.gcs_path) {
          const url = await this.gcs
            .getFileSignedUrl(it.gcs_path)
            .catch(() => null);
          return { ...it, signed_url: url?.url || null };
        }
        return it;
      }),
    );
    return { success: true, data: itemsWithAssets };
  }

  async redoRoutine(
    userId: string,
    routineId: string,
    body: { today?: boolean; copy_reminder?: boolean } = {},
  ) {
    const source = await this.prisma.routine.findFirst({
      where: { id: routineId, user_id: userId },
      include: { items: true },
    });
    if (!source) return { success: false, message: 'Not found' };

    const tz = await this.getUserTimezone(userId);
    const targetDate = dayjs().tz(tz).startOf('day');
    const existingToday = await this.prisma.routine
      .findUnique({
        where: { user_id_date: { user_id: userId, date: targetDate.toDate() } },
      })
      .catch(() => null);
    let dateForNew = targetDate;
    if (existingToday && !body.today) {
      dateForNew = targetDate.add(1, 'day');
    }

    const created = await this.prisma.routine.create({
      data: {
        user_id: userId,
        date: dateForNew.toDate(),
        status: 'generated',
        mood_check_id: source.mood_check_id || null,
        profile_snapshot: source.profile_snapshot || undefined,
        items: {
          create: source.items.map((it) => ({
            type: it.type as any,
            title: it.title,
            description: it.description,
            gcs_path: it.gcs_path,
            content_type: it.content_type,
            duration_min: it.duration_min,
            order: it.order,
          })),
        },
      },
      include: { items: true },
    });

    if (body.copy_reminder && source.remind_at) {
      const src = dayjs(source.remind_at).tz(tz);
      const hh = src.format('HH');
      const mm = src.format('mm');
      const when = dateForNew.set('hour', parseInt(hh, 10)).set('minute', parseInt(mm, 10)).toDate();
      await this.prisma.routine.update({
        where: { id: created.id },
        data: { remind_at: when },
      });
      const windowGuess = (() => {
        const h = parseInt(hh, 10);
        if (h >= 6 && h < 10) return 'morning';
        if (h >= 12 && h < 16) return 'afternoon';
        if (h >= 18 && h < 21) return 'evening';
        if (h >= 21 && h < 23) return 'night';
        return undefined;
      })();
      await this.prisma.reminders.create({
        data: {
          user_id: userId,
          routine_id: created.id,
          name: created.notes || 'Routine Reminder',
          scheduled_at: when,
          time: `${hh}:${mm}:00`,
          window: windowGuess,
          tz: tz,
          active: true,
        },
      });
    }

    return { success: true, routine: created };
  }
}
