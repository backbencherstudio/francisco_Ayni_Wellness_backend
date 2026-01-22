import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { StripePayment } from '../../common/lib/Payment/stripe/StripePayment';
import appConfig from '../../config/app.config';
import { SubscriptionPlan } from '@prisma/client';
import { CreateProductAndPriceDto } from './dto/createProductAndPrice.dto';
import { AddCardDto } from './dto/AddCardDto.dto';

// ===== Subscription Status Enum =====
enum SubscriptionStatus {
  TRIALING = 'trialing',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELED = 'canceled',
  PAST_DUE = 'past_due',
  PAUSED = 'paused',
}

// ===== Subscription Type Enum =====
enum SubscriptionType {
  FREE = 'FREE',
  TRIALING = 'TRIALING',
  BASIC = 'BASIC',
  PREMIUM = 'PREMIUM',
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  async startTrial(user: any, planId: string) {
    try {
      if (!user || !user.userId) {
        throw new BadRequestException('Invalid user');
      }

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

      if (
        activeSubscription &&
        activeSubscription.type !== SubscriptionType.FREE
      ) {
        throw new BadRequestException('User already has an active subscription');
      }

      const plan = await this.prisma.subsPlan.findFirst({
        where: {
          id: planId,
          type: SubscriptionType.TRIALING,
        },
      });

      if (!plan) {
        throw new BadRequestException('Plan not found or not a trial plan');
      }

      const trialDays = plan.trialDays || appConfig().subscription.trial_days;
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(startDate.getDate() + trialDays);

      // calculate remaining days
      const remainingDays = Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24),
      );

      // Get user email for notifications
      const userDetails = await this.prisma.user.findUnique({
        where: { id: user.userId },
        select: { email: true, name: true },
      });

      // If user has a FREE subscription, update it, otherwise create new
      if (activeSubscription) {
        await this.prisma.subscription.update({
          where: { id: activeSubscription.id },
          data: {
            planId: plan.id,
            type: plan.type,
            status: SubscriptionStatus.TRIALING,
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
            status: SubscriptionStatus.TRIALING,
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

      // Send trial started email notification
      if (userDetails?.email) {
        await this.mailService.sendTrialStartedEmail({
          email: userDetails.email,
          name: userDetails.name || 'User',
          endDate: endDate,
          trialDays: trialDays,
        }).catch((err) => {
          this.logger.warn(`Failed to send trial started email: ${err.message}`);
        });
      }

      this.logger.log(`Trial started for user ${user.userId} for ${trialDays} days`);

      return {
        success: true,
        statusCode: 200,
        message: `Trial started for ${trialDays} days`,
        data: {
          startDate: startDate,
          endDate: endDate,
          trialDays: trialDays,
        },
      };
    } catch (error) {
      this.logger.error(`Error starting trial: ${error.message}`);
      throw error;
    }
  }

  async getSubscriptionStatus(userId: string) {
    try {
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
          statusCode: 200,
          plan: SubscriptionType.FREE,
          status: SubscriptionStatus.EXPIRED,
        };
      }

      // Check logic for expiration and remaining days
      if (subscription.isActive && subscription.endDate) {
        const now = new Date();
        
        // If subscription has ended
        if (now > subscription.endDate) {
          // AUTO-RENEWAL LOGIC: Check Stripe to see if subscription auto-renewed
          if (subscription.stripeSubId) {
            try {
              const stripeSubscription = await StripePayment.getSubscription(
                subscription.stripeSubId,
              );

              // If Stripe shows active, subscription was auto-renewed
              if (stripeSubscription && stripeSubscription.status === 'active') {
                // Update local endDate to match Stripe's current_period_end
                const stripeSub = stripeSubscription as any;
                const newEndDate = new Date((stripeSub.current_period_end || 0) * 1000);
                
                subscription = await this.prisma.subscription.update({
                  where: { id: subscription.id },
                  data: {
                    isActive: true,
                    status: SubscriptionStatus.ACTIVE,
                    endDate: newEndDate,
                    remainingDays: Math.ceil(
                      (newEndDate.getTime() - now.getTime()) / (1000 * 3600 * 24),
                    ),
                    updatedAt: new Date(),
                  },
                });

                this.logger.log(
                  `Auto-renewal detected for user ${userId}. New end date: ${newEndDate}`,
                );
              } else {
                // Stripe shows inactive/canceled - mark as expired
                subscription = await this.prisma.subscription.update({
                  where: { id: subscription.id },
                  data: {
                    isActive: false,
                    status: SubscriptionStatus.EXPIRED,
                    type: SubscriptionType.FREE,
                    remainingDays: 0,
                    updatedAt: new Date(),
                  },
                });

                this.logger.log(`Subscription expired for user ${userId}`);
              }
            } catch (stripeError) {
              this.logger.error(
                `Error checking Stripe subscription ${subscription.stripeSubId}: ${stripeError.message}`,
              );
              // If Stripe check fails, mark as expired in local DB
              subscription = await this.prisma.subscription.update({
                where: { id: subscription.id },
                data: {
                  isActive: false,
                  status: SubscriptionStatus.EXPIRED,
                  type: SubscriptionType.FREE,
                  remainingDays: 0,
                  updatedAt: new Date(),
                },
              });
            }
          } else {
            // No Stripe ID - mark as expired
            subscription = await this.prisma.subscription.update({
              where: { id: subscription.id },
              data: {
                isActive: false,
                status: SubscriptionStatus.EXPIRED,
                type: SubscriptionType.FREE,
                remainingDays: 0,
                updatedAt: new Date(),
              },
            });
          }
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
                updatedAt: new Date(),
              },
            });
          }
        }
      }

      return {
        success: true,
        statusCode: 200,
        subscription: subscription,
      };
    } catch (error) {
      this.logger.error(`Error getting subscription status: ${error.message}`);
      throw error;
    }
  }

  async createProductAndPrice(dto: CreateProductAndPriceDto) {
    try {
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

      this.logger.log(`Created new product and price: ${productRecord.id}`);

      return {
        success: true,
        statusCode: 200,
        data: productRecord,
      };
    } catch (error) {
      this.logger.error(`Error creating product and price: ${error.message}`);
      throw new BadRequestException(`Failed to create product: ${error.message}`);
    }
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

      let updatedSubscription;

      const pickUnixSeconds = (...values: Array<any>) => {
        for (const v of values) {
          const n = typeof v === 'string' ? Number(v) : v;
          if (typeof n === 'number' && Number.isFinite(n) && n > 0) return n;
        }
        return null;
      };

      const stripeSub: any = subscription as any;
      const item0: any = stripeSub?.items?.data?.[0];
      const startUnix = pickUnixSeconds(
        stripeSub?.current_period_start,
        item0?.current_period_start,
        stripeSub?.start_date,
        stripeSub?.created,
      );
      const endUnix = pickUnixSeconds(
        stripeSub?.current_period_end,
        item0?.current_period_end,
        stripeSub?.ended_at,
      );
      const trialEndUnix = pickUnixSeconds(stripeSub?.trial_end);

      const subData = {
        userId: dbUser.id,
        isActive: true,
        plan: { connect: { id: productRecord.id } },
        startDate: startUnix ? new Date(startUnix * 1000) : new Date(),
        endDate: endUnix ? new Date(endUnix * 1000) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // Default to 14 days if not set
        trialEndsAt: trialEndUnix ? new Date(trialEndUnix * 1000) : null,
        stripeSubId: subscription.id,
        cancelAtPeriodEnd: (subscription as any).cancel_at_period_end || false,
        status: SubscriptionStatus.ACTIVE,
        type: productRecord.type || SubscriptionType.BASIC,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (subData) {
        updatedSubscription = await this.prisma.subscription.create({
          data: subData,
        });
      } else {
        throw new BadRequestException('Failed to create subscription record');
      }

      // Send subscription confirmed email notification
      if (dbUser?.email) {
        await this.mailService.sendSubscriptionConfirmedEmail({
          email: dbUser.email,
          name: `${dbUser.first_name} ${dbUser.last_name}`,
          planName: productRecord.name,
          amount: productRecord.price,
          currency: productRecord.currency || 'USD',
          renewalDate: subData.endDate,
        }).catch((err) => {
          this.logger.warn(`Failed to send subscription confirmed email: ${err.message}`);
        });
      }

      this.logger.log(`Subscription created for user ${dbUser.id} with plan ${productRecord.id}`);

      return {
        success: true,
        statusCode: 200,
        message: 'Card added successfully',
        data: {
          subscriptionId: subscription.id,
          status: SubscriptionStatus.ACTIVE,
          startDate: subData.startDate,
          endDate: subData.endDate,
        },
      };
    } catch (error) {
      this.logger.error(`Error adding card: ${error.message}`);
      throw new BadRequestException('Failed to add card: ' + error.message);
    }
  }

  async getAllPlans() {
    try {
      const plans = await this.prisma.subsPlan.findMany({
        orderBy: { price: 'asc' },
      });

      this.logger.log(`Retrieved ${plans.length} subscription plans`);

      return {
        success: true,
        statusCode: 200,
        data: plans,
      };
    } catch (error) {
      this.logger.error(`Error retrieving plans: ${error.message}`);
      throw error;
    }
  }

  async cancelSubscription(userId: string) {
    try {
      const subscription = await this.prisma.subscription.findFirst({
        where: {
          userId: userId,
          isActive: true,
        },
      });

      if (!subscription) {
        throw new BadRequestException('No active subscription found');
      }

      let status = SubscriptionStatus.CANCELED;

      if (subscription.stripeSubId) {
        const canceledSub = await StripePayment.cancelSubscription(
          subscription.stripeSubId,
        );
        status = (canceledSub.status as any) || SubscriptionStatus.CANCELED;
      }

      // Get user email for cancellation notification
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });

      // Update local DB
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          isActive: false,
          status: status,
          type: SubscriptionType.FREE,
          endDate: new Date(),
          remainingDays: 0,
          updatedAt: new Date(),
        },
      });

      // Send cancellation email notification
      if (user?.email) {
        await this.mailService.sendSubscriptionCanceledEmail({
          email: user.email,
          name: user.name || 'User',
        }).catch((err) => {
          this.logger.warn(`Failed to send subscription canceled email: ${err.message}`);
        });
      }

      this.logger.log(`Subscription canceled for user ${userId}`);

      return {
        success: true,
        statusCode: 200,
        message: 'Subscription canceled successfully',
      };
    } catch (error) {
      this.logger.error(`Error canceling subscription: ${error.message}`);
      throw new BadRequestException(
        'Failed to cancel subscription: ' + error.message,
      );
    }
  }
}
