import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { StripePayment } from '../../common/lib/Payment/stripe/StripePayment';
import appConfig from '../../config/app.config';
import { SubscriptionPlan } from '@prisma/client';
import { CreateProductAndPriceDto } from './dto/createProductAndPrice.dto';
import { AddCardDto } from './dto/AddCardDto.dto';

@Injectable()
export class SubscriptionService {
  constructor(private prisma: PrismaService) {}

  async startTrial(user: any, planId: string) {
    // Check if user has ever used a trial
    const trialUsed = await this.prisma.subscription.findFirst({
      where: {
        userId: user.userId,
        isTrial: true,
      },
    });

    if (trialUsed) {
      throw new BadRequestException('User has already used the trial period');
    }

    // Check for active subscription (prevent overlapping active subscriptions if needed)
    const activeSubscription = await this.prisma.subscription.findFirst({
      where: {
        userId: user.userId,
        isActive: true,
      },
    });

    if (activeSubscription && activeSubscription.type !== SubscriptionPlan.FREE) {
      throw new BadRequestException('User already has an active subscription');
    }

    const plan = await this.prisma.subsPlan.findFirst({
      where: {
        id: planId,
        type: 'TRIALING',
      },
    });

    if (!plan) {
      throw new BadRequestException('Plan not found');
    }

    const trialDays = plan.trialDays || appConfig().subscription.trial_days;
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + trialDays);

    // calculate remaining days
    const remainingDays = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24),
    );

    // If user has a FREE subscription, update it, otherwise create new
    if (activeSubscription) {
      await this.prisma.subscription.update({
        where: { id: activeSubscription.id },
        data: {
          planId: plan.id,
          type: plan.type,
          status: 'trialing',
          isActive: true,
          startDate: startDate,
          endDate: endDate,
          trialEndsAt: endDate,
          remainingDays: remainingDays,
          isTrial: true,
          updatedAt: new Date(),
        },
      });
    } else {
      await this.prisma.subscription.create({
        data: {
          userId: user.userId,
          planId: plan.id,
          type: plan.type,
          status: 'trialing',
          isActive: true,
          startDate: startDate,
          endDate: endDate,
          trialEndsAt: endDate,
          remainingDays: remainingDays,
          isTrial: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    return {
      success: true,
      message: `Trial started for ${trialDays} days`,
      data: {
        startDate: startDate,
        endDate: endDate,
      },
    };
  }

  async getSubscriptionStatus(userId: string) {
    let subscription = await this.prisma.subscription.findFirst({
      where: {
        userId: userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!subscription) {
      return {
        success: false,
        plan: SubscriptionPlan.FREE,
        status: 'inactive',
      };
    }

    // Check logic for expiration and remaining days
    if (subscription.isActive && subscription.endDate) {
      const now = new Date();
      if (now > subscription.endDate) {
        // Expired: Downgrade to FREE
        subscription = await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            isActive: false,
            status: 'expired',
            type: SubscriptionPlan.FREE,
            remainingDays: 0,
          },
        });
      } else {
        // Active: Update remaining days
        const remainingDays = Math.ceil(
          (subscription.endDate.getTime() - now.getTime()) / (1000 * 3600 * 24),
        );

        if (remainingDays !== subscription.remainingDays) {
          subscription = await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: {
              remainingDays: remainingDays > 0 ? remainingDays : 0,
            },
          });
        }
      }
    }

    return {
      success: true,
      subscription: subscription,
    };
  }

  async createProductAndPrice(dto: CreateProductAndPriceDto) {
    
    const { product, price } = await StripePayment.createProductAndPrice({
      name: dto.name,
      unit_amount: Math.round(dto.price * 100), // Stripe requires cents
      currency: dto.currency,
      interval: dto.interval,
      interval_count: dto.interval_count,
    });

    const productRecord = await this.prisma.subsPlan.create({
      data: {
        stripeProductId: product.id,
        stripePriceId: price.id,
        name: dto.name,
        slug: dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        price: dto.price,
        currency: dto.currency,
        interval: dto.interval.toUpperCase() as any,
        intervalCount: dto.interval_count,
        description: dto.product_description,
        price_description: dto.price_description,
        trialDays: dto.trialDays,
        type: dto.type,
      },
    });

    return productRecord;
  }

  async addCard(user: any, addCardDto: AddCardDto) {
    try {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.userId },
      });

      if (!dbUser) {
        throw new BadRequestException('User not found');
      }

      // Check if user already has an active subscription
      const existingSubscription = await this.prisma.subscription.findFirst({
        where: {
          userId: dbUser.id,
        },
      });

      if (existingSubscription && existingSubscription.isActive) {
        throw new BadRequestException(
          'User already has an active subscription',
        );
      }

      let customerId = dbUser.billing_id;

      if (!customerId) {
        // Create Stripe Customer
        const customer = await StripePayment.createCustomer({
          email: dbUser.email,
          name: `${dbUser.first_name} ${dbUser.last_name}`,
          user_id: dbUser.id,
        });
        customerId = customer.id;

        // Update user with billing_id
        await this.prisma.user.update({
          where: { id: dbUser.id },
          data: { billing_id: customerId },
        });
      }

      const productRecord = await this.prisma.subsPlan.findFirst({
        where: { id: addCardDto.productId },
      });
      if (!productRecord) {
        throw new BadRequestException('Subscription plan not found for user');
      }

      const paymentMethod = await StripePayment.createPaymentMethod(
        addCardDto.token,
        dbUser.billing_id,
      );

      const subscription = await StripePayment.createSubscription({
        payment_method_id: paymentMethod.id,
        customer_id: dbUser.billing_id,
        price_id: productRecord.stripePriceId,
        // trial_period_days: productRecord.trialDays,
      });

      const existingSub = await this.prisma.subscription.findFirst({
        where: { userId: dbUser.id },
      });

      let updatedSubscription;
      const subData = {
        userId: dbUser.id,
        isActive: true,
        plan: { connect: { id: productRecord.id } },
        startDate: new Date(
          ((subscription as any).current_period_start ||
            (subscription as any).start_date ||
            (subscription as any).created) * 1000,
        ),
        endDate: (subscription as any).ended_at
          ? new Date((subscription as any).ended_at * 1000)
          : (subscription as any).current_period_end
            ? new Date((subscription as any).current_period_end * 1000)
            : (subscription as any).trial_end
              ? new Date((subscription as any).trial_end * 1000)
              : null,
        trialEndsAt: (subscription as any).trial_end
          ? new Date((subscription as any).trial_end * 1000)
          : null,

        stripeSubId: subscription.id,
        cancelAtPeriodEnd: (subscription as any).cancel_at_period_end || false,
        status: (subscription as any).status,
        type: productRecord.type.toUpperCase(),
        isTrial: productRecord.trialDays > 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (existingSub) {
        updatedSubscription = await this.prisma.subscription.update({
          where: { id: existingSub.id },
          data: subData,
        });
      } else {
        updatedSubscription = await this.prisma.subscription.create({
          data: subData,
        });
      }

      return {
        success: true,
        message: 'Card added successfully',
        data: subscription,
      };
    } catch (error) {
      throw new BadRequestException('Failed to add card: ' + error.message);
    }
  }

  async getAllPlans() {
    const plans = await this.prisma.subsPlan.findMany({
      orderBy: { price: 'asc' },
    });
    return {
      success: true,
      plans: plans,
    };
  }

  async cancelSubscription(userId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        userId: userId,
        isActive: true,
      },
    });

    if (!subscription) {
      throw new BadRequestException('No active subscription found');
    }

    try {
      let status = 'canceled';

      if (subscription.stripeSubId) {
        const canceledSub = await StripePayment.cancelSubscription(
          subscription.stripeSubId,
        );
        status = canceledSub.status;
      }

      // Update local DB
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          isActive: false,
          status: status,
          type: SubscriptionPlan.FREE,
          endDate: new Date(),
          remainingDays: 0,
        },
      });

      return {
        success: true,
        message: 'Subscription canceled successfully',
      };
    } catch (error) {
      throw new BadRequestException(
        'Failed to cancel subscription: ' + error.message,
      );
    }
  }
}
