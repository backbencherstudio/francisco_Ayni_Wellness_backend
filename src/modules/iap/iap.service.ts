import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, SubscriptionPlan } from '@prisma/client';
import { IapEntitlementService } from './iap-entitlement.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppleWebhookDto } from './dto/apple-webhook.dto';
import { CancelIapDto } from './dto/cancel-iap.dto';
import { GoogleWebhookDto } from './dto/google-webhook.dto';
import { RestoreIapDto } from './dto/restore-iap.dto';
import { VerifyAppleIapDto } from './dto/verify-apple-iap.dto';
import { VerifyGoogleIapDto } from './dto/verify-google-iap.dto';
import { AppleIapProvider } from './providers/apple-iap.provider';
import { GoogleIapProvider } from './providers/google-iap.provider';
import {
  NormalizeEntitlementInput,
  NormalizedEntitlementSnapshot,
} from './types/entitlement.types';

@Injectable()
export class IapService {
  constructor(
    private readonly entitlementService: IapEntitlementService,
    private readonly appleProvider: AppleIapProvider,
    private readonly googleProvider: GoogleIapProvider,
    private readonly prisma: PrismaService,
  ) {}

  normalizeEntitlement(input: NormalizeEntitlementInput): NormalizedEntitlementSnapshot {
    return this.entitlementService.normalize(input);
  }

  // Placeholder to be used by Phase 2 provider verifiers.
  sampleNormalizedSnapshot(): NormalizedEntitlementSnapshot {
    return this.normalizeEntitlement({
      provider: 'NONE',
      status: 'unknown',
      environment: 'UNKNOWN',
    });
  }

  async verifyApple(userId: string, dto: VerifyAppleIapDto) {
    const verified = await this.appleProvider.verifyMobileSubscription(dto);
    const snapshot = this.normalizeEntitlement(verified);
    const event = await this.createStoreEventLog({
      provider: 'APPLE',
      eventId: dto.eventId,
      eventType: dto.eventType || 'client.verify.apple',
      environment: snapshot.environment,
      externalSubscriptionId:
        snapshot.externalSubscriptionId || snapshot.originalTransactionId,
      userId,
      payload: this.safePayload({
        productId: dto.productId,
        originalTransactionId: dto.originalTransactionId,
        transactionId: dto.transactionId,
      }),
    });

    return {
      success: true,
      statusCode: 200,
      message: 'Apple IAP payload verified. Entitlement update will be applied via webhook.',
      duplicate_event: event.duplicate,
      pending_webhook: true,
      data: {
        event_id: event.record.eventId,
        event_log_status: event.record.status,
        entitlement: snapshot,
      },
    };
  }

  async verifyGoogle(userId: string, dto: VerifyGoogleIapDto) {
    const verified = await this.googleProvider.verifyMobileSubscription(dto);
    const snapshot = this.normalizeEntitlement(verified);
    const event = await this.createStoreEventLog({
      provider: 'GOOGLE',
      eventId: dto.eventId,
      eventType: dto.eventType || 'client.verify.google',
      environment: snapshot.environment,
      externalSubscriptionId: snapshot.externalSubscriptionId || snapshot.purchaseToken,
      userId,
      payload: this.safePayload({
        productId: dto.productId,
        purchaseToken: dto.purchaseToken,
        basePlanId: dto.basePlanId,
        offerId: dto.offerId,
      }),
    });

    return {
      success: true,
      statusCode: 200,
      message: 'Google IAP payload verified. Entitlement update will be applied via webhook.',
      duplicate_event: event.duplicate,
      pending_webhook: true,
      data: {
        event_id: event.record.eventId,
        event_log_status: event.record.status,
        entitlement: snapshot,
      },
    };
  }

  async restore(userId: string, dto: RestoreIapDto) {
    if (dto.provider === 'APPLE' && dto.originalTransactionId) {
      return this.verifyApple(userId, {
        originalTransactionId: dto.originalTransactionId,
        planId: dto.planId,
        eventType: 'client.restore.apple',
      });
    }

    if (dto.provider === 'GOOGLE' && dto.purchaseToken && dto.productId) {
      return this.verifyGoogle(userId, {
        purchaseToken: dto.purchaseToken,
        productId: dto.productId,
        planId: dto.planId,
        eventType: 'client.restore.google',
      });
    }

    const latest = await this.prisma.subscription.findFirst({
      where: {
        userId,
        provider: { in: ['APPLE', 'GOOGLE'] },
      },
      include: { plan: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (!latest) {
      return {
        success: true,
        statusCode: 200,
        message: 'No mobile IAP entitlement found to restore',
        data: null,
      };
    }

    return {
      success: true,
      statusCode: 200,
      message: 'Latest mobile IAP entitlement restored from local snapshot',
      data: latest,
    };
  }

  async getCurrentSubscriptionStatus(userId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        provider: { in: ['APPLE', 'GOOGLE'] },
      },
      include: { plan: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (!subscription) {
      return {
        success: true,
        statusCode: 200,
        data: {
          hasSubscription: false,
          provider: null,
          status: 'none',
          isActive: false,
        },
      };
    }

    return {
      success: true,
      statusCode: 200,
      data: {
        hasSubscription: true,
        id: subscription.id,
        provider: subscription.provider,
        status: subscription.status,
        isActive: subscription.isActive,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        plan: subscription.plan
          ? {
              id: subscription.plan.id,
              name: subscription.plan.name,
              slug: subscription.plan.slug,
              type: subscription.plan.type,
            }
          : null,
      },
    };
  }

  async cancelInStore(userId: string, dto: CancelIapDto) {
    const activeOrLatest = await this.prisma.subscription.findFirst({
      where: {
        userId,
        provider: dto.provider,
      },
      include: { plan: true },
      orderBy: { updatedAt: 'desc' },
    });

    const appleManageUrl = 'https://apps.apple.com/account/subscriptions';
    const packageName = dto.packageName || process.env.GOOGLE_PLAY_PACKAGE_NAME || '';
    const androidBaseUrl = 'https://play.google.com/store/account/subscriptions';
    const googleManageUrl = packageName
      ? `${androidBaseUrl}?package=${encodeURIComponent(packageName)}`
      : androidBaseUrl;

    return {
      success: true,
      statusCode: 200,
      message:
        'Cancel must be completed in the app store. Subscription access will be updated after webhook events are processed.',
      data: {
        provider: dto.provider,
        manageUrl: dto.provider === 'APPLE' ? appleManageUrl : googleManageUrl,
        actionRequired: true,
        sourceOfTruth: 'webhook',
        currentSubscription: activeOrLatest
          ? {
              id: activeOrLatest.id,
              status: activeOrLatest.status,
              isActive: activeOrLatest.isActive,
              cancelAtPeriodEnd: activeOrLatest.cancelAtPeriodEnd,
              endDate: activeOrLatest.endDate,
              storeProductId: activeOrLatest.storeProductId,
              planName: activeOrLatest.plan?.name || null,
            }
          : null,
      },
    };
  }

  async logAppleWebhook(dto: AppleWebhookDto) {
    const verifiedWebhook = dto.signedPayload
      ? await this.appleProvider.verifyServerNotificationPayload(dto.signedPayload)
      : null;

    const eventId =
      dto.eventId ||
      verifiedWebhook?.eventId ||
      undefined;
    const eventType =
      dto.eventType ||
      verifiedWebhook?.eventType ||
      'server.webhook.apple';
    const environment =
      dto.environment ||
      verifiedWebhook?.environment ||
      'UNKNOWN';
    const externalSubscriptionId =
      dto.externalSubscriptionId ||
      verifiedWebhook?.externalSubscriptionId;

    const event = await this.createStoreEventLog({
      provider: 'APPLE',
      eventId,
      eventType,
      environment,
      externalSubscriptionId,
      payload: this.safePayload({
        payload: dto.payload || {},
        verifiedPayload: verifiedWebhook?.payload || null,
      }),
    });

    if (!event.duplicate && verifiedWebhook?.normalizedInput) {
      const userId = await this.resolveUserIdForProviderPayload(
        'APPLE',
        verifiedWebhook.normalizedInput,
      );
      if (userId) {
        await this.upsertSubscriptionFromSnapshot(
          userId,
          this.normalizeEntitlement(verifiedWebhook.normalizedInput),
          undefined,
          event.record.id,
        );
      }
    }

    return {
      received: true,
      duplicate_event: event.duplicate,
      event_id: event.record.eventId,
    };
  }

  async logGoogleWebhook(dto: GoogleWebhookDto) {
    const payloadObj: any = dto.payload || {};
    const subNotification = payloadObj?.subscriptionNotification || {};
    const purchaseToken =
      dto.purchaseToken ||
      subNotification.purchaseToken ||
      payloadObj.purchaseToken;
    const productId =
      subNotification.subscriptionId ||
      payloadObj.subscriptionId ||
      payloadObj.productId;

    let verifiedInput: NormalizeEntitlementInput | null = null;
    if (purchaseToken && productId) {
      verifiedInput = await this.googleProvider.verifyMobileSubscription({
        purchaseToken,
        productId,
        basePlanId: payloadObj.basePlanId,
        offerId: payloadObj.offerId,
        environment: dto.environment,
      } as any);
      verifiedInput.lastEventType = dto.eventType || `google.rtdn.${String(subNotification.notificationType || 'unknown')}`;
      verifiedInput.lastEventAt = new Date();
    }

    const event = await this.createStoreEventLog({
      provider: 'GOOGLE',
      eventId: dto.eventId,
      eventType: dto.eventType || 'server.webhook.google',
      environment: dto.environment || 'UNKNOWN',
      externalSubscriptionId:
        dto.externalSubscriptionId || verifiedInput?.externalSubscriptionId || purchaseToken,
      payload: this.safePayload({
        purchaseToken,
        payload: dto.payload || {},
      }),
    });

    if (!event.duplicate && verifiedInput) {
      const userId = await this.resolveUserIdForProviderPayload('GOOGLE', verifiedInput);
      if (userId) {
        await this.upsertSubscriptionFromSnapshot(
          userId,
          this.normalizeEntitlement(verifiedInput),
          undefined,
          event.record.id,
        );
      }
    }

    return {
      received: true,
      duplicate_event: event.duplicate,
      event_id: event.record.eventId,
    };
  }

  private async upsertSubscriptionFromSnapshot(
    userId: string,
    snapshot: NormalizedEntitlementSnapshot,
    explicitPlanId?: string,
    eventRecordId?: string,
  ) {
    const planId = await this.resolvePlanId(userId, explicitPlanId, snapshot.type);

    const conditions: any[] = [];
    if (snapshot.externalSubscriptionId) {
      conditions.push({
        provider: snapshot.provider,
        externalSubscriptionId: snapshot.externalSubscriptionId,
      });
    }
    if (snapshot.purchaseToken) {
      conditions.push({
        provider: snapshot.provider,
        purchaseToken: snapshot.purchaseToken,
      });
    }
    if (snapshot.originalTransactionId) {
      conditions.push({
        provider: snapshot.provider,
        originalTransactionId: snapshot.originalTransactionId,
      });
    }
    conditions.push({ userId, provider: snapshot.provider, isActive: true });

    const existing = await this.prisma.subscription.findFirst({
      where: {
        OR: conditions,
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    const endDate = snapshot.endDate;
    const remainingDays = endDate
      ? Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 3600 * 24)))
      : null;

    const finalType = snapshot.isActive
      ? snapshot.type
      : SubscriptionPlan.FREE;

    const payload: any = {
      userId,
      plan: { connect: { id: planId } },
      provider: snapshot.provider,
      status: snapshot.unifiedStatus,
      type: finalType,
      isActive: snapshot.isActive,
      isTrial: snapshot.isTrial,
      startDate: snapshot.startDate || now,
      endDate: snapshot.endDate,
      trialEndsAt: snapshot.trialEndsAt,
      gracePeriodEndsAt: snapshot.gracePeriodEndsAt,
      cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
      storeProductId: snapshot.storeProductId,
      storeBasePlanId: snapshot.storeBasePlanId,
      storeOfferId: snapshot.storeOfferId,
      externalSubscriptionId: snapshot.externalSubscriptionId,
      purchaseToken: snapshot.purchaseToken,
      originalTransactionId: snapshot.originalTransactionId,
      environment: snapshot.environment,
      latestReceiptPayloadHash: snapshot.latestReceiptPayloadHash,
      lastEventAt: snapshot.lastEventAt,
      lastEventType: snapshot.lastEventType,
      lastEventId: snapshot.lastEventId || eventRecordId || null,
      remainingDays: remainingDays ?? undefined,
      updatedAt: now,
    };

    const subscription = existing
      ? await this.prisma.subscription.update({
          where: { id: existing.id },
          data: payload,
          include: { plan: true },
        })
      : await this.prisma.subscription.create({
          data: {
            ...payload,
            createdAt: now,
          },
          include: { plan: true },
        });

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { IsSubscriptionActive: !!snapshot.isActive },
      });
    } catch (e) {
      // Mirror-field update should not block verification.
    }

    if (eventRecordId) {
      await this.prisma.storeEventLog.update({
        where: { id: eventRecordId },
        data: {
          status: 'processed',
          processedAt: new Date(),
          userId,
          subscriptionId: subscription.id,
        },
      });
    }

    return subscription;
  }

  private async resolvePlanId(
    userId: string,
    explicitPlanId: string | undefined,
    type: SubscriptionPlan,
  ): Promise<string> {
    if (explicitPlanId) {
      const explicit = await this.prisma.subsPlan.findUnique({
        where: { id: explicitPlanId },
        select: { id: true },
      });
      if (!explicit) {
        throw new BadRequestException('Provided planId was not found in SubsPlan');
      }
      return explicit.id;
    }

    const latestUserSub = await this.prisma.subscription.findFirst({
      where: { userId },
      select: { planId: true },
      orderBy: { createdAt: 'desc' },
    });
    if (latestUserSub?.planId) return latestUserSub.planId;

    const preferredPlan =
      type === SubscriptionPlan.FREE
        ? await this.prisma.subsPlan.findFirst({
            where: { OR: [{ isFree: true }, { type: SubscriptionPlan.FREE }] },
            select: { id: true },
          })
        : await this.prisma.subsPlan.findFirst({
            where: {
              isFree: false,
              type: { in: [type, SubscriptionPlan.BASIC, SubscriptionPlan.PREMIUM] },
            },
            orderBy: { price: 'asc' },
            select: { id: true },
          });

    if (preferredPlan?.id) return preferredPlan.id;

    const fallbackPlan = await this.prisma.subsPlan.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (fallbackPlan?.id) return fallbackPlan.id;

    throw new BadRequestException(
      'No subscription plans found. Create at least one SubsPlan before verifying IAP.',
    );
  }

  private async createStoreEventLog(args: {
    provider: 'APPLE' | 'GOOGLE';
    eventId?: string;
    eventType?: string;
    environment: 'UNKNOWN' | 'SANDBOX' | 'PRODUCTION';
    externalSubscriptionId?: string | null;
    userId?: string;
    payload?: Prisma.InputJsonValue;
  }): Promise<{ record: any; duplicate: boolean }> {
    const eventId = args.eventId || this.generateSyntheticEventId(args.provider);
    try {
      const created = await this.prisma.storeEventLog.create({
        data: {
          provider: args.provider,
          eventId,
          eventType: args.eventType,
          environment: args.environment,
          externalSubscriptionId: args.externalSubscriptionId || null,
          userId: args.userId,
          payload: args.payload,
          status: 'received',
        },
      });
      return { record: created, duplicate: false };
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const existing = await this.prisma.storeEventLog.findFirst({
          where: {
            provider: args.provider,
            eventId,
          },
        });
        if (!existing) throw error;
        return { record: existing, duplicate: true };
      }
      throw error;
    }
  }

  private safePayload(payload: Record<string, any>): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(payload || {}));
  }

  private generateSyntheticEventId(provider: 'APPLE' | 'GOOGLE'): string {
    return `${provider.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private async resolveUserIdForProviderPayload(
    provider: 'APPLE' | 'GOOGLE',
    input: NormalizeEntitlementInput,
  ): Promise<string | null> {
    const orConditions = [
      input.externalSubscriptionId
        ? {
            provider,
            externalSubscriptionId: input.externalSubscriptionId,
          }
        : undefined,
      input.purchaseToken
        ? {
            provider,
            purchaseToken: input.purchaseToken,
          }
        : undefined,
      input.originalTransactionId
        ? {
            provider,
            originalTransactionId: input.originalTransactionId,
          }
        : undefined,
    ].filter(Boolean) as any[];

    if (!orConditions.length) return null;

    const existing = await this.prisma.subscription.findFirst({
      where: {
        OR: orConditions,
      },
      select: { userId: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (existing?.userId) {
      return existing.userId;
    }

    const candidateExternalIds = [
      input.externalSubscriptionId,
      input.purchaseToken,
      input.originalTransactionId,
    ].filter(Boolean) as string[];

    if (!candidateExternalIds.length) {
      return null;
    }

    const mappedFromEventLog = await this.prisma.storeEventLog.findFirst({
      where: {
        provider,
        externalSubscriptionId: { in: candidateExternalIds },
        userId: { not: null },
      },
      select: { userId: true },
      orderBy: { createdAt: 'desc' },
    });

    return mappedFromEventLog?.userId || null;
  }
}
