import { Module } from '@nestjs/common';
import { SubscriptionScheduler } from './subscription.scheduler';
import { PrismaModule } from '../../prisma/prisma.module';
import { SubscriptionController } from './subscription.controller';
import { AppSubscriptionService } from './subscription.service';

@Module({
  imports: [PrismaModule],
  providers: [SubscriptionScheduler, AppSubscriptionService],
  controllers: [SubscriptionController],
  exports: [AppSubscriptionService],
})
export class SubscriptionModule {}
