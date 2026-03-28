import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateTrialServiceDto {
  @ApiPropertyOptional({ description: 'Display name for trial plan', default: 'Free Trial' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Unique slug for trial plan', default: 'free_trial' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({ description: 'Description for trial plan' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Price text for UI', default: 'Free for 14 days' })
  @IsOptional()
  @IsString()
  price_description?: string;

  @ApiPropertyOptional({ description: 'Trial duration in days', default: 14, minimum: 1, maximum: 60 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  trialDays?: number;

  @ApiPropertyOptional({ description: 'Sort order for mobile plan list', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional({ description: 'Whether trial plan is currently active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
