import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class AppleWebhookDto {
  @ApiPropertyOptional({ description: 'Signed App Store Server Notification JWS payload (preferred)' })
  @IsOptional()
  @IsString()
  signedPayload?: string;

  @ApiPropertyOptional({ description: 'Idempotency key for event processing' })
  @IsOptional()
  @IsString()
  eventId?: string;

  @ApiPropertyOptional({ description: 'Notification type, e.g. DID_RENEW' })
  @IsOptional()
  @IsString()
  eventType?: string;

  @ApiPropertyOptional({ enum: ['UNKNOWN', 'SANDBOX', 'PRODUCTION'], default: 'UNKNOWN' })
  @IsOptional()
  @IsIn(['UNKNOWN', 'SANDBOX', 'PRODUCTION'])
  environment?: 'UNKNOWN' | 'SANDBOX' | 'PRODUCTION';

  @ApiPropertyOptional({ description: 'Apple original transaction id or external subscription id' })
  @IsOptional()
  @IsString()
  externalSubscriptionId?: string;

  @ApiPropertyOptional({ description: 'Opaque payload from Apple notifications relay' })
  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;
}
