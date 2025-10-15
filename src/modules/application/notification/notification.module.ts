import { Global, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { AppNotificationController } from './notification.controller';

@Global()
@Module({
  providers: [NotificationGateway, NotificationService],
  controllers: [AppNotificationController],
  exports: [NotificationGateway, NotificationService],
})
export class NotificationModule {}
