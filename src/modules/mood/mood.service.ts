import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMoodDto } from './dto/create-mood.dto';
import { EMOTION_KEYS, EMOTIONS, EMOTION_CONFIG_VERSION } from './emotion.config';
import { UpdateMoodDto } from './dto/update-mood.dto';
import { differenceInCalendarDays, startOfDay, subDays } from 'date-fns';

@Injectable()
export class MoodService {
  constructor(private prisma: PrismaService) {}

  private normalizeEmotion(e: string) {
    return e.trim().replace(/\s+/g,' ').toLowerCase();
  }

  private validateEmotions(emotions: string[]) {
    if (!Array.isArray(emotions)) throw new BadRequestException('Emotions must be an array');
    const canon = new Set(EMOTION_KEYS);
    for (const raw of emotions) {
      const key = this.normalizeEmotion(raw);
      if (!canon.has(key)) throw new BadRequestException(`Unknown emotion: ${raw}`);
    }
    return emotions.map(e=>this.normalizeEmotion(e));
  }

  // Classification helpers -------------------------------------------------
  private classify(score: number, emotions: string[]) {
    // base bucket by score
    const base = (() => {
      if (score <= 2) return 'Very Low';
      if (score <= 4) return 'Low';
      if (score <= 6) return 'Neutral';
      if (score <= 8) return 'Good';
      return 'Great';
    })();
  const positiveSet = new Set(EMOTIONS.filter(e=>e.valence==='positive').map(e=>e.key));
  const negativeSet = new Set(EMOTIONS.filter(e=>e.valence==='negative').map(e=>e.key));
    let pos=0, neg=0;
    for (const e of emotions.map(x=>this.normalizeEmotion(x))) {
      if (positiveSet.has(e)) pos++; else if (negativeSet.has(e)) neg++;
    }
    const delta = pos - neg;
    const order = ['Very Low','Low','Neutral','Good','Great'];
    let idx = order.indexOf(base);
    if (delta >= 2 && idx < order.length-1) idx++; else if (delta <= -2 && idx>0) idx--;
    const label = order[idx];
    const emojiMap: Record<string,string> = {
      'Very Low':'😞','Low':'🙁','Neutral':'😐','Good':'😊','Great':'😁'
    };
    const toneKey = label.toLowerCase().replace(/\s+/g,'_');
    const explanation = this.buildExplanation(label, score, pos, neg);
    return { label, emoji: emojiMap[label], tone: toneKey, explanation };
  }

  private buildExplanation(label: string, score: number, pos: number, neg: number) {
    const trend = pos>neg? 'more positive emotions' : neg>pos? 'more challenging emotions' : 'a balance of emotions';
    return `Rated ${score}/10 • ${label} overall with ${trend}.`;
  }

  previewClassification(score: number, emotions: string[]) {
    this.validateEmotions(emotions);
    return this.classify(score, emotions);
  }

  async create(userId: string, dto: CreateMoodDto) {
    this.validateEmotions(dto.emotions);
  const prismaAny: any = this.prisma as any;
  const entry = await prismaAny.moodEntry.create({
      data: {
        user_id: userId,
        score: dto.score,
        emotions: dto.emotions,
        note: dto.note?.trim() || null,
      },
    });
    await this.recomputeDailyAggregate(userId, entry.created_at);
    const classification = this.classify(dto.score, dto.emotions);
    return { success: true, entry, classification };
  }

  async getToday(userId: string) {
    const start = startOfDay(new Date());
    const prismaAny: any = this.prisma as any;
    return prismaAny.moodEntry.findFirst({
      where: { user_id: userId, created_at: { gte: start }, deleted_at: null },
      orderBy: { created_at: 'desc' },
    });
  }

  async getRecent(userId: string, limit = 7) {
    const prismaAny: any = this.prisma as any;
    const entries = await prismaAny.moodEntry.findMany({
      where: { user_id: userId, deleted_at: null },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
    return { success: true, entries };
  }

  async getTrend(userId: string, days = 7) {
    const from = startOfDay(subDays(new Date(), days - 1));
    const prismaAny: any = this.prisma as any;
    const aggregates = await prismaAny.moodDailyAggregate.findMany({
      where: { user_id: userId, date: { gte: from } },
      orderBy: { date: 'asc' },
    });
    if (!aggregates.length) return { success: true, range_days: days, avg_score: null, entries: [] };
    const avg = aggregates.reduce((s,a)=>s+a.avg_score,0)/aggregates.length;
    return { success: true, range_days: days, avg_score: Number(avg.toFixed(2)), entries: aggregates };
  }

  async history(userId: string, cursor?: string, limit = 20) {
    const where: any = { user_id: userId, deleted_at: null };
    const prismaAny: any = this.prisma as any;
    const entries = await prismaAny.moodEntry.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: limit,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
    });
    const nextCursor = entries.length === limit ? entries[entries.length-1].id : null;
    return { success: true, entries, nextCursor };
  }

  async insights(userId: string, days = 7) {
    const prismaAny: any = this.prisma as any;
    const todayStart = startOfDay(new Date());
    const startRange = new Date(todayStart.getTime() - (days-1)*86400000);
    // Fetch up to 2 * days aggregates to compute delta vs previous period
    const rangeStartForDelta = new Date(startRange.getTime() - days*86400000);
    const aggs = await prismaAny.moodDailyAggregate.findMany({
      where: { user_id: userId, date: { gte: rangeStartForDelta } },
      orderBy: { date: 'asc' },
    });
    if (!aggs.length) return { success: true, insights: null };
    const recent = aggs.filter(a=>a.date >= startRange);
    if (!recent.length) return { success: true, insights: null };
    const prev = aggs.filter(a=>a.date < startRange);

    const scoreListRecent = recent.map(a=>a.avg_score);
    const scoreListPrev = prev.map(a=>a.avg_score);
    const avgRecent = scoreListRecent.reduce((s,n)=>s+n,0)/scoreListRecent.length;
    const avgPrev = scoreListPrev.length ? (scoreListPrev.reduce((s,n)=>s+n,0)/scoreListPrev.length) : null;
    const delta = avgPrev!=null ? avgRecent - avgPrev : null;
    const variance = scoreListRecent.reduce((s,n)=>s+Math.pow(n-avgRecent,2),0)/scoreListRecent.length;
    const stddev = Math.sqrt(variance);

    // Collate emotions across recent days (pull from entries for better granularity)
    const entriesRecent = await prismaAny.moodEntry.findMany({
      where: { user_id: userId, created_at: { gte: startRange }, deleted_at: null },
      select: { emotions: true }
    });
    const freq: Record<string, number> = {};
    for (const e of entriesRecent) for (const emo of e.emotions) freq[emo]=(freq[emo]||0)+1;
    const sorted = Object.entries(freq).sort((a,b)=>b[1]-a[1]);
    const topEmotions = sorted.slice(0,5).map(([k,v])=>({ emotion: k, count: v }));

  const positiveSet = new Set(EMOTIONS.filter(e=>e.valence==='positive').map(e=>e.key));
  const negativeSet = new Set(EMOTIONS.filter(e=>e.valence==='negative').map(e=>e.key));
    let pos=0, neg=0; for (const [emo,count] of sorted){ const key=emo.toLowerCase(); if(positiveSet.has(key)) pos+=count; else if(negativeSet.has(key)) neg+=count; }
    const totalEmo = pos+neg || 1; // avoid div 0
    const negativeRatio = neg/totalEmo;

    // Streak (consecutive days with at least one entry ending today or yesterday)
    let streak=0; const dayMap = new Set(recent.map(a=>startOfDay(new Date(a.date)).getTime()));
    for (let i=0;i<days;i++){ const t = startOfDay(new Date(todayStart.getTime()-i*86400000)).getTime(); if(dayMap.has(t)) streak++; else break; }

    const summary = this.buildInsightSummary({ avgRecent, delta, stddev, negativeRatio, streak, days, topEmotions });
    const suggestion = this.buildInsightSuggestion({ avgRecent, stddev, negativeRatio, pos, neg });

    return {
      success: true,
      insights: {
        period_days: days,
        avg_score: Number(avgRecent.toFixed(2)),
        previous_avg_score: avgPrev!=null? Number(avgPrev.toFixed(2)) : null,
        delta: delta!=null? Number(delta.toFixed(2)) : null,
        volatility: Number(stddev.toFixed(2)),
        streak_days: streak,
        top_emotions: topEmotions,
        negative_ratio: Number(negativeRatio.toFixed(2)),
        summary,
        suggestion,
      }
    };
  }

  private buildInsightSummary(params: { avgRecent:number; delta:number|null; stddev:number; negativeRatio:number; streak:number; days:number; topEmotions:{emotion:string,count:number}[] }) {
    const { avgRecent, delta, stddev, negativeRatio, streak, days, topEmotions } = params;
    const emoList = topEmotions.map(e=>e.emotion).join(', ');
    const deltaPart = delta==null? '' : delta>0? `up ${delta.toFixed(1)} vs previous period` : delta<0? `down ${Math.abs(delta).toFixed(1)} vs previous period` : 'unchanged vs previous period';
    const stability = stddev < 1 ? 'stable' : stddev < 2 ? 'moderately varied' : 'highly varied';
    return `Average mood ${avgRecent.toFixed(1)} over last ${days} days (${deltaPart}). Variation is ${stability}. Common emotions: ${emoList || 'n/a'}. Current streak: ${streak} day(s).`;
  }

  private buildInsightSuggestion(params: { avgRecent:number; stddev:number; negativeRatio:number; pos:number; neg:number }) {
    const { avgRecent, stddev, negativeRatio } = params;
    if (avgRecent >= 8 && negativeRatio < 0.25) return 'Your mood is strong and consistent—keep reinforcing the routines that support this balance.';
    if (avgRecent >= 6 && negativeRatio < 0.35) return 'Mood is generally healthy. Consider a brief daily reflection to nudge it even higher.';
    if (avgRecent < 6 && negativeRatio >= 0.4) return 'Focus on one small uplifting habit (short walk, gratitude note) to counter repeated low emotions.';
    if (stddev >= 2) return 'Mood swings are higher than normal—try tracking context (sleep, activities) to spot triggers.';
    return 'Maintain steady habits and continue logging; subtle trends will become clearer.';
  }

  async update(userId: string, id: string, dto: UpdateMoodDto) {
    const prismaAny: any = this.prisma as any;
    const existing = await prismaAny.moodEntry.findFirst({ where: { id, user_id: userId, deleted_at: null } });
    if (!existing) throw new NotFoundException('Mood not found');
    if (dto.emotions) this.validateEmotions(dto.emotions);
  const updated = await prismaAny.moodEntry.update({
      where: { id },
      data: {
        score: dto.score ?? existing.score,
        emotions: dto.emotions ?? existing.emotions,
        note: dto.note?.trim() ?? existing.note,
        updated_at: new Date(),
      },
    });
    await this.recomputeDailyAggregate(userId, updated.created_at);
    return { success: true, entry: updated };
  }

  async remove(userId: string, id: string) {
    const prismaAny: any = this.prisma as any;
    const existing = await prismaAny.moodEntry.findFirst({ where: { id, user_id: userId, deleted_at: null } });
    if (!existing) throw new NotFoundException('Mood not found');
  await prismaAny.moodEntry.update({ where: { id }, data: { deleted_at: new Date() } });
    await this.recomputeDailyAggregate(userId, existing.created_at);
    return { success: true };
  }

  private dayKey(date: Date) { return startOfDay(date); }

  private async recomputeDailyAggregate(userId: string, date: Date) {
    const day = this.dayKey(date);
    const nextDay = new Date(day.getTime() + 86400000);
    const prismaAny: any = this.prisma as any;
    const entries = await prismaAny.moodEntry.findMany({
      where: { user_id: userId, created_at: { gte: day, lt: nextDay }, deleted_at: null },
      orderBy: { created_at: 'asc' },
    });
    if (!entries.length) {
      // Optionally delete aggregate - for simplicity we keep it with zeros
      return;
    }
    const scores = entries.map(e=>e.score);
    const avg = scores.reduce((s,n)=>s+n,0)/scores.length;
    const freq: Record<string, number> = {};
    for (const e of entries) for (const emo of e.emotions) freq[emo]=(freq[emo]||0)+1;
    const top = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k])=>k);
  await prismaAny.moodDailyAggregate.upsert({
      where: { user_id_date: { user_id: userId, date: day } },
      update: {
        count_entries: entries.length,
        avg_score: avg,
        min_score: Math.min(...scores),
        max_score: Math.max(...scores),
        emotions_top: top,
        last_entry_id: entries[entries.length-1].id,
        updated_at: new Date(),
      },
      create: {
        user_id: userId,
        date: day,
        count_entries: entries.length,
        avg_score: avg,
        min_score: Math.min(...scores),
        max_score: Math.max(...scores),
        emotions_top: top,
        last_entry_id: entries[entries.length-1].id,
      },
    });
  }
}
