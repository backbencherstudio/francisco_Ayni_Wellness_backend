import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { HabitService } from './habit.service';
import { CreateHabitDto } from './dto/create-habit.dto';
import { UpdateHabitDto } from './dto/update-habit.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { CompleteHabitDto } from './dto/complete-habit.dto';

@ApiTags('Habit')
@Controller('habit')
@UseGuards(JwtAuthGuard)
export class HabitController {
  constructor(private readonly habitService: HabitService) {}

  @ApiOperation({ summary: 'Create a new habit' })
  @Post('create')
  async createHabit(@GetUser() user, @Body() createHabitDto: CreateHabitDto) {
    try {
      // console.log('hitted and user is:', user);
      return await this.habitService.createHabit(user.userId, createHabitDto);
    } catch (error) {
      console.error('Error creating habit:', error);
      throw error;
    }
  }

  @ApiOperation({ summary: 'Get all reminders' })
  @Get('reminders')
  async getAllReminders(@GetUser() user) {
    try {
      console.log('Fetching reminders for user:', user);
      return await this.habitService.getAllReminders(user.userId);
    } catch (error) {
      console.error('Error fetching reminders:', error);
      throw error;
    }
  }

  @ApiOperation({ summary: 'Get upcoming reminders' })
  @Get('reminders/upcoming')
  async getUpcomingReminders(@GetUser() user) {
    try {
      console.log('Fetching upcoming reminders for user:', user);
      return await this.habitService.getUpcomingReminders(user.userId);
    } catch (error) {
      console.error('Error fetching upcoming reminders:', error);
      throw error;
    }
  }

  @ApiOperation({ summary: 'List 30-minute reminder slots for a preferred time window' })
  @Get('reminder-slots/:preferred')
  async reminderSlots(@Param('preferred') preferred: string) {
    return this.habitService.getReminderSlots(preferred);
  }

  @ApiOperation({ summary: 'Turn off/on a habit reminder' })
  @Patch(':id/reminder/turn-off-on')
  async turnOffOnReminder(@GetUser() user, @Param('id') id: string) {
    try {
      console.log('Turning off/on reminder for habit:', id);

      return await this.habitService.turnOffOnReminder(user.userId, id);
    } catch (error) {
      console.error('Error turning off/on reminder:', error);
      throw error;
    }
  }

  @Get(':id')
  async findOne(@GetUser() user, @Param('id') id: string) {
    return this.habitService.findOne(user.userId, id);
  }

  // --- Completion Tracking ------------------------------------------------
  @ApiOperation({ summary: 'Complete or undo completion for a habit (today)' })
  @Post(':id/complete')
  async completeHabit(@GetUser() user, @Param('id') id: string, @Body() dto: CompleteHabitDto) {
    return this.habitService.completeHabit(user.userId, id, dto);
  }

  @ApiOperation({ summary: 'List today\'s habits with completion status & streaks' })
  @Get('today/list')
  async today(@GetUser() user) { return this.habitService.getHabitsToday(user.userId); }

  @ApiOperation({ summary: 'Habit history (logs) for last N days' })
  @Get(':id/history')
  async history(@GetUser() user, @Param('id') id: string) { return this.habitService.habitHistory(user.userId, id); }

  @ApiOperation({ summary: 'Habit summary & metrics (last 7 days default)' })
  @Get('summary/metrics')
  async summary(@GetUser() user) { return this.habitService.summary(user.userId); }

  @ApiOperation({ summary: 'Browse habits by category with counts' })
  @Get('browse/category')
  async browseByCategory(@GetUser() user) { return this.habitService.browseByCategory(user.userId); }

  @ApiOperation({ summary: 'Get habits within a specific category' })
  @Get('category/:category')
  async getByCategory(@GetUser() user, @Param('category') category: string) {
    return this.habitService.getByCategory(user.userId, category);
  }

  @Patch(':id')
  async update(@GetUser() user, @Param('id') id: string, @Body() updateHabitDto: UpdateHabitDto) {
    return this.habitService.updateHabit(user.userId, id, updateHabitDto);
  }

  @Delete(':id')
  async remove(@GetUser() user, @Param('id') id: string) {
    return this.habitService.removeHabit(user.userId, id);
  }
}
