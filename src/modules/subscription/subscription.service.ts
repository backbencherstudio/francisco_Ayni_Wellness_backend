import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { StripePayment } from '../../common/lib/Payment/stripe/StripePayment';
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
    status?: string;
    startDate?: Date;
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

    // Idempotency: if we already have this stripe subscription recorded, return it
    const existing = await this.prisma.subscription.findFirst({ where: { subscription_id: stripe.subscriptionId } });
    if (existing) return existing;

    // mark any existing active subs (non-trial) as replaced
    await this.prisma.subscription.updateMany({
      where: { user_id: userId, status: 'active', plan_name: { not: 'trial' } },
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

    const status = stripe.status || 'active';
    const startDate = stripe.startDate || new Date();
    const endDate = stripe.currentPeriodEnd;
    const subscription = await this.prisma.subscription.create({
      data: {
        user_id: userId,
        plan_name: plan.key,
        description: plan.name,
        plan_id: stripe.priceId,
        price: plan.price,
        currency: plan.currency.toUpperCase(),
        interval: plan.interval,
        status,
        start_date: startDate,
        end_date: endDate,
        next_billing_date: endDate,
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
    if (active.cancel_at_end) return active;
    if (active.subscription_id) {
      try {
        await (StripePayment as any).retrieveSubscription(active.subscription_id); // ensure exists
        // schedule cancellation at period end (keep minimal: rely on Stripe dashboard or a helper if you add one later)
        // If you want to actually set cancel_at_period_end at Stripe add an update helper; placeholder here
      } catch (e) {
        // ignore Stripe retrieval failure, still mark locally
      }
    }
    return this.prisma.subscription.update({
      where: { id: active.id },
      data: { cancel_at_end: true, canceled_at: new Date() },
    });
  }

  // Sync local from a Stripe subscription object (called by webhook controller)
  async syncFromStripe(sub: any) {
    if (!sub?.id) return;
    const priceObj = sub.items?.data?.[0]?.price;
    const interval = priceObj?.recurring?.interval; // 'month' | 'year'
    const derivedPlanKey = sub?.metadata?.plan_key || (interval === 'year' ? 'yearly' : 'monthly');
    const planDef = findPlan(derivedPlanKey) || findPlan(interval === 'year' ? 'yearly' : 'monthly');

    const endDate = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
    const trialStart = sub.trial_start ? new Date(sub.trial_start * 1000) : null;
    const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
    const startDate = sub.start_date ? new Date(sub.start_date * 1000) : new Date();

    const data: any = {
      status: sub.status,
      end_date: endDate,
      next_billing_date: endDate,
      trial_start: trialStart,
      trial_end: trialEnd,
      start_date: startDate,
      plan_id: priceObj?.id,
      plan_name: derivedPlanKey,
    };

    const existing = await this.prisma.subscription.findFirst({ where: { subscription_id: sub.id } });
    if (existing) {
      await this.prisma.subscription.update({ where: { id: existing.id }, data });
      return;
    }

    // If no existing record, create one (webhook-first creation scenario)
    const userId = sub.metadata?.user_id; // we set this when creating the subscription
    if (!userId) {
      // Cannot create without a user reference
      return;
    }

    // Try to discover / reuse stored default payment method details if expanded
    let paymentMethodBrand: string | undefined;
    let paymentMethodLast4: string | undefined;
    let paymentMethodFunding: string | undefined;
    let paymentMethodType: string | undefined;
    let paymentMethodId: string | undefined = sub.default_payment_method || sub.latest_invoice?.payment_intent?.payment_method || undefined;

    try {
      if (paymentMethodId) {
        const pm: any = await (StripePayment as any).retrievePaymentMethod(paymentMethodId);
        if (pm?.card) {
          paymentMethodBrand = pm.card.brand;
          paymentMethodLast4 = pm.card.last4;
          paymentMethodFunding = pm.card.funding;
          paymentMethodType = 'card';
        }
      }
    } catch (e) {
      // swallow errors; not critical for creation
    }

    await this.prisma.subscription.create({
      data: {
        user_id: userId,
        plan_name: derivedPlanKey,
        description: planDef?.name || derivedPlanKey,
        plan_id: priceObj?.id,
        price: (priceObj?.unit_amount || 0) / 100,
        currency: (priceObj?.currency || planDef?.currency || 'usd').toUpperCase(),
        interval: interval,
        status: sub.status,
        start_date: startDate,
        end_date: endDate,
        next_billing_date: endDate,
        trial_start: trialStart,
        trial_end: trialEnd,
        subscription_id: sub.id,
        payment_method_id: paymentMethodId,
        payment_method_brand: paymentMethodBrand,
        payment_method_last4: paymentMethodLast4,
        payment_method_funding: paymentMethodFunding,
        payment_method_type: paymentMethodType,
      },
    });
  }
}
