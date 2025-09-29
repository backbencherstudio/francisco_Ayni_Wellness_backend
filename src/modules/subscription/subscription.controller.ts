import { Body, Controller, Get, Post, UseGuards, Delete } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { SkipSubscription } from '../../common/decorator/skip-subscription.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { AppSubscriptionService } from './subscription.service';
import { findPlan, PLANS } from './plans.config';

class PaymentMethodDto {
  method_type: 'card' | 'wallet';
  brand?: string;
  last4?: string;
  exp_month?: number;
  exp_year?: number;
  funding?: string;
  stripe_payment_method_id?: string; 
}

class SubscribeDto {
  plan_key: 'monthly' | 'yearly' | 'trial';
  payment_method: PaymentMethodDto; 
  stripe_subscription_id: string; 
  stripe_price_id: string; 
  current_period_end: string; 
  trial_start?: string;
  trial_end?: string;
}

@ApiTags('Subscription')
@Controller('subscription')
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(
    private prisma: PrismaService,
    private subService: AppSubscriptionService,
  ) {}

  @ApiOperation({ summary: 'List available plans' })
  @Get('plans')
  @SkipSubscription()
  async listPlans() {
    return {
      success: true,
      plans: PLANS.map((p) => ({
        key: p.key,
        name: p.name,
        interval: p.interval,
        price: p.price,
        currency: p.currency,
        features: p.features,
        trialDays: p.trialDays,
        hasStripe: !!p.stripePriceId,
      })),
    };
  }

  @ApiOperation({ summary: 'Get subscription status' })
  @Get('status')
  async getStatus(@GetUser() user) {
    const userId = user.userId;
    const [active, activeTrial, anyTrial] = await Promise.all([
      await this.prisma.subscription.findFirst({
        where: {
          user_id: userId,
          status: 'active',
          OR: [{ end_date: null }, { end_date: { gt: new Date() } }],
          NOT: { plan_name: 'trial' },
        },
      }),
      await this.prisma.subscription.findFirst({
        where: {
          user_id: userId,
          status: 'active',
          plan_name: 'trial',
          end_date: { gt: new Date() },
        },
      }),
      await this.prisma.subscription.findFirst({
        where: { user_id: userId, plan_name: 'trial' },
        select: { id: true },
      }),
    ]);
    const trial_active = !!activeTrial;
    const trial_ends_at = activeTrial?.end_date?.toISOString();
    const trial_days_remaining = trial_active
      ? Math.ceil(
          (activeTrial!.end_date!.getTime() - Date.now()) /
            (1000 * 60 * 60 * 24),
        )
      : 0;
    const subscription_active = !!active;
    const method = active || activeTrial;
    return {
      success: true,
      subscription_active,
      subscription: active || null,
      trial_active,
      trial_ends_at,
      trial_days_remaining,
      subscription_required: !subscription_active && !trial_active,
      trial_available: !trial_active && !subscription_active && !anyTrial,
      payment_method: method
        ? {
            brand: method.payment_method_brand,
            last4: method.payment_method_last4,
            type: method.payment_method_type,
            funding: method.payment_method_funding,
            next_billing_date: method.next_billing_date?.toISOString?.(),
          }
        : null,
    };
  }

  @ApiOperation({ summary: 'Start a free trial' })
  @Post('start-trial')
  @UseGuards(JwtAuthGuard)
  @SkipSubscription()
  async startTrial(@GetUser() user, @Body() body: SubscribeDto) {
    const trial = await this.subService.startTrial({
      userId: user.userId,
      planKey: 'trial',
      paymentMethodPayload: body.payment_method,
    });
    return {
      success: true,
      message: 'Trial started',
      trial,
    };
  }



  @ApiOperation({
    summary: 'Create (record) a paid subscription after Stripe confirmation',
  })
  @Post('subscribe')
  @SkipSubscription()
  async subscribe(@GetUser() user, @Body() body: SubscribeDto) {
   
    const plan = findPlan(body.plan_key);
    if (!plan) {
      return { success: false, message: 'Invalid plan' };
    }

    const subscription = await this.subService.createPaidSubscription({
      userId: user.userId,
      planKey: body.plan_key,
      paymentMethod: body.payment_method,
      stripe: {
        subscriptionId: body.stripe_subscription_id,
        priceId: body.stripe_price_id,
        paymentMethodId: body.payment_method.stripe_payment_method_id!,
        currentPeriodEnd: new Date(body.current_period_end),
        trialStart: body.trial_start ? new Date(body.trial_start) : undefined,
        trialEnd: body.trial_end ? new Date(body.trial_end) : undefined,
      },
    });
    return { success: true, subscription };
  }

  @ApiOperation({ summary: 'Cancel subscription at period end' })
  @Delete('cancel')
  async cancel(@GetUser() user) {
    const sub = await this.subService.cancel(user.userId);
    return { success: true, subscription: sub };
  }
}
