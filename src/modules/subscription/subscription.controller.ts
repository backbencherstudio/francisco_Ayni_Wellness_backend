import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateProductAndPriceDto } from './dto/createProductAndPrice.dto';
import { AddCardDto } from './dto/AddCardDto.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UpsertIapPlanDto } from './dto/upsert-iap-plan.dto';

@ApiTags('subscription')
@Controller('subscription')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @ApiOperation({ summary: 'Start Trial Subscription' })
  @Post('start-trial')
  startTrial(@GetUser() user, @Body('planId') planId: string): Promise<any> {
    return this.subscriptionService.startTrial(user, planId);
  }

  @ApiOperation({ summary: 'create product & price' })
  @Post('create-product-price')
  createProductAndPrice(@Body() dto: CreateProductAndPriceDto): Promise<any> {
    return this.subscriptionService.createProductAndPrice(dto);
  }

  @ApiOperation({ summary: 'Add card' })
  @Post('add/cards')
  addCard(@GetUser() user, @Body() addCardDto: AddCardDto): Promise<any> {
    return this.subscriptionService.addCard(user, addCardDto);
  }

  @ApiOperation({ summary: 'Get User Subscription Status' })
  @Get('status')
  getSubscriptionStatus(@GetUser() user): Promise<any> {
    return this.subscriptionService.getSubscriptionStatus(user.userId);
  }

  @ApiOperation({ summary: 'get all plans' })
  @Get('plans')
  getAllPlans(): Promise<any> {
    return this.subscriptionService.getAllPlans();
  }

  @ApiOperation({ summary: 'Get mobile IAP plans (platform-aware)' })
  @Get('plans/mobile')
  getMobilePlans(@Req() req: any): Promise<any> {
    const platform =
      typeof req?.query?.platform === 'string'
        ? req.query.platform.toLowerCase()
        : 'all';
    return this.subscriptionService.getMobilePlans(platform);
  }

  @ApiOperation({ summary: 'Create or update IAP mapping plan for Apple/Google' })
  @Post('plans/upsert-iap')
  upsertIapPlan(@Body() dto: UpsertIapPlanDto): Promise<any> {
    return this.subscriptionService.upsertIapPlan(dto);
  }

  @ApiOperation({ summary: 'Cancel Subscription' })
  @Post('cancel')
  cancelSubscription(@GetUser('userId') userId: string): Promise<any> {
    return this.subscriptionService.cancelSubscription(userId);
  }
}
