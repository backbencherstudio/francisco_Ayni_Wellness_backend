import { Injectable, Logger } from '@nestjs/common';
import { StripePayment } from '../../../common/lib/Payment/stripe/StripePayment';
import { PrismaService } from '../../../prisma/prisma.service';
import { SubscriptionPlan } from '@prisma/client';
import appConfig from '../../../config/app.config';

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
        await this.handleSubscriptionUpdate(event.data.object as any);
        break;
      default:
        this.logger.log(`Unhandled event type ${event.type}`);
    }

    return { received: true };
  }

  private async handleSubscriptionUpdate(subscription: any) {
    const customerId = subscription.customer;
    const status = subscription.status;
    const planId = subscription.items.data[0].price.id;
    const currentPeriodStart = new Date(
      subscription.current_period_start * 1000,
    );
    const currentPeriodEnd = new Date(subscription.current_period_end * 1000);

    // Find user by billing_id
    const user = await this.prisma.user.findFirst({
      where: { billing_id: customerId },
    });

    if (!user) {
      this.logger.error(`User not found for customer ID: ${customerId}`);
      return;
    }

    // let plan = SubscriptionPlan.FREE;
    // if (planId === appConfig().payment.stripe.price_monthly) {
    //   plan = SubscriptionPlan.PREMIUM_MONTHLY;
    // } else if (planId === appConfig().payment.stripe.price_yearly) {
    //   plan = SubscriptionPlan.PREMIUM_YEARLY;
    // }

    // await this.prisma.subscription.upsert({
    //   where: { user_id: user.id },
    //   update: {
    //     plan: status === 'active' || status === 'trialing' ? plan : SubscriptionPlan.FREE,
    //     status: status,
    //     started_at: currentPeriodStart,
    //     expires_at: currentPeriodEnd,
    //   },
    //   create: {
    //     user_id: user.id,
    //     plan: status === 'active' || status === 'trialing' ? plan : SubscriptionPlan.FREE,
    //     status: status,
    //     started_at: currentPeriodStart,
    //     expires_at: currentPeriodEnd,
    //   },
    // });
  }
}
