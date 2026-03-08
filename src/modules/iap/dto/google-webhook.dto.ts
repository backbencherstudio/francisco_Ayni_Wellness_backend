import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class GoogleWebhookDto {
  @ApiPropertyOptional({ description: 'Idempotency key for event processing' })
  @IsOptional()
  @IsString()
  eventId?: string;

  @ApiPropertyOptional({ description: 'Notification type, e.g. SUBSCRIPTION_RENEWED' })
  @IsOptional()
  @IsString()
  eventType?: string;

  @ApiPropertyOptional({ enum: ['UNKNOWN', 'SANDBOX', 'PRODUCTION'], default: 'UNKNOWN' })
  @IsOptional()
  @IsIn(['UNKNOWN', 'SANDBOX', 'PRODUCTION'])
  environment?: 'UNKNOWN' | 'SANDBOX' | 'PRODUCTION';

  @ApiPropertyOptional({ description: 'Google external subscription id if present' })
  @IsOptional()
  @IsString()
  externalSubscriptionId?: string;

  @ApiPropertyOptional({ description: 'Google purchase token if present' })
  @IsOptional()
  @IsString()
  purchaseToken?: string;

  @ApiPropertyOptional({ description: 'Opaque payload from Google RTDN relay' })
  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;
}
