import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional } from 'class-validator';

export class CreateUserDto {
  @IsNotEmpty()
  @ApiProperty({
    description: 'The name of the user',
    example: 'John Doe',
  })
  name: string;

  @IsNotEmpty()
  @ApiProperty({
    description: 'The email of the user',
    example: 'john.doe@example.com',
  })
  email: string;

  @IsNotEmpty()
  @ApiProperty({
    description: 'The password of the user',
    example: 'password',
  })
  password: string;

  @IsOptional()
  @ApiProperty({
    description: 'The type of the user',
    example: 'user',
  })
  type?: string;

  @IsOptional()
  @ApiProperty({
    description: 'The avatar of the user',
    example: 'avatar.png',
  })
  avatar?: string;

  @IsOptional()
  @ApiProperty({
    description: 'The date of birth of the user',
    example: '1990-01-01',
  })
  date_of_birth?: string;

  @IsOptional()
  @ApiProperty({
    description: 'The gender of the user',
    example: 'male',
  })
  gender?: string;


  @IsOptional()
  @ApiProperty({
    description: 'The location of the user',
    example: 'New York, USA',
  })
  address?: string;
}
