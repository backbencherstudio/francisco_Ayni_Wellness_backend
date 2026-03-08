import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CancelIapDto {
  @ApiProperty({
    enum: ['APPLE', 'GOOGLE'],
    description: 'Subscription provider to cancel in store',
  })
  @IsEnum(['APPLE', 'GOOGLE'])
  provider: 'APPLE' | 'GOOGLE';

  @ApiProperty({
    required: false,
    description:
      'Optional package name for Android manage-subscription deep links (defaults to GOOGLE_PLAY_PACKAGE_NAME)',
    example: 'com.ayniwellness.app',
  })
  @IsOptional()
  @IsString()
  packageName?: string;
}
