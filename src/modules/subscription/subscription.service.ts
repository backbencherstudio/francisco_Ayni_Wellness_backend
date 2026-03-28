import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import appConfig from '../../config/app.config';
import { SubscriptionPlan } from '@prisma/client';
import { UpsertIapPlanDto } from './dto/upsert-iap-plan.dto';
import { CreateTrialServiceDto } from './dto/create-trial-service.dto';

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

  async createOrUpdateTrialService(dto: CreateTrialServiceDto) {
    try {
      const trialDays =
        dto.trialDays ||
        appConfig().subscription.trial_days ||
        Number(process.env.TRIAL_DAYS || 14);

      const payload = {
        name: dto.name || 'Free Trial',
        slug: dto.slug || 'free_trial',
        description: dto.description || `${trialDays}-day free trial access`,
        price_description: dto.price_description || `Free for ${trialDays} days`,
        price: 0,
        currency: 'USD',
        interval: 'MONTH' as any,
        intervalCount: 1,
        trialDays,
        type: SubscriptionPlan.TRIALING,
        isFree: true,
        isActive: dto.isActive ?? true,
        displayOrder: dto.displayOrder ?? 1,
        stripeProductId: null,
        stripePriceId: null,
        appleProductId: null,
        googleProductId: null,
        googleBasePlanId: null,
        googleOfferId: null,
      };

      const existing = await this.prisma.subsPlan.findFirst({
        where: {
          OR: [
            { slug: payload.slug },
            { type: SubscriptionPlan.TRIALING, isFree: true },
          ],
        },
      });

      const plan = existing
        ? await this.prisma.subsPlan.update({
            where: { id: existing.id },
            data: payload,
          })
        : await this.prisma.subsPlan.create({
            data: payload,
          });

      return {
        success: true,
        statusCode: 200,
        message: existing
          ? 'Trial service updated successfully'
          : 'Trial service created successfully',
        data: plan,
      };
    } catch (error: any) {
      this.logger.error(`Error creating/updating trial service: ${error.message}`);
      throw error;
    }
  }

  async startTrial(user: any, planId?: string) {
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

      const plan = planId
        ? await this.prisma.subsPlan.findFirst({
            where: {
              id: planId,
              type: SubscriptionType.TRIALING,
              isFree: true,
              isActive: true,
            },
          })
        : await this.prisma.subsPlan.findFirst({
            where: {
              type: SubscriptionType.TRIALING,
              isFree: true,
              isActive: true,
            },
            orderBy: { displayOrder: 'asc' },
          });

      if (!plan) {
        throw new BadRequestException(
          'Trial service plan not found. Run seed to create the free_trial plan.',
        );
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
            provider: 'NONE' as any,
            stripeSubId: null,
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
            provider: 'NONE' as any,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }

      await this.prisma.user.update({
        where: { id: user.userId },
        data: { IsSubscriptionActive: true },
      });

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

  async getUnifiedSubscriptionStatus(userId: string) {
    try {
      const now = new Date();

      const [activeTrial, activeIap, latestAny] = await Promise.all([
        this.prisma.subscription.findFirst({
          where: {
            userId,
            provider: 'NONE' as any,
            isTrial: true,
            isActive: true,
            status: 'trialing',
            OR: [{ endDate: null }, { endDate: { gt: now } }],
          },
          include: { plan: true },
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.subscription.findFirst({
          where: {
            userId,
            provider: { in: ['APPLE', 'GOOGLE'] },
            isActive: true,
            OR: [{ endDate: null }, { endDate: { gt: now } }],
          },
          include: { plan: true },
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.subscription.findFirst({
          where: { userId },
          include: { plan: true },
          orderBy: { updatedAt: 'desc' },
        }),
      ]);

      const current = activeIap || activeTrial || latestAny || null;
      const hasActiveEntitlement = !!(activeIap || activeTrial);

      return {
        success: true,
        statusCode: 200,
        data: {
          hasSubscription: hasActiveEntitlement,
          source: activeIap ? 'iap' : activeTrial ? 'trial' : 'none',
          isTrialActive: !!activeTrial,
          isIapActive: !!activeIap,
          provider: current?.provider || null,
          status: hasActiveEntitlement ? current?.status || 'active' : 'none',
          isActive: hasActiveEntitlement,
          startDate: current?.startDate || null,
          endDate: current?.endDate || null,
          trialEndsAt: activeTrial?.trialEndsAt || null,
          cancelAtPeriodEnd: activeIap?.cancelAtPeriodEnd || false,
          plan: current?.plan
            ? {
                id: current.plan.id,
                name: current.plan.name,
                slug: current.plan.slug,
                type: current.plan.type,
                isFree: current.plan.isFree,
              }
            : null,
        },
      };
    } catch (error: any) {
      this.logger.error(`Error getting unified subscription status: ${error.message}`);
      throw error;
    }
  }

  async getMobilePlans(platform: string = 'all') {
    try {
      const normalizedPlatform = ['ios', 'android', 'all'].includes(platform)
        ? platform
        : 'all';

      const plans = await this.prisma.subsPlan.findMany({
        where: {
          isActive: true,
        },
        orderBy: [{ displayOrder: 'asc' }, { price: 'asc' }],
      });

      const mappedPlans = plans
        .map((plan) => {
          const supportsIos = !!plan.appleProductId;
          const supportsAndroid = !!plan.googleProductId;

          if (normalizedPlatform === 'ios' && !supportsIos) return null;
          if (normalizedPlatform === 'android' && !supportsAndroid) return null;

          return {
            id: plan.id,
            name: plan.name,
            slug: plan.slug,
            description: plan.description,
            price_description: plan.price_description,
            type: plan.type,
            isFree: plan.isFree,
            isActive: plan.isActive,
            displayOrder: plan.displayOrder,
            trialDays: plan.trialDays,
            pricing: {
              price: plan.price,
              currency: plan.currency,
              interval: plan.interval,
              intervalCount: plan.intervalCount,
            },
            store_mapping: {
              apple: {
                productId: plan.appleProductId,
              },
              google: {
                productId: plan.googleProductId,
                basePlanId: plan.googleBasePlanId,
                offerId: plan.googleOfferId,
              },
            },
            supported_platforms: {
              ios: supportsIos,
              android: supportsAndroid,
            },
          };
        })
        .filter(Boolean);

      return {
        success: true,
        statusCode: 200,
        platform: normalizedPlatform,
        data: mappedPlans,
      };
    } catch (error) {
      this.logger.error(`Error retrieving mobile plans: ${error.message}`);
      throw error;
    }
  }

  async upsertIapPlan(dto: UpsertIapPlanDto) {
    try {
      const data: any = {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        price_description: dto.price_description,
        price: dto.price,
        currency: dto.currency,
        interval: dto.interval,
        intervalCount: dto.intervalCount,
        trialDays: dto.trialDays,
        type: dto.type || SubscriptionPlan.BASIC,
        isFree: dto.isFree ?? false,
        isActive: dto.isActive ?? true,
        displayOrder: dto.displayOrder ?? 0,
        appleProductId: dto.appleProductId,
        googleProductId: dto.googleProductId,
        googleBasePlanId: dto.googleBasePlanId,
        googleOfferId: dto.googleOfferId,
      };

      const normalizedAppleId = dto.appleProductId?.trim?.();
      if (normalizedAppleId) {
        const conflictApple = await this.prisma.subsPlan.findFirst({
          where: {
            appleProductId: normalizedAppleId,
            ...(dto.id ? { NOT: { id: dto.id } } : {}),
          },
          select: { id: true },
        });
        if (conflictApple) {
          throw new BadRequestException(
            `Apple product '${normalizedAppleId}' is already mapped to another plan`,
          );
        }
      }

      const plan = dto.id
        ? await this.prisma.subsPlan.update({
            where: { id: dto.id },
            data,
          })
        : await this.prisma.subsPlan.create({
            data,
          });

      this.logger.log(`IAP plan upserted: ${plan.id}`);

      return {
        success: true,
        statusCode: 200,
        message: dto.id
          ? 'IAP mapping plan updated successfully'
          : 'IAP mapping plan created successfully',
        data: plan,
      };
    } catch (error) {
      this.logger.error(`Error upserting IAP plan: ${error.message}`);
      throw error;
    }
  }

}
