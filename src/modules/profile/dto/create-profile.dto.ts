import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateProfileDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiProperty({
    required: false,
    description: 'IANA timezone string (e.g., America/New_York, Asia/Dhaka)',
    example: 'UTC',
  })
  @IsOptional()
  @IsString()
  timezone?: string;
}
