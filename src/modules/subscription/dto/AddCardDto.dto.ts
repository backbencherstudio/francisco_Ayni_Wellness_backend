import { IsNotEmpty, IsString } from 'class-validator';

export class AddCardDto {
  @IsString()
  token: string;

  @IsString()
  productId: string;
}
