import { Injectable, Logger } from '@nestjs/common';
import { StripePayment } from '../../../common/lib/Payment/stripe/StripePayment';
import { PrismaService } from '../../../prisma/prisma.service';
import { SubscriptionPlan } from '@prisma/client';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);

  constructor(private prisma: PrismaService) {}

  async handleWebhook(rawBody: string, sig: string | string[]) {
    const event = StripePayment.handleWebhook(rawBody, sig);

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.handleSubscriptionUpdate(event.data.object as any, event.type);
        break;
      default:
        this.logger.log(`Unhandled event type ${event.type}`);
    }

    return { received: true };
  }

  private pickUnixSeconds(...values: Array<any>): number | null {
    for (const v of values) {
      const n = typeof v === 'string' ? Number(v) : v;
      if (typeof n === 'number' && Number.isFinite(n) && n > 0) return n;
    }
    return null;
  }

  private async handleSubscriptionUpdate(
    subscription: any,
    eventType:
      | 'customer.subscription.created'
      | 'customer.subscription.updated'
      | 'customer.subscription.deleted',
  ) {
    const customerId = subscription.customer;
    const status: string = subscription.status;
    const stripeSubId: string = subscription.id;
    const item0 = subscription?.items?.data?.[0];
    const stripePriceId: string | undefined = item0?.price?.id;

    // Find user by billing_id
    const user = await this.prisma.user.findFirst({
      where: { billing_id: customerId },
    });

    if (!user) {
      this.logger.error(`User not found for customer ID: ${customerId}`);
      return;
    }

    if (!stripePriceId) {
      this.logger.error(
        `Stripe subscription ${stripeSubId} missing items.data[0].price.id`,
      );
      return;
    }

    // Map Stripe price -> SubsPlan
    const plan = await this.prisma.subsPlan.findFirst({
      where: { stripePriceId },
    });

    if (!plan) {
      this.logger.error(`SubsPlan not found for stripePriceId=${stripePriceId}`);
      return;
    }

    const startUnix = this.pickUnixSeconds(
      subscription.current_period_start,
      item0?.current_period_start,
      subscription.start_date,
      subscription.created,
    );
    const endUnix = this.pickUnixSeconds(
      subscription.current_period_end,
      item0?.current_period_end,
      subscription.ended_at,
    );
    const trialEndUnix = this.pickUnixSeconds(subscription.trial_end);
    const now = new Date();

    const hasPeriodEnd = !!endUnix;
    const endDate = hasPeriodEnd ? new Date(endUnix! * 1000) : null;

    const entitledByStatus = status === 'active' || status === 'trialing';
    const entitledByEvent = eventType !== 'customer.subscription.deleted';
    const entitledByDate = endDate ? endDate > now : true;
    const isActive = entitledByStatus && entitledByEvent && entitledByDate;

    const remainingDays = endDate
      ? Math.max(
          0,
          Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 3600 * 24)),
        )
      : null;

    const existing = await this.prisma.subscription.findFirst({
      where: {
        OR: [{ stripeSubId }, { userId: user.id }],
      },
      orderBy: { createdAt: 'desc' },
    });

    const data: any = {
      userId: user.id,
      plan: { connect: { id: plan.id } },
      stripeSubId,
      status,
      cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
      startDate: startUnix ? new Date(startUnix * 1000) : now,
      endDate,
      trialEndsAt: trialEndUnix ? new Date(trialEndUnix * 1000) : null,
      remainingDays: remainingDays ?? undefined,
      isTrial: status === 'trialing' || !!trialEndUnix,
      isActive,
      type: isActive ? String(plan.type) : SubscriptionPlan.FREE,
      updatedAt: now,
    };

    if (existing) {
      await this.prisma.subscription.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await this.prisma.subscription.create({
        data: {
          ...data,
          createdAt: now,
        },
      });
    }

    // Optional mirror field on User for quick UI checks
    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { IsSubscriptionActive: isActive },
      });
    } catch (e: any) {
      this.logger.warn(
        `Failed to update user.IsSubscriptionActive for user=${user.id}: ${e?.message || e}`,
      );
    }
  }
}
