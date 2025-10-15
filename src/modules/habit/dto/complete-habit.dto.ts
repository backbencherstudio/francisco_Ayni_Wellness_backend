import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsPositive, Max, MaxLength, Min } from 'class-validator';

export class CompleteHabitDto {
  @IsOptional()
  @IsBoolean()
  @ApiProperty({ required: false, description: 'If true, undo (remove) today\'s completion' })
  undo?: boolean;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(24*60)
  @ApiProperty({ required: false, description: 'Duration in minutes spent on the habit instance (max 1440)' })
  duration_minutes?: number;

  @IsOptional()
  @MaxLength(500)
  @ApiProperty({ required: false, description: 'Optional note (<=500 chars)' })
  note?: string;
}