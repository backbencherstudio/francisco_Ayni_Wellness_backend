import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsEnum, IsOptional, IsString } from 'class-validator';
import { HabitCategory } from '@prisma/client';

type FrequencyType = 'Daily' | 'Weekly' | 'Weekdays' | 'Weekends';

export class CreateHabitDto {
  @IsString()
  @ApiProperty()
  habit_name: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  description?: string;

  @IsIn(['Daily', 'Weekly', 'Weekdays', 'Weekends'])
  @ApiProperty({
    enum: ['Daily', 'Weekly', 'Weekdays', 'Weekends'],
    enumName: 'Frequency',
  })
  frequency: FrequencyType;

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
