import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
// import { SubscriptionGuard } from 'src/common/guard/subscription/subscription.guard';

@ApiBearerAuth()
@ApiTags('Reminders')
@UseGuards(JwtAuthGuard)
@Controller('reminders')
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @ApiOperation({ summary: 'Set reminders' })
  @Post('set')
  async setReminders(
    @GetUser() user,
    @Body()
    body: {
      reminder_time: string;
      preferred_time?: string;
      habit_id?: string;
      routine_id?: string;
      date?: string;
      tz?: string;
      days?: string[] | string;
      name?: string;
    },
  ) {
    try {
      return await this.remindersService.setReminders(user.userId, body);
    } catch (error) {
      console.error('Error fetching reminders', error);
    }
  }

  @ApiOperation({ summary: 'Get all reminders' })
  @Get()
  async getAllReminders(@GetUser() user) {
    try {
      console.log('Fetching reminders for user:', user);
      return await this.remindersService.getAllReminders(user.userId);
    } catch (error) {
      console.error('Error fetching reminders:', error);
      throw error;
    }
  }

  @ApiOperation({ summary: 'Get upcoming reminders' })
  @Get('upcoming')
  async getUpcomingReminders(@GetUser() user) {
    try {
      console.log('Fetching upcoming reminders for user:', user);
      return await this.remindersService.getUpcomingReminders(user.userId);
    } catch (error) {
      console.error('Error fetching upcoming reminders:', error);
      throw error;
    }
  }

  @ApiOperation({
    summary: 'List 30-minute reminder slots for a preferred time window',
  })
  @Get('reminder-slots/:preferred')
  async reminderSlots(@Param('preferred') preferred: string) {
    return this.remindersService.getReminderSlots(preferred);
  }

  @ApiOperation({ summary: 'Turn off/on a reminder' })
  @Patch(':id/turn-off-on')
  async turnOffOnReminder(@GetUser() user, @Param('id') id: string) {
    try {
      console.log('Turning off/on reminder for reminder:', id);

      return await this.remindersService.turnOffOnReminder(user.userId, id);
    } catch (error) {
      console.error('Error turning off/on reminder:', error);
      throw error;
    }
  }

  @ApiOperation({ summary: 'Edit a reminder' })
  @Patch(':id')
  async editReminder(
    @GetUser() user,
    @Param('id') id: string,
    @Body() updateReminderDto: UpdateReminderDto,
  ) {
    try {
      return await this.remindersService.editReminder(
        user.userId,
        id,
        updateReminderDto,
      );
    } catch (error) {
      console.error('Error in edit', error);
    }
  }

  @ApiOperation({ summary: 'Delete a reminder' })
  @Delete(':id')
  async deleteReminder(@GetUser() user, @Param('id') id: string) {
    try {
      return await this.remindersService.deleteReminder(user.userId, id);
    } catch (error) {
      console.error('Error in delete', error);
    }
  }
}
