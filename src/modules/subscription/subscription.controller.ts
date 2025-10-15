import { Body, Controller, Get, Post, UseGuards, Delete } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { SkipSubscription } from '../../common/decorator/skip-subscription.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { AppSubscriptionService } from './subscription.service';
import { findPlan, PLANS } from './plans.config';
import { StripePayment } from '../../common/lib/Payment/stripe/StripePayment';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

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

class CreateSubscriptionDto {
  @IsString()
  @IsIn(['monthly','yearly'])
  plan_key: 'monthly' | 'yearly';

  @IsString()
  payment_method_id: string; // existing Stripe payment method id (pm_...)

  // optional: override trial days (dev/testing) – if omitted plan.trialDays used
  @IsOptional()
  trial_days?: number;
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

  @ApiOperation({ summary: 'Create a Stripe subscription (server-side) and return client secret if confirmation needed' })
  @Post('create')
  @UseGuards(JwtAuthGuard)
  @SkipSubscription()
  async createServerSubscription(@GetUser() user, @Body() body: CreateSubscriptionDto) {
    // Manual validation (since we used lightweight DTO without Nest pipes configured here)
    const dto = plainToInstance(CreateSubscriptionDto, body);
    const errors = await validate(dto);
    if (errors.length) {
      return { success: false, message: 'Validation failed', errors };
    }

    const plan = findPlan(dto.plan_key);
    if (!plan) return { success: false, message: 'Invalid plan' };
    if (!plan.stripePriceId) {
      return {
        success: false,
        message: 'Plan is missing stripePriceId. Add it in plans.config.ts (hardcode) before creating subscriptions.',
      };
    }

    // Fetch user and ensure Stripe customer
    const userRecord = await this.prisma.user.findUnique({ where: { id: user.userId } });
    if (!userRecord) return { success: false, message: 'User not found' };

    let customerId = userRecord.billing_id;
    if (!customerId) {
      const created = await StripePayment.createCustomer({
        user_id: userRecord.id,
        name: userRecord.name || userRecord.first_name || 'User',
        email: userRecord.email || 'no-email@example.com',
      });
      customerId = created.id;
      await this.prisma.user.update({ where: { id: userRecord.id }, data: { billing_id: customerId } });
    }

    // Attach payment method & set default (idempotent if already attached)
    try {
      await StripePayment.attachCustomerPaymentMethodId({
        customer_id: customerId,
        payment_method_id: dto.payment_method_id,
      });
    } catch (e) {
      // ignore if already attached
    }
    await StripePayment.setCustomerDefaultPaymentMethodId({
      customer_id: customerId,
      payment_method_id: dto.payment_method_id,
    });

    // Create subscription at Stripe
    const trialDays = typeof dto.trial_days === 'number' ? dto.trial_days : plan.trialDays;
    const subscription = await StripePayment.createSubscription({
      customer_id: customerId,
      price_id: plan.stripePriceId,
      trial_days: trialDays > 0 ? trialDays : undefined,
      payment_method_id: dto.payment_method_id,
      metadata: { user_id: userRecord.id, plan_key: plan.key,  },
    });
    const subAny: any = subscription as any; // avoid collision with Prisma Subscription type
    const latestInvoice: any = subAny.latest_invoice;
    const paymentIntent = latestInvoice?.payment_intent;
    const clientSecret = paymentIntent?.client_secret;
    const requiresAction = paymentIntent?.status === 'requires_action' || paymentIntent?.status === 'requires_confirmation';

    // If payment intent just needs simple confirmation (no 3DS) confirm it now to speed activation.
    if (paymentIntent && paymentIntent.status === 'requires_confirmation') {
      try {
        await StripePayment.confirmPaymentIntentIfNeeded(paymentIntent);
        // Refetch subscription to get updated status & current_period_end after confirmation
        const refreshed: any = await StripePayment.retrieveSubscriptionAndExpand(subAny.id);
        Object.assign(subAny, refreshed);
      } catch (e) {
        console.warn('Auto-confirm payment intent failed (will rely on webhook):', (e as any)?.message);
      }
    }

    const currentPeriodEndIso = subAny.current_period_end ? new Date(subAny.current_period_end * 1000).toISOString() : null;
    const trialStartIso = subAny.trial_start ? new Date(subAny.trial_start * 1000).toISOString() : null;
    const trialEndIso = subAny.trial_end ? new Date(subAny.trial_end * 1000).toISOString() : null;

    return {
      success: true,
      source: 'server',
      subscription_id: subAny.id,
      status: subAny.status,
      plan: plan.key,
      current_period_end: currentPeriodEndIso,
      trial_start: trialStartIso,
      trial_end: trialEndIso,
      client_secret: clientSecret || null,
      requires_action: !!requiresAction,
      auto_confirm_attempted: paymentIntent?.status === 'requires_confirmation',
      note: 'DB record will still be finalized via webhook events.'
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
