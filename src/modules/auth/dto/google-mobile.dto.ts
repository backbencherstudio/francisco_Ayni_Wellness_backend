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

}
