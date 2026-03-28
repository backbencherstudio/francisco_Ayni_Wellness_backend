import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';

@ApiTags('subscription')
@Controller('subscription')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @ApiOperation({ summary: 'Start Trial Subscription' })
  @Post('start-trial')
  startTrial(@GetUser() user, @Body('planId') planId?: string): Promise<any> {
    return this.subscriptionService.startTrial(user, planId);
  }

  @ApiOperation({ summary: 'get all plans' })
  @Get('plans')
  getAllPlans(): Promise<any> {
    return this.subscriptionService.getAllPlans();
  }

  @ApiOperation({ summary: 'Get unified subscription status (backend trial + Apple/Google IAP)' })
  @Get('status')
  getUnifiedStatus(@GetUser() user): Promise<any> {
    return this.subscriptionService.getUnifiedSubscriptionStatus(user.userId);
  }

  @ApiOperation({ summary: 'Get mobile IAP plans (platform-aware)' })
  @Get('plans/mobile')
  getMobilePlans(@Query('platform') platform?: string): Promise<any> {
    const normalizedPlatform =
      typeof platform === 'string' ? platform.toLowerCase() : 'all';
    return this.subscriptionService.getMobilePlans(normalizedPlatform);
  }
}
