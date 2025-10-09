import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Stats')
@UseGuards(JwtAuthGuard)
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @ApiOperation({ summary: 'Summary metrics for selected period (week|month)' })
  @Get('summary')
  async summary(@GetUser() user, @Query('period') period: 'week' | 'month' | 'year' = 'week') {
    return this.statsService.summary(user.userId, period);
  }

  @ApiOperation({ summary: 'Progress rows for selected period (week=days, month=days, year=months)' })
  @Get('progress')
  async progress(@GetUser() user, @Query('period') period: 'week' | 'month' | 'year' = 'week') {
    return this.statsService.progress(user.userId, period);
  }

  @ApiOperation({ summary: 'Habit progress over last 30 days (per habit)' })
  @Get('habit-progress')
  async habitProgress(@GetUser() user, @Query('period') period: 'week' | 'month' | 'year' = 'month') {
    return this.statsService.habitProgress(user.userId, period);
  }

  @ApiOperation({ summary: 'Habit progress grouped by category for selected period' })
  @Get('habit-progress/categories')
  async habitProgressByCategory(@GetUser() user, @Query('period') period: 'week' | 'month' | 'year' = 'month') {
    return this.statsService.habitProgressByCategory(user.userId, period);
  }

  @ApiOperation({ summary: 'Achievement unlock status' })
  @Get('achievements')
  async achievements(@GetUser() user) {
    return this.statsService.achievements(user.userId);
  }

  @ApiOperation({ summary: 'Overall completion progress (circular indicator)' })
  @Get('overall-progress')
  async overall(@GetUser() user) {
    return this.statsService.overallProgress(user.userId);
  }
}
