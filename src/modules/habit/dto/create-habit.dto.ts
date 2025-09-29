import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsEnum, IsOptional, IsString } from 'class-validator';
import { HabitCategory } from '@prisma/client';

type FrequencyType = 'Daily' | 'Weekly' | 'Weekdays' | 'Weekends';

export class CreateHabitDto {
  @IsString()
  @ApiProperty()
  habit_name: string;

  @IsString()
  @ApiProperty()
  description: string;

  @IsIn(['Daily', 'Weekly', 'Weekdays', 'Weekends'])
  @ApiProperty({
    enum: ['Daily', 'Weekly', 'Weekdays', 'Weekends'],
    enumName: 'Frequency',
  })
  frequency: FrequencyType;

  @IsOptional()
  @IsIn(
    [
      'Morning',
      'Afternoon',
      'Evening',
      'Night',
      'Morning (6-10am)',
      'Afternoon (10am-2pm)',
      'Evening (2pm-6pm)',
      'Night (6pm-10pm)',
    ],
    { message: 'preferred_time must be one of the allowed values' },
  )
  @ApiProperty({
    required: false,
    enum: [
      'Morning (6-10am)',
      'Afternoon (10am-2pm)',
      'Evening (2pm-6pm)',
      'Night (6pm-10pm)',
    ],
    description: 'Preferred time in human-friendly format',
  })
  preferred_time?: string;

  @IsString()
  @ApiProperty()
  reminder_time: string;

  @IsOptional()
  @IsEnum(HabitCategory)
  @ApiProperty({
    enum: HabitCategory,
    enumName: 'HabitCategory',
    required: false,
  })
  category?: HabitCategory;

  @IsOptional()
  @ApiProperty({
    description: 'Duration in days',
    example: 30,
  })
  duration?: number;
}
