import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionPlan } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SubscriptionSchedulerService {
  private readonly logger = new Logger(SubscriptionSchedulerService.name);

  constructor(private prisma: PrismaService) {}

  // Automatically expire trials after end date.
  @Cron(CronExpression.EVERY_10_MINUTES)
  async expireEndedTrials() {
    const now = new Date();

    try {
      const result = await this.prisma.subscription.updateMany({
        where: {
          isActive: true,
          status: 'trialing',
          isTrial: true,
          OR: [
            { trialEndsAt: { not: null, lte: now } },
            { endDate: { not: null, lte: now } },
          ],
        },
        data: {
          isActive: false,
          status: 'expired',
          type: SubscriptionPlan.FREE,
          remainingDays: 0,
          updatedAt: now,
        },
      });

    //   if (result.count > 0) {
    //     this.logger.log(`Expired ${result.count} trial subscription(s).`);
    //   }
      this.logger.log(`Expired ${result.count} trial subscription(s).`);
    } catch (err: any) {
      this.logger.error(`Trial expiration cron failed: ${err?.message || err}`);
    }
  }
}
