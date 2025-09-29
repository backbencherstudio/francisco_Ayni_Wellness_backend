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

@ApiTags('Habit')
@Controller('habit')
@UseGuards(JwtAuthGuard)
export class HabitController {
  constructor(private readonly habitService: HabitService) {}

  @ApiOperation({ summary: 'Create a new habit' })
  @Post('create')
  async createHabit(@GetUser() user, @Body() createHabitDto: CreateHabitDto) {
    try {
      console.log('hitted and user is:', user);
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
  findOne(@Param('id') id: string) {
    return this.habitService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateHabitDto: UpdateHabitDto) {
    return this.habitService.update(+id, updateHabitDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.habitService.remove(+id);
  }
}
