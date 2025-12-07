import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateInspirationDto } from './dto/create-inspiration.dto';
import { UpdateInspirationDto } from './dto/update-inspiration.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { InspirationKeyword } from '@prisma/client';

@Injectable()
export class InspirationService {
  constructor(private readonly prisma: PrismaService) {}

  async getDailyInspiration(userId: any, keyword: string) {
    try {
      if (!userId) {
        return { message: 'User not found', status: false };
      }

      // this quote fetching from this API https://zenquotes.io/api/random
      const normalizedKeyword = (keyword || '').trim();
      const validKeywords = Object.values(InspirationKeyword);
      const isValid = validKeywords.includes(
        normalizedKeyword as InspirationKeyword,
      );

      const endpoint = isValid ? normalizedKeyword : 'random';
      const response = await fetch(`https://zenquotes.io/api/${endpoint}`);

      const data = await response.json();
      const quote = data[0]?.q;
      const author = data[0]?.a;

      if (!quote) {
        return { message: 'Inspiration not found', status: false };
      }

      const keywordValue = isValid
        ? (normalizedKeyword as InspirationKeyword)
        : null;

      const createdInspiration = await this.prisma.inspiration.create({
        data: {
          user_id: userId,
          quote,
          author,
          keyword: keywordValue,
        },
      });

      return {
        message: 'Inspiration fetched successfully',
        status: true,
        data: createdInspiration,
        source_keyword_requested: normalizedKeyword,
        used_endpoint: endpoint,
      };
    } catch (error) {
      return {
        message: 'Error fetching daily inspiration',
        status: false,
        error: (error as any)?.message,
      };
    }
  }

  // Return recent inspirations for the user (default 5)
  async recent(userId: string, limit = 5) {
    if (!userId) throw new BadRequestException('User required');
    const list = await this.prisma.inspiration.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
    return { success: true, count: list.length, inspirations: list };
  }

  async browseByCategory(userId: string, mine = false) {
    if (!userId) throw new BadRequestException('User required');
    const where: any = mine ? { user_id: userId } : {};
    const grouped = await this.prisma.inspiration.groupBy({
      by: ['keyword'],
      where,
      _count: { keyword: true },
    });
    const allKeys = Object.values(InspirationKeyword);
    const map = new Map<string, number>();
    for (const g of grouped) if (g.keyword) map.set(g.keyword, g._count.keyword);
    const categories = allKeys.map((k) => ({ keyword: k, count: map.get(k) || 0 }));
    return { success: true, mine, categories };
  }

  async newQuote(userId: string, keyword?: string) {
    return this.getDailyInspiration(userId, keyword || '');
  }

  async personalized(userId: string) {
    if (!userId) throw new BadRequestException('User required');
    const prismaAny: any = this.prisma as any;
    const moods = await prismaAny.moodEntry.findMany({
      where: { user_id: userId, deleted_at: null },
      orderBy: { created_at: 'desc' },
      take: 3,
    });
    if (!moods.length) {
      return { success: true, message: 'No mood data; fallback random', ...(await this.getDailyInspiration(userId, 'random')) };
    }
    const avg = moods.reduce((s: number, m: any) => s + m.score, 0) / moods.length;
    let keyword: InspirationKeyword = InspirationKeyword.Peace;
    if (avg >= 8) keyword = InspirationKeyword.Gratitude;
    else if (avg >= 6) keyword = InspirationKeyword.Mindfulness;
    else keyword = InspirationKeyword.Peace;
    const result = await this.getDailyInspiration(userId, keyword);
    return { success: true, mood_avg: Number(avg.toFixed(2)), suggested_keyword: keyword, ...result };
  }
}
