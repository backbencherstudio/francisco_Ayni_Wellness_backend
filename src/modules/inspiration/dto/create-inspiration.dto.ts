import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { InspirationKeyword } from '@prisma/client';

export class CreateInspirationDto {
  @IsOptional()
  @ApiProperty({
    description: 'Keyword for the inspiration quote',
    example: 'motivation',
  })
  keyword?: InspirationKeyword;

  @IsOptional()
  @ApiProperty({
    description: 'Quote for the inspiration',
    example: 'The only way to do great work is to love what you do.',
  })
  quote?: string;

  @IsOptional()
  @ApiProperty({
    description: 'Author of the inspiration quote',
    example: 'Steve Jobs',
  })
  author?: string;
}
