import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, MinLength, IsOptional, IsString } from 'class-validator';

export class CreateUserDto {
  
  @ApiProperty()
  name?: string;

  @IsNotEmpty()
  @ApiProperty()
  email?: string;

  @IsNotEmpty()
  @MinLength(8, { message: 'Password should be minimum 8' })
  @ApiProperty()
  password: string;

  @ApiProperty({
    type: String,
    example: 'user',
  })
  type?: string;

  @ApiProperty({
    required: false,
    description: 'IANA timezone string (e.g., America/New_York, Asia/Dhaka)',
    example: 'UTC',
  })
  @IsOptional()
  @IsString()
  timezone?: string;

}
