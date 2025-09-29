import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsNotEmpty()
  @ApiProperty()
  first_name?: string;

  @IsNotEmpty()
  @ApiProperty()
  last_name?: string;

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
    type: Boolean,
    example: true,
    description:
      'Set to true if the user agrees to the Terms and Privacy Policy. Registration requires this to be true.',
  })
  @IsBoolean({ message: 'agree_to_terms must be a boolean' })
  agree_to_terms?: boolean;
}
