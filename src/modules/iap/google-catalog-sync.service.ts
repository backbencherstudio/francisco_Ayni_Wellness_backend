import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionPlan } from '@prisma/client';
import { JWT } from 'google-auth-library';
import { PrismaService } from '../../prisma/prisma.service';

type GoogleSubscriptionItem = {
  productId?: string;
  packageName?: string;
  listings?: Array<{ title?: string; description?: string }>;
};

type GoogleBasePlanItem = {
  basePlanId?: string;
  state?: string;
  autoRenewingBasePlanType?: {
    billingPeriodDuration?: string;
  };
};

type GoogleOfferItem = {
  offerId?: string;
  state?: string;
};

@Injectable()
export class GoogleCatalogSyncService implements OnModuleInit {
  private readonly logger = new Logger(GoogleCatalogSyncService.name);
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
      this.logger.warn(`Skipping Google catalog sync (${trigger}): previous run still in progress`);
      return;
    }

    this.syncInProgress = true;
    try {
      const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;
      const keyPath = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH;

      if (!packageName || !keyPath) {
        this.logger.warn(
          'Google catalog sync skipped: missing GOOGLE_PLAY_PACKAGE_NAME or GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH',
        );
        return;
      }

      const token = await this.getAndroidPublisherToken(keyPath);
      const subscriptions = await this.fetchSubscriptions(packageName, token);

      if (!subscriptions.length) {
        this.logger.warn(`Google catalog sync (${trigger}) found no subscriptions for package ${packageName}`);
        return;
      }

      const syncedKeys = new Set<string>();
      let createdCount = 0;
      let updatedCount = 0;

      for (const subscription of subscriptions) {
        const productId = this.normalizedOptional(subscription.productId);
        if (!productId) continue;

        // Trial is backend-only. Ignore store trial/free products.
        if (this.isTrialLikeProduct(productId)) {
          continue;
        }

        const basePlans = await this.fetchBasePlans(packageName, productId, token);
        if (!basePlans.length) {
          const result = await this.upsertPlan({
            productId,
            basePlanId: null,
            offerId: null,
            title: subscription.listings?.[0]?.title,
            description: subscription.listings?.[0]?.description,
            billingPeriod: null,
            state: 'ACTIVE',
          });
          syncedKeys.add(this.compositeKey(productId, null, null));
          if (result === 'created') createdCount += 1;
          if (result === 'updated') updatedCount += 1;
          continue;
        }

        for (const basePlan of basePlans) {
          const basePlanId = this.normalizedOptional(basePlan.basePlanId);
          const billingPeriod =
            this.normalizedOptional(basePlan.autoRenewingBasePlanType?.billingPeriodDuration) ||
            null;

          const offers = basePlanId
            ? await this.fetchOffers(packageName, productId, basePlanId, token)
            : [];

          if (!offers.length) {
            const result = await this.upsertPlan({
              productId,
              basePlanId,
              offerId: null,
              title: subscription.listings?.[0]?.title,
              description: subscription.listings?.[0]?.description,
              billingPeriod,
              state: basePlan.state,
            });
            syncedKeys.add(this.compositeKey(productId, basePlanId, null));
            if (result === 'created') createdCount += 1;
            if (result === 'updated') updatedCount += 1;
            continue;
          }

          for (const offer of offers) {
            const offerId = this.normalizedOptional(offer.offerId);
            const result = await this.upsertPlan({
              productId,
              basePlanId,
              offerId,
              title: subscription.listings?.[0]?.title,
              description: subscription.listings?.[0]?.description,
              billingPeriod,
              state: offer.state || basePlan.state,
            });
            syncedKeys.add(this.compositeKey(productId, basePlanId, offerId));
            if (result === 'created') createdCount += 1;
            if (result === 'updated') updatedCount += 1;
          }
        }
      }

      if (this.deactivateMissing()) {
        const googleMappedPlans = await this.prisma.subsPlan.findMany({
          where: {
            googleProductId: { not: null },
            isActive: true,
          },
          select: {
            id: true,
            googleProductId: true,
            googleBasePlanId: true,
            googleOfferId: true,
          },
        });

        const staleIds = googleMappedPlans
          .filter((plan) => {
            const key = this.compositeKey(
              this.normalizedOptional(plan.googleProductId),
              this.normalizedOptional(plan.googleBasePlanId),
              this.normalizedOptional(plan.googleOfferId),
            );
            return !syncedKeys.has(key);
          })
          .map((plan) => plan.id);

        if (staleIds.length) {
          const result = await this.prisma.subsPlan.updateMany({
            where: { id: { in: staleIds } },
            data: { isActive: false },
          });

          this.logger.warn(
            `Google catalog sync deactivated ${result.count} plan(s) missing in Google catalog list`,
          );
        }
      }

      this.logger.log(
        `Google catalog sync (${trigger}) completed: ${subscriptions.length} products scanned, ${createdCount} created, ${updatedCount} updated`,
      );
    } catch (error: any) {
      this.logger.error(`Google catalog sync failed: ${error?.message || error}`);
    } finally {
      this.syncInProgress = false;
    }
  }

  private async getAndroidPublisherToken(keyPath: string): Promise<string> {
    const client = new JWT({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });

    const token = await client.getAccessToken();
    if (!token?.token) {
      throw new Error('Failed to obtain Google Android Publisher access token');
    }

    return token.token;
  }

  private async fetchSubscriptions(packageName: string, token: string): Promise<GoogleSubscriptionItem[]> {
    const results: GoogleSubscriptionItem[] = [];
    let nextPageToken: string | null = null;

    do {
      const query = new URLSearchParams();
      query.set('pageSize', '100');
      if (nextPageToken) query.set('pageToken', nextPageToken);

      const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
        packageName,
      )}/subscriptions?${query.toString()}`;

      const json = await this.authorizedFetch(url, token);
      const chunk = Array.isArray(json?.subscriptions)
        ? (json.subscriptions as GoogleSubscriptionItem[])
        : [];

      results.push(...chunk);
      nextPageToken = this.normalizedOptional(json?.nextPageToken);
    } while (nextPageToken);

    return results;
  }

  private async fetchBasePlans(
    packageName: string,
    productId: string,
    token: string,
  ): Promise<GoogleBasePlanItem[]> {
    const results: GoogleBasePlanItem[] = [];
    let nextPageToken: string | null = null;

    do {
      const query = new URLSearchParams();
      query.set('pageSize', '100');
      if (nextPageToken) query.set('pageToken', nextPageToken);

      const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
        packageName,
      )}/subscriptions/${encodeURIComponent(productId)}/basePlans?${query.toString()}`;

      const json = await this.authorizedFetch(url, token);
      const chunk = Array.isArray(json?.basePlans)
        ? (json.basePlans as GoogleBasePlanItem[])
        : [];

      results.push(...chunk);
      nextPageToken = this.normalizedOptional(json?.nextPageToken);
    } while (nextPageToken);

    return results;
  }

  private async fetchOffers(
    packageName: string,
    productId: string,
    basePlanId: string,
    token: string,
  ): Promise<GoogleOfferItem[]> {
    const results: GoogleOfferItem[] = [];
    let nextPageToken: string | null = null;

    do {
      const query = new URLSearchParams();
      query.set('pageSize', '100');
      if (nextPageToken) query.set('pageToken', nextPageToken);

      const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
        packageName,
      )}/subscriptions/${encodeURIComponent(productId)}/basePlans/${encodeURIComponent(
        basePlanId,
      )}/offers?${query.toString()}`;

      const json = await this.authorizedFetch(url, token);
      const chunk = Array.isArray(json?.offers)
        ? (json.offers as GoogleOfferItem[])
        : [];

      results.push(...chunk);
      nextPageToken = this.normalizedOptional(json?.nextPageToken);
    } while (nextPageToken);

    return results;
  }

  private async authorizedFetch(url: string, token: string): Promise<any> {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Google catalog request failed (${response.status}): ${body.slice(0, 300)}`);
    }

    return response.json();
  }

  private async upsertPlan(input: {
    productId: string;
    basePlanId: string | null;
    offerId: string | null;
    title?: string;
    description?: string;
    billingPeriod: string | null;
    state?: string;
  }): Promise<'created' | 'updated'> {
    const existing = await this.prisma.subsPlan.findFirst({
      where: {
        googleProductId: input.productId,
        googleBasePlanId: input.basePlanId,
        googleOfferId: input.offerId,
      },
    });

    const displayName =
      this.normalizedOptional(input.title) ||
      this.fallbackName(input.productId, input.basePlanId, input.offerId);

    const isActive = this.inferIsActive(input.state);
    const inferredType = this.inferType(input.productId, input.basePlanId, input.offerId);
    const inferredInterval = this.inferInterval(input.billingPeriod, input.productId, input.basePlanId);
    const inferredIsFree = false;

    const payload = {
      name: existing?.name || displayName,
      description:
        existing?.description ||
        this.normalizedOptional(input.description) ||
        `Synced from Google Play (${input.productId})`,
      isActive,
      type: inferredType,
      isFree: existing?.isFree ?? inferredIsFree,
      interval: existing?.interval || inferredInterval,
      intervalCount: existing?.intervalCount || 1,
      displayOrder: existing?.displayOrder === 0 || !existing ? this.inferDisplayOrder(input.productId, input.basePlanId) : existing.displayOrder,
      trialDays:
        existing?.trialDays ??
        0,
      googleProductId: input.productId,
      googleBasePlanId: input.basePlanId,
      googleOfferId: input.offerId,
    } as any;

    if (existing) {
      await this.prisma.subsPlan.update({
        where: { id: existing.id },
        data: payload,
      });
      return 'updated';
    }

    await this.prisma.subsPlan.create({
      data: {
        ...payload,
        slug: await this.generateUniqueSlug(input.productId, input.basePlanId, input.offerId),
      },
    });
    return 'created';
  }

  private inferIsActive(state?: string): boolean {
    const normalized = this.normalizedOptional(state)?.toUpperCase() || '';
    if (!normalized) return true;
    if (normalized.includes('ACTIVE')) return true;
    if (normalized.includes('INACTIVE') || normalized.includes('ARCHIVED') || normalized.includes('DRAFT')) {
      return false;
    }
    return true;
  }

  private inferType(
    productId: string,
    basePlanId: string | null,
    offerId: string | null,
  ): SubscriptionPlan {
    const text = `${productId} ${basePlanId || ''} ${offerId || ''}`.toLowerCase();
    if (text.includes('premium') || text.includes('pro')) return SubscriptionPlan.PREMIUM;
    return SubscriptionPlan.BASIC;
  }

  private isTrialLikeProduct(productId: string): boolean {
    const p = productId.toLowerCase();
    return p.includes('trial') || p.includes('free');
  }

  private inferInterval(
    billingPeriod: string | null,
    productId: string,
    basePlanId: string | null,
  ): 'MONTH' | 'YEAR' {
    const period = (billingPeriod || '').toUpperCase();
    if (period.includes('Y')) return 'YEAR';
    if (period.includes('M')) return 'MONTH';

    const text = `${productId} ${basePlanId || ''}`.toLowerCase();
    if (text.includes('year') || text.includes('annual')) return 'YEAR';
    return 'MONTH';
  }

  private inferDisplayOrder(productId: string, basePlanId: string | null): number {
    const text = `${productId} ${basePlanId || ''}`.toLowerCase();
    if (text.includes('trial') || text.includes('free')) return 1;
    if (text.includes('month')) return 10;
    if (text.includes('year') || text.includes('annual')) return 20;
    return 50;
  }

  private fallbackName(productId: string, basePlanId: string | null, offerId: string | null): string {
    const parts = [productId, basePlanId, offerId]
      .filter(Boolean)
      .join(' ')
      .replace(/[._-]+/g, ' ')
      .trim();

    return parts
      .split(/\s+/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private async generateUniqueSlug(
    productId: string,
    basePlanId: string | null,
    offerId: string | null,
  ): Promise<string> {
    const raw = `gp_${productId}_${basePlanId || 'base'}_${offerId || 'standard'}`;
    const base = raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50) || 'google_plan';

    let slug = base;
    let idx = 1;
    while (await this.prisma.subsPlan.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${base}_${idx++}`;
    }

    return slug;
  }

  private normalizedOptional(value?: string | null): string | null {
    const normalized = value?.toString().trim();
    return normalized ? normalized : null;
  }

  private compositeKey(
    productId: string | null,
    basePlanId: string | null,
    offerId: string | null,
  ): string {
    return `${productId || ''}|${basePlanId || ''}|${offerId || ''}`;
  }

  private isSyncEnabled(): boolean {
    return process.env.IAP_GOOGLE_CATALOG_SYNC_ENABLED === '1';
  }

  private runOnStartup(): boolean {
    return process.env.IAP_GOOGLE_CATALOG_SYNC_RUN_ON_STARTUP !== '0';
  }

  private deactivateMissing(): boolean {
    return process.env.IAP_GOOGLE_CATALOG_SYNC_DEACTIVATE_MISSING === '1';
  }

}
