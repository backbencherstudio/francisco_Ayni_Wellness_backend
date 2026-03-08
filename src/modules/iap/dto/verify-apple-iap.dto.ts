import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class VerifyAppleIapDto {
  @ApiPropertyOptional({ description: 'Signed transaction JWS (preferred) from Apple or app server relay' })
  @IsOptional()
  @IsString()
  signedPayload?: string;

  @ApiPropertyOptional({ description: 'Signed renewal info JWS (optional, used for cancel-at-period-end)' })
  @IsOptional()
  @IsString()
  signedRenewalInfo?: string;

  @ApiPropertyOptional({ description: 'Apple transaction id (optional fallback identifier)' })
  @IsOptional()
  @IsString()
  transactionId?: string;

  @ApiPropertyOptional({ description: 'Apple original transaction id for auto-renewable subscription lineage' })
  @IsOptional()
  @IsString()
  originalTransactionId?: string;

  @ApiPropertyOptional({ description: 'External subscription id if available from provider payload' })
  @IsOptional()
  @IsString()
  externalSubscriptionId?: string;

  @ApiPropertyOptional({ description: 'Store product id (e.g. com.ayniwellness.premium.monthly)' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ description: 'Environment for provider payload', enum: ['UNKNOWN', 'SANDBOX', 'PRODUCTION'], default: 'UNKNOWN' })
  @IsOptional()
  @IsIn(['UNKNOWN', 'SANDBOX', 'PRODUCTION'])
  environment?: 'UNKNOWN' | 'SANDBOX' | 'PRODUCTION';

  @ApiPropertyOptional({ description: 'Plan id from SubsPlan to bind this entitlement to' })
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional({ description: 'Event id for idempotency when sent from device/app-server relay' })
  @IsOptional()
  @IsString()
  eventId?: string;

  @ApiPropertyOptional({ description: 'Event type, e.g. DID_RENEW' })
  @IsOptional()
  @IsString()
  eventType?: string;

  @ApiPropertyOptional({ description: 'Optional payload hash provided by upstream relay' })
  @IsOptional()
  @IsString()
  payloadHash?: string;
}
