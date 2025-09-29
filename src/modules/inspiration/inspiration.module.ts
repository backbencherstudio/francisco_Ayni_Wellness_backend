import { Module } from '@nestjs/common';
import { InspirationService } from './inspiration.service';
import { InspirationController } from './inspiration.controller';

@Module({
  controllers: [InspirationController],
  providers: [InspirationService],
})
export class InspirationModule {}
