import { Module } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { RemindersController } from './reminders.controller';
import { ReminderSchedulerService } from './reminder.scheduler';

@Module({
  controllers: [RemindersController],
  providers: [RemindersService, ReminderSchedulerService],
})
export class RemindersModule {}
