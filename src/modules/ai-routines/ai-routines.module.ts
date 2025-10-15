import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FirebaseStorageModule } from '../firebase-storage/firebase-storage.module';
import { AiRoutinesService } from 'src/modules/ai-routines/ai-routines.service';
import { AiRoutinesController } from 'src/modules/ai-routines/ai-routines.controller';

@Module({
  imports: [PrismaModule, FirebaseStorageModule],
  providers: [AiRoutinesService],
  controllers: [AiRoutinesController],
  exports: [AiRoutinesService],
})
export class AiRoutinesModule {}
