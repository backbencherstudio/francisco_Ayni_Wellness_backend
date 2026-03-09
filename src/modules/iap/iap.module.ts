import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { IapController } from './iap.controller';
import { IapEntitlementService } from './iap-entitlement.service';
import { AppleCatalogSyncService } from './apple-catalog-sync.service';
import { AppleIapProvider } from './providers/apple-iap.provider';
import { GoogleIapProvider } from './providers/google-iap.provider';
import { IapService } from './iap.service';

@Module({
  imports: [PrismaModule],
  controllers: [IapController],
  providers: [
    IapEntitlementService,
    AppleIapProvider,
    GoogleIapProvider,
    IapService,
    AppleCatalogSyncService,
  ],
  exports: [IapEntitlementService, IapService],
})
export class IapModule {}
