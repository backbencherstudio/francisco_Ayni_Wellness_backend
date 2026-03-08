import { SubscriptionPlan } from '@prisma/client';

export type BillingProviderCode = 'NONE' | 'STRIPE' | 'APPLE' | 'GOOGLE';
export type StoreEnvironmentCode = 'UNKNOWN' | 'SANDBOX' | 'PRODUCTION';

export type UnifiedEntitlementStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'paused'
  | 'expired'
  | 'canceled'
  | 'refunded'
  | 'revoked'
  | 'unknown';

export interface NormalizeEntitlementInput {
  provider: BillingProviderCode;
  status?: string | null;
  productId?: string | null;
  basePlanId?: string | null;
  offerId?: string | null;
  externalSubscriptionId?: string | null;
  purchaseToken?: string | null;
  originalTransactionId?: string | null;
  periodStartAt?: Date | null;
  periodEndAt?: Date | null;
  trialEndAt?: Date | null;
  gracePeriodEndsAt?: Date | null;
  cancelAtPeriodEnd?: boolean;
  isTrial?: boolean;
  environment?: StoreEnvironmentCode;
  lastEventAt?: Date | null;
  lastEventId?: string | null;
  lastEventType?: string | null;
  payloadHash?: string | null;
}

export interface NormalizedEntitlementSnapshot {
  provider: BillingProviderCode;
  environment: StoreEnvironmentCode;
  unifiedStatus: UnifiedEntitlementStatus;
  isActive: boolean;
  type: SubscriptionPlan;
  status: string;
  isTrial: boolean;
  startDate: Date | null;
  endDate: Date | null;
  trialEndsAt: Date | null;
  gracePeriodEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  storeProductId: string | null;
  storeBasePlanId: string | null;
  storeOfferId: string | null;
  externalSubscriptionId: string | null;
  purchaseToken: string | null;
  originalTransactionId: string | null;
  latestReceiptPayloadHash: string | null;
  lastEventAt: Date | null;
  lastEventId: string | null;
  lastEventType: string | null;
}
