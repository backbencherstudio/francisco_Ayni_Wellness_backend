import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';

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
export class SubscriptionSchedulerService {
  private readonly logger = new Logger(SubscriptionSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  // Automatically expire trials after end date.
  @Cron(CronExpression.EVERY_10_MINUTES)
  async expireEndedTrials() {
    const now = new Date();

    try {
      const result = await this.prisma.subscription.updateMany({
        where: {
          isActive: true,
          status: SubscriptionStatus.TRIALING,
          isTrial: true,
          OR: [
            { trialEndsAt: { not: null, lte: now } },
            { endDate: { not: null, lte: now } },
          ],
        },
        data: {
          isActive: false,
          status: SubscriptionStatus.EXPIRED,
          type: SubscriptionType.FREE,
          remainingDays: 0,
          updatedAt: now,
        },
      });

      if (result.count > 0) {
        this.logger.log(`Expired ${result.count} trial subscription(s).`);
      }
    } catch (err: any) {
      this.logger.error(`Trial expiration cron failed: ${err?.message || err}`);
    }
  }

  // Send "trial ending soon" notification 3 days before trial ends
  @Cron(CronExpression.EVERY_HOUR)
  async sendTrialEndingNotifications() {
    const now = new Date();
    const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    try {
      // Find trials that end in 3 days (with 1-hour window)
      const expiringTrials = await this.prisma.subscription.findMany({
        where: {
          isActive: true,
          status: SubscriptionStatus.TRIALING,
          isTrial: true,
          trialEndsAt: {
            gte: new Date(threeDaysLater.getTime() - 60 * 60 * 1000), // 1 hour before
            lte: threeDaysLater,
          },
        },
      });

      for (const subscription of expiringTrials) {
        try {
          // Get user data
          const user = await this.prisma.user.findUnique({
            where: { id: subscription.userId },
            select: {
              id: true,
              email: true,
              name: true,
            },
          });

          if (!user?.email) {
            continue;
          }

          // Send email notification
          await this.mailService.sendTrialEndingSoonEmail({
            email: user.email,
            name: user.name || 'User',
            endDate: subscription.trialEndsAt,
            daysRemaining: Math.ceil(
              (subscription.trialEndsAt.getTime() - now.getTime()) / (1000 * 24 * 60 * 60),
            ),
          }).catch((err) => {
            this.logger.warn(
              `Failed to send trial ending soon email to ${user.email}: ${err.message}`,
            );
          });

          this.logger.log(
            `Sent trial ending notification for user ${subscription.userId}`,
          );
        } catch (err: any) {
          this.logger.error(
            `Failed to send trial ending notification for user ${subscription.userId}: ${err?.message || err}`,
          );
        }
      }

      if (expiringTrials.length > 0) {
        this.logger.log(`Sent ${expiringTrials.length} trial ending notifications`);
      }
    } catch (err: any) {
      this.logger.error(`Trial ending notification cron failed: ${err?.message || err}`);
    }
  }
}
