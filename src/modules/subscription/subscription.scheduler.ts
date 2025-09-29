import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SubscriptionScheduler {
  private readonly logger = new Logger(SubscriptionScheduler.name);

  constructor(
    private prisma: PrismaService,
    private schedulerRegistry: SchedulerRegistry,
  ) {}

  // Runs every minute to catch expirations quickly
  @Cron(CronExpression.EVERY_MINUTE)
  async expireEndedSubscriptions() {
    const now = new Date();
    try {
      console.log(
        'Running subscription expiration check at',
        now.toISOString(),
      );

      const toExpire = await this.prisma.subscription.findMany({
        where: {
          status: 'active',
          end_date: { lte: now },
        },
        select: { id: true, user_id: true },
      });

      if (toExpire.length === 0) return;

      const ids = toExpire.map((s) => s.id);
      await this.prisma.subscription.updateMany({
        where: { id: { in: ids } },
        data: { status: 'expired' },
      });

      this.logger.log(`Expired ${ids.length} subscriptions: ${ids.join(', ')}`);
      console.log(`Expired ${ids.length} subscriptions: ${ids.join(', ')}`);

      //  clean up or archive logic could go here
    } catch (error) {
      this.logger.error('Failed to expire subscriptions', error.stack);
    }
  }
}
