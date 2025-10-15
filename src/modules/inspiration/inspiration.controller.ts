import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { InspirationService } from './inspiration.service';
import { CreateInspirationDto } from './dto/create-inspiration.dto';
import { UpdateInspirationDto } from './dto/update-inspiration.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('Inspiration')
@Controller('inspiration')
@UseGuards(JwtAuthGuard)

export class InspirationController {
  constructor(private readonly inspirationService: InspirationService) {}

  // Daily inspiration with explicit keyword path (avoids catch-all issues)
  @ApiOperation({ summary: 'Get daily inspiration quote for a specific keyword' })
  @Get('daily/:keyword')
  async getDailyInspirationKeyword(@GetUser() user, @Param('keyword') keyword: string) {
    return this.inspirationService.getDailyInspiration(user.userId, keyword);
  }

  // Daily inspiration random (no keyword provided)
  @ApiOperation({ summary: 'Get daily inspiration quote (random or auto)' })
  @Get('daily')
  async getDailyInspiration(@GetUser() user) {
    return this.inspirationService.getDailyInspiration(user.userId, '');
  }
  @ApiOperation({ summary: 'Recent inspiration quotes (user scope)' })
  @Get('recent/list')
  async recent(@GetUser() user, @Query('limit') limit?: string) {
    const lim = Math.min(Math.max(parseInt(limit || '5', 10), 1), 20);
    return this.inspirationService.recent(user.userId, lim);
  }

  @ApiOperation({ summary: 'Browse counts by keyword (all)' })
  @Get('browse/all')
  async browseAll(@GetUser() user) {
    return this.inspirationService.browseByCategory(user.userId, false);
  }

  @ApiOperation({ summary: 'Browse counts by keyword (only my saved/generated)' })
  @Get('browse/mine')
  async browseMine(@GetUser() user) {
    return this.inspirationService.browseByCategory(user.userId, true);
  }

  @ApiOperation({ summary: 'Force fetch a new quote (optional keyword via query param ?keyword=)' })
  @Get('new')
  async newQuote(@GetUser() user, @Query('keyword') keyword?: string) {
    return this.inspirationService.newQuote(user.userId, keyword);
  }

  @ApiOperation({ summary: 'Personalized quote based on recent mood entries' })
  @Get('personalized/quote')
  async personalized(@GetUser() user) {
    return this.inspirationService.personalized(user.userId);
  }
}
