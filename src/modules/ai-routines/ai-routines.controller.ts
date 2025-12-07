import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { AiRoutinesService } from './ai-routines.service';
import { SubscriptionOnly } from 'src/common/decorator/subscription-only.decorator';
// import { SubscriptionGuard } from 'src/common/guard/subscription/subscription.guard';

@ApiBearerAuth()
@ApiTags('AI Routines')
@UseGuards(JwtAuthGuard, )
@Controller('ai/routines')
export class AiRoutinesController {
  constructor(private svc: AiRoutinesService) {}

  @Post('onboarding')
  async saveOnboarding(@GetUser() user, @Body() body: any) {
    return this.svc.saveOnboarding(user.userId, body);
  }

  @Post('generate-today')
  async generateToday(@GetUser() user) {
    return this.svc.generateToday(user.userId);
  }

  @Get('today')
  async today(@GetUser() user) {
    return this.svc.listToday(user.userId);
  }

  @Get('history')
  async history(@GetUser() user) {
    return this.svc.listHistory(user.userId);
  }

  @Get(':routineId')
  async routineDetails(
    @GetUser() user,
    @Param('routineId') routineId: string,
    @Query('assets') assets?: string,
  ) {
    const withAssets = assets === '1' || assets === 'true';
    return this.svc.getRoutineDetails(user.userId, routineId, withAssets);
  }

  @Post(':routineId/redo')
  async redoRoutine(
    @GetUser() user,
    @Param('routineId') routineId: string,
    @Body() body: { today?: boolean; copy_reminder?: boolean } = {},
  ) {
    return this.svc.redoRoutine(user.userId, routineId, body);
  }

  @Post('item/:itemId/start')
  async startItem(@GetUser() user, @Param('itemId') itemId: string) {
    return this.svc.startItem(user.userId, itemId);
  }

  @Post('item/:itemId/complete')
  async completeItem(@GetUser() user, @Param('itemId') itemId: string) {
    return this.svc.completeItem(user.userId, itemId);
  }

  @Post('mood-check')
  async moodCheck(
    @GetUser() user,
    @Body()
    body: { description?: string; emotion?: string; prompts?: string[] },
  ) {
    return this.svc.recordMoodAndGenerate(user.userId, body);
  }

  @Get('today/assets')
  async todayWithAssets(@GetUser() user) {
    return this.svc.listTodayWithSignedAssets(user.userId);
  }

  @Post('item/:itemId/journal')
  async submitJournal(
    @GetUser() user,
    @Param('itemId') itemId: string,
    @Body() body: { text: string },
  ) {
    return this.svc.submitJournal(user.userId, itemId, body.text);
  }
}
