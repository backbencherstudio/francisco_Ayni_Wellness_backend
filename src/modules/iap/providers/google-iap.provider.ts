import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { JWT } from 'google-auth-library';
import { NormalizeEntitlementInput } from '../types/entitlement.types';
import { VerifyGoogleIapDto } from '../dto/verify-google-iap.dto';

@Injectable()
export class GoogleIapProvider {
  async verifyMobileSubscription(dto: VerifyGoogleIapDto): Promise<NormalizeEntitlementInput> {
    if (!dto.purchaseToken) {
      throw new BadRequestException('purchaseToken is required');
    }

    if (!dto.productId) {
      throw new BadRequestException('productId is required');
    }

    const packageName = dto.packageName || process.env.GOOGLE_PLAY_PACKAGE_NAME;
    if (!packageName) {
      throw new BadRequestException('GOOGLE_PLAY_PACKAGE_NAME (or dto.packageName) is required for Google verification');
    }

    const subscription = await this.fetchSubscriptionV2(
      packageName,
      dto.purchaseToken,
    );

    const lineItem = subscription?.lineItems?.[0] || {};
    const latestOrderId = subscription?.latestOrderId;
    const expiryTime = this.toDate(lineItem.expiryTime);
    const startTime = this.toDate(lineItem.startTime);
    const autoRenewEnabled = !!lineItem.autoRenewingPlan?.autoRenewEnabled;
    const offerDetails = lineItem.offerDetails || {};

    const state = String(subscription?.subscriptionState || '').toUpperCase();
    const status = this.mapGoogleState(state, expiryTime);
    const isTrial =
      String(offerDetails?.basePlanId || '').toLowerCase().includes('trial') ||
      String(offerDetails?.offerId || '').toLowerCase().includes('trial') ||
      status === 'trialing';

    return {
      provider: 'GOOGLE',
      status,
      productId: dto.productId,
      basePlanId: dto.basePlanId || offerDetails?.basePlanId,
      offerId: dto.offerId || offerDetails?.offerId,
      // Do not trust client-provided IDs and do not fall back to non-unique productId.
      externalSubscriptionId:
        typeof latestOrderId === 'string' && latestOrderId.length
          ? latestOrderId
          : null,
      purchaseToken: dto.purchaseToken,
      periodStartAt: startTime,
      periodEndAt: expiryTime,
      trialEndAt: isTrial ? expiryTime : null,
      gracePeriodEndsAt: null,
      cancelAtPeriodEnd: !autoRenewEnabled,
      isTrial,
      environment: dto.environment || 'PRODUCTION',
      lastEventAt: new Date(),
      lastEventId: dto.eventId,
      lastEventType: dto.eventType,
      payloadHash: dto.payloadHash || this.safeHash(`${dto.productId}:${dto.purchaseToken}`),
    };
  }

  private async fetchSubscriptionV2(packageName: string, purchaseToken: string) {
    const keyPath = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH;
    if (!keyPath) {
      throw new BadRequestException(
        'GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH is required for Google verification',
      );
    }

    const client = new JWT({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const token = await client.getAccessToken();
    if (!token?.token) {
      throw new BadRequestException('Failed to obtain Google Android Publisher access token');
    }

    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
      packageName,
    )}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token.token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(
        `Google subscription verification failed (${response.status}): ${errorText.slice(0, 300)}`,
      );
    }

    return (await response.json()) as any;
  }

  private mapGoogleState(
    state: string,
    expiryTime: Date | null,
  ): 'active' | 'trialing' | 'past_due' | 'paused' | 'expired' | 'canceled' {
    const now = new Date();
    if (expiryTime && expiryTime <= now) return 'expired';

    switch (state) {
      case 'SUBSCRIPTION_STATE_ACTIVE':
        return 'active';
      case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
        return 'past_due';
      case 'SUBSCRIPTION_STATE_ON_HOLD':
        return 'past_due';
      case 'SUBSCRIPTION_STATE_PAUSED':
        return 'paused';
      case 'SUBSCRIPTION_STATE_CANCELED':
      case 'SUBSCRIPTION_STATE_CANCELLED':
        return 'canceled';
      case 'SUBSCRIPTION_STATE_EXPIRED':
      default:
        return 'expired';
    }
  }

  private toDate(input?: string): Date | null {
    if (!input) return null;
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private safeHash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
