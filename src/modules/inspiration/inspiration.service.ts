import { Injectable } from '@nestjs/common';
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

      // Choose endpoint: if provided keyword is a valid enum, use it; otherwise fallback to random
      const endpoint = isValid ? normalizedKeyword : 'random';
      const response = await fetch(`https://zenquotes.io/api/${endpoint}`);

      const data = await response.json();
      const quote = data[0]?.q;
      const author = data[0]?.a;

      console.log('data is:', data);
      console.log('quote is:', quote);
      console.log('author is:', author);

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
}
