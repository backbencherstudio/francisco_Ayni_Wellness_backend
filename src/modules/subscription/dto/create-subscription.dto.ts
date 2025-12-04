import { SubscriptionPlan } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class CreateSubscriptionDto {
  @IsEnum(SubscriptionPlan)
  plan: SubscriptionPlan;
}

