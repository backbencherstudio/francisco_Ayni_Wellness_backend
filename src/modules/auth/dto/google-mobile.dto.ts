import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class GoogleMobileDto {
  @ApiProperty({
    description: 'Google ID token from Flutter (GoogleSignInAuthentication.idToken)',
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @ApiProperty({
    required: false,
    description: 'IANA timezone string (e.g., America/New_York, Asia/Dhaka)',
    example: 'UTC',
  })
  @IsOptional()
  @IsString()
  timezone?: string;

}
