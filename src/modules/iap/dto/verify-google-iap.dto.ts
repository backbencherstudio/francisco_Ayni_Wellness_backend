import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class VerifyGoogleIapDto {
  @ApiProperty({ description: 'Google Play purchase token for a subscription purchase' })
  @IsString()
  purchaseToken: string;

  @ApiProperty({ description: 'Google product id (subscription product id)' })
  @IsString()
  productId: string;

  @ApiPropertyOptional({ description: 'Android package name override (falls back to env GOOGLE_PLAY_PACKAGE_NAME)' })
  @IsOptional()
  @IsString()
  packageName?: string;

  @ApiPropertyOptional({ description: 'Google base plan id' })
  @IsOptional()
  @IsString()
  basePlanId?: string;

  @ApiPropertyOptional({ description: 'Google offer id (if applicable)' })
  @IsOptional()
  @IsString()
  offerId?: string;

  @ApiPropertyOptional({ description: 'External subscription id from provider payload' })
  @IsOptional()
  @IsString()
  externalSubscriptionId?: string;

  @ApiPropertyOptional({ description: 'Environment for provider payload', enum: ['UNKNOWN', 'SANDBOX', 'PRODUCTION'], default: 'UNKNOWN' })
  @IsOptional()
  @IsIn(['UNKNOWN', 'SANDBOX', 'PRODUCTION'])
  environment?: 'UNKNOWN' | 'SANDBOX' | 'PRODUCTION';

  @ApiPropertyOptional({ description: 'Plan id from SubsPlan to bind this entitlement to' })
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional({ description: 'Event id for idempotency when sent from app-server relay' })
  @IsOptional()
  @IsString()
  eventId?: string;

  @ApiPropertyOptional({ description: 'Event type, e.g. SUBSCRIPTION_RENEWED' })
  @IsOptional()
  @IsString()
  eventType?: string;

  @ApiPropertyOptional({ description: 'Optional payload hash provided by upstream relay' })
  @IsOptional()
  @IsString()
  payloadHash?: string;
}
