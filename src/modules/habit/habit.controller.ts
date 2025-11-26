import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { HabitService } from './habit.service';
import { CreateHabitDto } from './dto/create-habit.dto';
import { UpdateHabitDto } from './dto/update-habit.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { CompleteHabitDto } from './dto/complete-habit.dto';
import { SubscriptionGuard } from 'src/common/guard/subscription/subscription.guard';

@ApiTags('Habit')
@Controller('habit')
@UseGuards(JwtAuthGuard, SubscriptionGuard)
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

  @ApiOperation({ summary: 'Get all habits for the user' })
  @Get()
  async findAll(@GetUser() user) {
    return this.habitService.getAllHabits(user.userId);
  }

  @ApiOperation({ summary: "Today's habits (with completion status)" })
  @Get('today')
  async today(@GetUser() user) {
    return this.habitService.getTodayHabits(user.userId);
  }

  @ApiOperation({ summary: 'Get habit by ID' })
  @Get(':id')
  async findOne(@GetUser() user, @Param('id') id: string) {
    return this.habitService.getHabitById(user.userId, id);
  }

  // --- Completion Tracking ------------------------------------------------

  @ApiOperation({ summary: 'Complete a habit' })
  @Post(':id/complete')
  async complete(@GetUser() user, @Param('id') id: string, @Body() completeHabitDto: CompleteHabitDto) {
    return this.habitService.completeHabit(user.userId, id, completeHabitDto);
  }

  @ApiOperation({ summary: 'Habit history (logs) for last N days; use ?all=1 for all-time or ?days=N' })
  @Get(':id/history')
  async history(
    @GetUser() user,
    @Param('id') id: string,
    @Query('days') days?: string,
    @Query('all') all?: string,
  ) {
    if (all === '1' || all === 'true') return this.habitService.habitHistory(user.userId, id, 0);
    if (days) {
      const n = parseInt(days, 10);
      if (!Number.isNaN(n)) return this.habitService.habitHistory(user.userId, id, n);
    }
    return this.habitService.habitHistory(user.userId, id);
  }

  @Patch(':id')
  async update(
    @GetUser() user,
    @Param('id') id: string,
    @Body() updateHabitDto: UpdateHabitDto,
  ) {
    return this.habitService.updateHabit(user.userId, id, updateHabitDto);
  }

  @Delete(':id')
  async remove(@GetUser() user, @Param('id') id: string) {
    return this.habitService.removeHabit(user.userId, id);
  }
}
