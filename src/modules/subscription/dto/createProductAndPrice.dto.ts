import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { SubscriptionPlan } from '@prisma/client';

enum IntervalEnum {
  MONTH = 'month',
  YEAR = 'year',
}

export class CreateProductAndPriceDto {
  @IsString()
  name: string;

  @IsNumber()
  price: number;

  @IsOptional()
  @IsString()
  currency: string;

  @IsOptional()
  @IsString()
  interval: IntervalEnum;

  @IsOptional()
  @IsNumber()
  interval_count: number;

  @IsOptional()
  @IsString()
  product_description: string;

  @IsOptional()
  @IsString()
  price_description: string;

  @IsOptional()
  @IsNumber()
  trialDays: number;

  @IsOptional()
  @IsEnum(SubscriptionPlan)
  type: SubscriptionPlan;
}
