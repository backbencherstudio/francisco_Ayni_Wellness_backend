import { Injectable } from '@nestjs/common';
import { SubscriptionPlan } from '@prisma/client';
import {
  BillingProviderCode,
  NormalizeEntitlementInput,
  NormalizedEntitlementSnapshot,
  StoreEnvironmentCode,
  UnifiedEntitlementStatus,
} from './types/entitlement.types';

@Injectable()
export class IapEntitlementService {
  normalize(input: NormalizeEntitlementInput): NormalizedEntitlementSnapshot {
    const now = new Date();
    const environment: StoreEnvironmentCode = input.environment ?? 'UNKNOWN';
    const rawStatus = (input.status ?? '').toString().trim().toLowerCase();
    const endDate = input.periodEndAt ?? null;

    const unifiedStatus = this.mapStatus(rawStatus, input.provider, {
      endDate,
      isTrial: !!input.isTrial,
      cancelAtPeriodEnd: !!input.cancelAtPeriodEnd,
    });

    const isActiveByStatus = unifiedStatus === 'active' || unifiedStatus === 'trialing';
    const isActiveByDate = endDate ? endDate > now : true;
    const isActive = isActiveByStatus && isActiveByDate;

    const isStoreProvider = input.provider === 'APPLE' || input.provider === 'GOOGLE';
    const effectiveStatus =
      isStoreProvider && unifiedStatus === 'trialing' ? 'active' : unifiedStatus;

    const type =
      effectiveStatus === 'trialing'
        ? SubscriptionPlan.TRIALING
        : isActive
          ? SubscriptionPlan.BASIC
          : SubscriptionPlan.FREE;

    return {
      provider: input.provider,
      environment,
      unifiedStatus: effectiveStatus,
      isActive,
      type,
      status: rawStatus || 'unknown',
      isTrial: effectiveStatus === 'trialing' || (!isStoreProvider && !!input.isTrial),
      startDate: input.periodStartAt ?? null,
      endDate,
      trialEndsAt: input.trialEndAt ?? null,
      gracePeriodEndsAt: input.gracePeriodEndsAt ?? null,
      cancelAtPeriodEnd: !!input.cancelAtPeriodEnd,
      storeProductId: input.productId ?? null,
      storeBasePlanId: input.basePlanId ?? null,
      storeOfferId: input.offerId ?? null,
      externalSubscriptionId: input.externalSubscriptionId ?? null,
      purchaseToken: input.purchaseToken ?? null,
      originalTransactionId: input.originalTransactionId ?? null,
      latestReceiptPayloadHash: input.payloadHash ?? null,
      lastEventAt: input.lastEventAt ?? null,
      lastEventId: input.lastEventId ?? null,
      lastEventType: input.lastEventType ?? null,
    };
  }

  private mapStatus(
    rawStatus: string,
    provider: BillingProviderCode,
    meta: {
      endDate: Date | null;
      isTrial: boolean;
      cancelAtPeriodEnd: boolean;
    },
  ): UnifiedEntitlementStatus {
    if (!rawStatus) return 'unknown';

    const activeSet = new Set(['active', 'purchased', 'in_grace_period']);
    const trialSet = new Set(['trialing', 'in_trial']);
    const pastDueSet = new Set(['past_due', 'on_hold', 'billing_retry']);
    const pausedSet = new Set(['paused']);
    const canceledSet = new Set(['canceled', 'cancelled']);
    const expiredSet = new Set(['expired']);
    const refundedSet = new Set(['refunded']);
    const revokedSet = new Set(['revoked']);

    if (trialSet.has(rawStatus) || meta.isTrial) return 'trialing';
    if (pastDueSet.has(rawStatus)) return 'past_due';
    if (pausedSet.has(rawStatus)) return 'paused';
    if (refundedSet.has(rawStatus)) return 'refunded';
    if (revokedSet.has(rawStatus)) return 'revoked';
    if (canceledSet.has(rawStatus)) {
      return 'canceled';
    }
    if (expiredSet.has(rawStatus)) return 'expired';

    if (activeSet.has(rawStatus)) {
      if (meta.endDate && meta.endDate <= new Date()) return 'expired';
      return 'active';
    }

    return 'unknown';
  }
}
