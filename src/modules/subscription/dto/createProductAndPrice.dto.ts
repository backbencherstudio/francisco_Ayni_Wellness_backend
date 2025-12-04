import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

enum IntervalEnum {
  MONTH = 'month',
  YEAR = 'year',
}

export class CreateProductAndPriceDto {
  @IsString()
  name: string;

  @IsNumber()
  price: number;

  @IsString()
  currency: string;

  @IsString()
  interval: IntervalEnum;

  @IsOptional()
  @IsNumber()
  interval_count: number;

  @IsOptional()
  @IsString()
  product_description: string;

  @IsOptional()
  @IsString()
  price_description: string;
}
