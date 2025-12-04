import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MoodService } from './mood.service';
import { CreateMoodDto } from './dto/create-mood.dto';
import { UpdateMoodDto } from './dto/update-mood.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { SkipSubscription } from '../../common/decorator/skip-subscription.decorator';
import { EMOTIONS, EMOTION_CONFIG_VERSION } from './emotion.config';
// import { SubscriptionGuard } from 'src/common/guard/subscription/subscription.guard';

@Controller('mood')
@UseGuards(JwtAuthGuard)
export class MoodController {
  constructor(private readonly moodService: MoodService) {}

  @Post()
  create(@GetUser() user, @Body() dto: CreateMoodDto) {
    return this.moodService.create(user.userId, dto);
  }

  @Post('preview')
  @SkipSubscription()
  preview(@Body() dto: CreateMoodDto) {
    // no persistence, just classification (score/emotions validation reused)
    const result = this.moodService.previewClassification(
      dto.score,
      dto.emotions,
    );
    return { success: true, preview: result };
  }

  @Get('today')
  getToday(@GetUser() user) {
    return this.moodService.getToday(user.userId);
  }

  @Get('recent')
  recent(@GetUser() user, @Query('limit') limit?: string) {
    return this.moodService.getRecent(
      user.userId,
      limit ? parseInt(limit, 10) : 7,
    );
  }

  @Get('trend')
  trend(@GetUser() user, @Query('days') days?: string) {
    return this.moodService.getTrend(
      user.userId,
      days ? parseInt(days, 10) : 7,
    );
  }

  @Get('insights')
  insights(@GetUser() user, @Query('days') days?: string) {
    return this.moodService.insights(
      user.userId,
      days ? parseInt(days, 10) : 7,
    );
  }

  @Get('emotions')
  @SkipSubscription()
  listEmotions() {
    return {
      success: true,
      version: EMOTION_CONFIG_VERSION,
      emotions: EMOTIONS,
    };
  }

  @Get('history')
  history(
    @GetUser() user,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.moodService.history(
      user.userId,
      cursor,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Patch(':id')
  update(@GetUser() user, @Param('id') id: string, @Body() dto: UpdateMoodDto) {
    return this.moodService.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@GetUser() user, @Param('id') id: string) {
    return this.moodService.remove(user.userId, id);
  }
}
