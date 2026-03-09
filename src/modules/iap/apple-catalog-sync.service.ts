import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionPlan } from '@prisma/client';
import { SignJWT, importPKCS8 } from 'jose';
import { PrismaService } from '../../prisma/prisma.service';

type AppleIapItem = {
  id?: string;
  attributes?: {
    productId?: string;
    name?: string;
    referenceName?: string;
    inAppPurchaseType?: string;
    state?: string;
  };
};

@Injectable()
export class AppleCatalogSyncService implements OnModuleInit {
  private readonly logger = new Logger(AppleCatalogSyncService.name);
  private syncInProgress = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (!this.isSyncEnabled() || !this.runOnStartup()) return;

    // Run once on startup to bootstrap catalog without waiting for next cron tick.
    void this.syncCatalog('startup');
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async handleCron() {
    await this.syncCatalog('cron');
  }

  private async syncCatalog(trigger: 'startup' | 'cron') {
    if (!this.isSyncEnabled()) return;

    if (this.syncInProgress) {
      this.logger.warn(`Skipping Apple catalog sync (${trigger}): previous run still in progress`);
      return;
    }

    this.syncInProgress = true;
    try {
      const bundleId = process.env.APPLE_BUNDLE_ID || process.env.APPLE_CLIENT_ID;
      const keyId = process.env.APPLE_KEY_ID;
      const issuerId = process.env.APPLE_ISSUER_ID;
      const privateKeyRaw = process.env.APPLE_PRIVATE_KEY;

      if (!bundleId || !keyId || !issuerId || !privateKeyRaw) {
        this.logger.warn(
          'Apple catalog sync skipped: missing APPLE_BUNDLE_ID/APPLE_CLIENT_ID, APPLE_KEY_ID, APPLE_ISSUER_ID, or APPLE_PRIVATE_KEY',
        );
        return;
      }

      const token = await this.createAppStoreConnectToken(keyId, issuerId, privateKeyRaw);
      const appId = process.env.APPLE_APP_ID || (await this.resolveAppleAppId(bundleId, token));
      if (!appId) {
        this.logger.warn(
          `Apple catalog sync skipped: no App Store Connect app found for bundleId '${bundleId}'. Set APPLE_APP_ID to force target app.`,
        );
        return;
      }

      const allProducts = await this.fetchInAppPurchases(appId, token);
      const subscriptionProducts = allProducts.filter((item) =>
        this.isSubscriptionProduct(item.attributes?.inAppPurchaseType),
      );

      if (!subscriptionProducts.length) {
        this.logger.warn(`Apple catalog sync (${trigger}) found no subscription products for app ${appId}`);
        return;
      }

      const syncedAppleProductIds: string[] = [];
      let createdCount = 0;
      let updatedCount = 0;

      for (const item of subscriptionProducts) {
        const productId = item.attributes?.productId?.trim();
        if (!productId) continue;

        syncedAppleProductIds.push(productId);

        const displayName =
          item.attributes?.name?.trim() ||
          item.attributes?.referenceName?.trim() ||
          this.fallbackNameFromProductId(productId);

        const existing = await this.prisma.subsPlan.findFirst({
          where: { appleProductId: productId },
        });

        if (existing) {
          await this.prisma.subsPlan.update({
            where: { id: existing.id },
            data: {
              name: existing.name || displayName,
              isActive: true,
              interval: existing.interval || this.inferInterval(productId),
              intervalCount: existing.intervalCount || 1,
              displayOrder:
                existing.displayOrder === 0
                  ? this.inferDisplayOrder(productId)
                  : existing.displayOrder,
              type: existing.type || this.inferType(productId),
              isFree: existing.isFree,
            },
          });
          updatedCount += 1;
          continue;
        }

        const slug = await this.generateUniqueSlug(productId);
        const inferredType = this.inferType(productId);
        const inferredIsFree = inferredType === SubscriptionPlan.TRIALING;

        await this.prisma.subsPlan.create({
          data: {
            name: displayName,
            slug,
            description: `Synced from App Store Connect (${productId})`,
            appleProductId: productId,
            isActive: true,
            isFree: inferredIsFree,
            type: inferredType,
            interval: this.inferInterval(productId),
            intervalCount: 1,
            displayOrder: this.inferDisplayOrder(productId),
            trialDays: inferredIsFree ? this.defaultTrialDays() : 0,
          },
        });
        createdCount += 1;
      }

      if (this.deactivateMissing()) {
        const result = await this.prisma.subsPlan.updateMany({
          where: {
            appleProductId: { not: null, notIn: syncedAppleProductIds },
            isActive: true,
          },
          data: { isActive: false },
        });
        if (result.count > 0) {
          this.logger.warn(
            `Apple catalog sync deactivated ${result.count} plan(s) missing in App Store Connect list`,
          );
        }
      }

      this.logger.log(
        `Apple catalog sync (${trigger}) completed: ${subscriptionProducts.length} products scanned, ${createdCount} created, ${updatedCount} updated`,
      );
    } catch (error: any) {
      this.logger.error(`Apple catalog sync failed: ${error?.message || error}`);
    } finally {
      this.syncInProgress = false;
    }
  }

  private async createAppStoreConnectToken(
    keyId: string,
    issuerId: string,
    privateKeyRaw: string,
  ): Promise<string> {
    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
    const ecPrivateKey = await importPKCS8(privateKey, 'ES256');
    const now = Math.floor(Date.now() / 1000);

    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
      .setIssuer(issuerId)
      .setAudience('appstoreconnect-v1')
      .setIssuedAt(now)
      .setExpirationTime(now + 600)
      .sign(ecPrivateKey);
  }

  private async resolveAppleAppId(bundleId: string, token: string): Promise<string | null> {
    const url =
      `https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&limit=1`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to resolve Apple app id (${response.status}): ${body.slice(0, 300)}`);
    }

    const json = (await response.json()) as any;
    return json?.data?.[0]?.id || null;
  }

  private async fetchInAppPurchases(appId: string, token: string): Promise<AppleIapItem[]> {
    const results: AppleIapItem[] = [];
    let nextUrl = `https://api.appstoreconnect.apple.com/v1/apps/${encodeURIComponent(appId)}/inAppPurchasesV2?limit=200`;

    while (nextUrl) {
      const response = await fetch(nextUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Apple inAppPurchases fetch failed (${response.status}): ${body.slice(0, 300)}`);
      }

      const json = (await response.json()) as any;
      const data = Array.isArray(json?.data) ? (json.data as AppleIapItem[]) : [];
      results.push(...data);
      nextUrl = typeof json?.links?.next === 'string' ? json.links.next : '';
    }

    return results;
  }

  private isSubscriptionProduct(type?: string): boolean {
    if (!type) return false;
    const normalized = type.toUpperCase();
    return normalized.includes('SUBSCRIPTION');
  }

  private inferType(productId: string): SubscriptionPlan {
    const p = productId.toLowerCase();
    if (p.includes('trial') || p.includes('free')) return SubscriptionPlan.TRIALING;
    return SubscriptionPlan.PREMIUM;
  }

  private inferInterval(productId: string): 'MONTH' | 'YEAR' {
    const p = productId.toLowerCase();
    if (p.includes('year') || p.includes('annual')) return 'YEAR';
    return 'MONTH';
  }

  private inferDisplayOrder(productId: string): number {
    const p = productId.toLowerCase();
    if (p.includes('trial') || p.includes('free')) return 1;
    if (p.includes('month')) return 10;
    if (p.includes('year') || p.includes('annual')) return 20;
    return 50;
  }

  private fallbackNameFromProductId(productId: string): string {
    const last = productId.split('.').pop() || productId;
    return last
      .split(/[_\-]/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private async generateUniqueSlug(productId: string): Promise<string> {
    const base = productId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'apple_plan';

    let slug = base;
    let idx = 1;
    while (await this.prisma.subsPlan.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${base}_${idx++}`;
    }

    return slug;
  }

  private isSyncEnabled(): boolean {
    return process.env.IAP_APPLE_CATALOG_SYNC_ENABLED === '1';
  }

  private runOnStartup(): boolean {
    return process.env.IAP_APPLE_CATALOG_SYNC_RUN_ON_STARTUP !== '0';
  }

  private deactivateMissing(): boolean {
    return process.env.IAP_APPLE_CATALOG_SYNC_DEACTIVATE_MISSING === '1';
  }

  private defaultTrialDays(): number {
    const fromEnv = Number(process.env.TRIAL_DAYS || process.env.SUBSCRIPTION_TRIAL_DAYS || 14);
    return Number.isFinite(fromEnv) && fromEnv > 0 ? Math.floor(fromEnv) : 14;
  }
}
