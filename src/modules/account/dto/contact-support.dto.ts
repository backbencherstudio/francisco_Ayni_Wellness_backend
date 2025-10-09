import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class ContactSupportDto {
  @ApiProperty({ description: 'Support request description', minLength: 10 })
  @IsString()
  @MinLength(10)
  description: string;

  @ApiProperty({ description: 'Optional contact email override', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;
}
