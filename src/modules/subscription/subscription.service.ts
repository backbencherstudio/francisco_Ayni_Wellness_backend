import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { findPlan } from './plans.config';


interface StartTrialInput {
  userId: string;
  planKey?: 'trial'; 
  paymentMethodPayload?: BasicPaymentMethodPayload; 
}

interface CreatePaidSubscriptionInput {
  userId: string;
  planKey: 'monthly' | 'yearly' | 'trial';
  paymentMethod: BasicPaymentMethodPayload; 
  stripe: {
    subscriptionId: string;
    priceId: string;
    paymentMethodId: string;
    currentPeriodEnd: Date;
    trialStart?: Date;
    trialEnd?: Date;
  };
}

interface BasicPaymentMethodPayload {
  method_type: 'card' | 'wallet';
  brand?: string;
  last4?: string;
  exp_month?: number;
  exp_year?: number;
  funding?: string;
  stripe_payment_method_id?: string;
  is_default?: boolean;
}

@Injectable()
export class AppSubscriptionService {
  constructor(private prisma: PrismaService) {}

  async getActive(userId: string) {
    return this.prisma.subscription.findFirst({
      where: {
        user_id: userId,
        status: 'active',
        OR: [{ end_date: null }, { end_date: { gt: new Date() } }],
        NOT: { plan_name: 'trial' },
      },
    });
  }



  async getActiveTrial(userId: string) {
    return this.prisma.subscription.findFirst({
      where: {
        user_id: userId,
        status: 'active',
        plan_name: 'trial',
        end_date: { gt: new Date() },
      },
    });
  }




  async hasUsedTrial(userId: string) {
    const c = await this.prisma.subscription.count({
      where: { user_id: userId, plan_name: 'trial' },
    });
    return c > 0;
  }



  // Starts a free trial for the user if they haven't used one before and have no active subscription
  async startTrial(input: StartTrialInput) {
    const { userId, planKey , paymentMethodPayload } = input;
    
    if (await this.hasUsedTrial(userId)) {
      return new BadRequestException('Trial already used');
    }

    if (await this.getActive(userId)) {
      return new BadRequestException('Active subscription exists');
    }
    
    const plan = findPlan(planKey);
    if (!plan) throw new BadRequestException('Invalid plan');

    const now = new Date();
    const end = new Date(now.getTime());
    end.setDate(end.getDate() + plan.trialDays);

    let userPaymentMethodId: string | undefined;

    if (paymentMethodPayload) {
      const upm = await this.prisma.userPaymentMethod.create({
        data: {
          user_id: userId,
          payment_method_id: paymentMethodPayload.stripe_payment_method_id,
          brand: paymentMethodPayload.brand,
          last4: paymentMethodPayload.last4,
          exp_month: paymentMethodPayload.exp_month,
          exp_year: paymentMethodPayload.exp_year,
          funding: paymentMethodPayload.funding,
          method_type: paymentMethodPayload.method_type,
          is_default: paymentMethodPayload.is_default ?? true,
        },
      });
      userPaymentMethodId = upm.id;
    }

    const trial = await this.prisma.subscription.create({
      data: {
        user_id: userId,
        plan_name: 'trial',
        description: 'Free trial',
        interval: 'trial',
        status: 'active',
        start_date: now,
        end_date: end,
        trial_start: now,
        trial_end: end,
        next_billing_date: end,
        user_payment_method_id: userPaymentMethodId,
        payment_method_brand: paymentMethodPayload?.brand,
        payment_method_last4: paymentMethodPayload?.last4,
        payment_method_type: paymentMethodPayload?.method_type,
      },
    });
    return trial;
  }


  
  async createPaidSubscription(input: CreatePaidSubscriptionInput) {
    const { userId, planKey, paymentMethod, stripe } = input;

    const plan = findPlan(planKey);
    if (!plan) throw new BadRequestException('Invalid plan');

    // mark any existing active subs as canceled (immediate upgrade)
    await this.prisma.subscription.updateMany({
      where: { user_id: userId, status: 'active' },
      data: { status: 'replaced', canceled_at: new Date() },
    });

    // ensure stored payment method
    let pmRecord = await this.prisma.userPaymentMethod.findFirst({
      where: {
        user_id: userId,
        payment_method_id: paymentMethod.stripe_payment_method_id,
      },
    });
    if (!pmRecord) {
      pmRecord = await this.prisma.userPaymentMethod.create({
        data: {
          user_id: userId,
          payment_method_id: paymentMethod.stripe_payment_method_id,
          brand: paymentMethod.brand,
          last4: paymentMethod.last4,
          exp_month: paymentMethod.exp_month,
          exp_year: paymentMethod.exp_year,
          funding: paymentMethod.funding,
          method_type: paymentMethod.method_type,
          is_default: true,
        },
      });
    } else if (!pmRecord.is_default) {
      await this.prisma.userPaymentMethod.update({
        where: { id: pmRecord.id },
        data: { is_default: true },
      });
    }

    const subscription = await this.prisma.subscription.create({
      data: {
        user_id: userId,
        plan_name: plan.key,
        description: plan.name,
        plan_id: stripe.priceId,
        price: plan.price,
        currency: plan.currency.toUpperCase(),
        interval: plan.interval,
        status: 'active',
        start_date: new Date(),
        end_date: stripe.currentPeriodEnd,
        next_billing_date: stripe.currentPeriodEnd,
        trial_start: stripe.trialStart,
        trial_end: stripe.trialEnd,
        subscription_id: stripe.subscriptionId,
        payment_method_id: stripe.paymentMethodId,
        payment_method_brand: paymentMethod.brand,
        payment_method_last4: paymentMethod.last4,
        payment_method_funding: paymentMethod.funding,
        payment_method_type: paymentMethod.method_type,
        user_payment_method_id: pmRecord.id,
      },
    });
    return subscription;
  }

  async cancel(userId: string) {
    const active = await this.getActive(userId);
    if (!active) throw new NotFoundException('No active subscription');
    if (active.cancel_at_end) {
      return active; // already scheduled
    }
    return this.prisma.subscription.update({
      where: { id: active.id },
      data: { cancel_at_end: true, canceled_at: new Date() },
    });
  }
}
