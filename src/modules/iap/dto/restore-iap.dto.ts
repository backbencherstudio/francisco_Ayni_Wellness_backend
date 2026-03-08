import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class RestoreIapDto {
  @ApiPropertyOptional({ enum: ['APPLE', 'GOOGLE'], description: 'Provider hint for restore flow' })
  @IsOptional()
  @IsIn(['APPLE', 'GOOGLE'])
  provider?: 'APPLE' | 'GOOGLE';

  @ApiPropertyOptional({ description: 'Apple original transaction id for targeted restore' })
  @IsOptional()
  @IsString()
  originalTransactionId?: string;

  @ApiPropertyOptional({ description: 'Google purchase token for targeted restore' })
  @IsOptional()
  @IsString()
  purchaseToken?: string;

  @ApiPropertyOptional({ description: 'Google product id for targeted restore' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ description: 'Optional plan id override if targeted restore creates first local row' })
  @IsOptional()
  @IsString()
  planId?: string;
}
