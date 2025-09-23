import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyOtpDto{
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The OTP code to verify',
    example: '123456',
  })
  otp: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'The user email',
    example: 'user@example.com',
  })
  email: string;
}
