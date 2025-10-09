import { Module } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { StatsService } from '../stats/stats.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [ProfileController],
  providers: [ProfileService, StatsService, PrismaService],
})
export class ProfileModule {}
