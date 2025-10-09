import { Module } from '@nestjs/common';
import { FirebaseStorageService } from './firebase-storage.service';
import { FirebaseStorageController } from './firebase-storage.controller';

@Module({
  controllers: [FirebaseStorageController],
  providers: [FirebaseStorageService],
  exports: [FirebaseStorageService],
})
export class FirebaseStorageModule {}
