import { SubscriptionPlan } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpsertIapPlanDto {
  @ApiPropertyOptional({ description: 'Existing subs plan id (omit to create new)' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ description: 'Display name for app plan card' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Stable slug identifier (e.g. premium_monthly)' })
  @IsString()
  slug: string;

  @ApiPropertyOptional({ description: 'Plan description shown in app' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Price subtitle/description shown in app' })
  @IsOptional()
  @IsString()
  price_description?: string;

  @ApiPropertyOptional({ description: 'Display price for UI (store remains source of truth)', example: 9.99 })
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiPropertyOptional({ description: 'Display currency', example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Billing interval (month/year) for UI', enum: ['MONTH', 'YEAR'] })
  @IsOptional()
  @IsString()
  interval?: 'MONTH' | 'YEAR';

  @ApiPropertyOptional({ description: 'Interval count for UI', example: 1 })
  @IsOptional()
  @IsNumber()
  intervalCount?: number;

  @ApiPropertyOptional({ description: 'Trial days metadata for UI/business logic', example: 7 })
  @IsOptional()
  @IsNumber()
  trialDays?: number;

  @ApiPropertyOptional({ enum: SubscriptionPlan, description: 'Internal subscription type' })
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  type?: SubscriptionPlan;

  @ApiPropertyOptional({ description: 'Apple product id from App Store Connect' })
  @IsOptional()
  @IsString()
  appleProductId?: string;

  @ApiPropertyOptional({ description: 'Google subscription product id from Play Console' })
  @IsOptional()
  @IsString()
  googleProductId?: string;

  @ApiPropertyOptional({ description: 'Google base plan id from Play Console' })
  @IsOptional()
  @IsString()
  googleBasePlanId?: string;

  @ApiPropertyOptional({ description: 'Google offer id from Play Console (optional)' })
  @IsOptional()
  @IsString()
  googleOfferId?: string;

  @ApiPropertyOptional({ description: 'Whether plan is active in app catalog', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Sort order for app plan listing', default: 0 })
  @IsOptional()
  @IsNumber()
  displayOrder?: number;

  @ApiPropertyOptional({ description: 'Whether this is the free/default plan', default: false })
  @IsOptional()
  @IsBoolean()
  isFree?: boolean;
}
