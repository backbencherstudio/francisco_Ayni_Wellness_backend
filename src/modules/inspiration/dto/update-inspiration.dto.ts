import { PartialType } from '@nestjs/mapped-types';
import { CreateInspirationDto } from './create-inspiration.dto';

export class UpdateInspirationDto extends PartialType(CreateInspirationDto) {}
