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
      'Morning', 'Afternoon', 'Evening', 'Night',
      'Morning (6-10am)', 'Morning (6-10 AM)',
      'Afternoon (10am-2pm)', 'Afternoon (12-4 PM)',
      'Evening (2pm-6pm)', 'Evening (6-9 PM)',
      'Night (6pm-10pm)', 'Night (9-11 PM)'
    ],
    { message: 'preferred_time must be one of the allowed values' },
  )
  @ApiProperty({
    required: false,
    enum: [
      'Morning (6-10 AM)',
      'Afternoon (12-4 PM)',
      'Evening (6-9 PM)',
      'Night (9-11 PM)'
    ],
    description: 'Preferred time in human-friendly format (variants also accepted: short labels or earlier version labels).',
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
