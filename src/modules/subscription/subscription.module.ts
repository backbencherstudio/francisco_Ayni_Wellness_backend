import { Module } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { SubscriptionSchedulerService } from './subscription.scheduler';

@Module({
  imports: [PrismaModule],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, SubscriptionSchedulerService],
})
export class SubscriptionModule {}
