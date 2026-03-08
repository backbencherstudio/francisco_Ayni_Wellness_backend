import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { SignJWT, createRemoteJWKSet, importPKCS8, jwtVerify } from 'jose';
import { NormalizeEntitlementInput } from '../types/entitlement.types';
import { VerifyAppleIapDto } from '../dto/verify-apple-iap.dto';

const APPLE_JWKS_URL = new URL('https://appleid.apple.com/auth/keys');
const appleJwks = createRemoteJWKSet(APPLE_JWKS_URL);

@Injectable()
export class AppleIapProvider {
  async verifyMobileSubscription(dto: VerifyAppleIapDto): Promise<NormalizeEntitlementInput> {
    const bundleId = process.env.APPLE_BUNDLE_ID || process.env.APPLE_CLIENT_ID;
    if (!bundleId) {
      throw new BadRequestException('APPLE_BUNDLE_ID or APPLE_CLIENT_ID is required for Apple IAP verification');
    }

    let signedPayload = dto.signedPayload;
    if (!signedPayload && dto.transactionId) {
      signedPayload = await this.fetchSignedTransactionInfo(dto.transactionId, dto.environment);
    }

    if (!signedPayload) {
      throw new BadRequestException('Apple verification requires signedPayload or transactionId with App Store API credentials');
    }

    const payload = await this.verifySignedJws(signedPayload, bundleId);

    const now = Date.now();
    const expiresDateMs = this.parseEpochMillis(payload.expiresDate);
    const purchaseDateMs = this.parseEpochMillis(payload.purchaseDate);
    const revocationDateMs = this.parseEpochMillis(payload.revocationDate);
    const originalPurchaseDateMs = this.parseEpochMillis(payload.originalPurchaseDate);

    const status = revocationDateMs
      ? 'revoked'
      : expiresDateMs && expiresDateMs <= now
        ? 'expired'
        : payload.offerType === 1
          ? 'trialing'
          : 'active';

    const isTrial = status === 'trialing';
    const environment = payload.environment === 'Sandbox' ? 'SANDBOX' : payload.environment === 'Production' ? 'PRODUCTION' : (dto.environment || 'UNKNOWN');

    const externalSubscriptionId =
      dto.externalSubscriptionId ||
      payload.webOrderLineItemId?.toString?.() ||
      payload.originalTransactionId?.toString?.() ||
      payload.transactionId?.toString?.();

    if (!externalSubscriptionId) {
      throw new BadRequestException(
        'Missing Apple subscription identifier after verification (expected originalTransactionId or transactionId).',
      );
    }

    return {
      provider: 'APPLE',
      status,
      productId: dto.productId || payload.productId,
      externalSubscriptionId,
      originalTransactionId:
        dto.originalTransactionId ||
        payload.originalTransactionId?.toString?.() ||
        payload.transactionId?.toString?.(),
      periodStartAt: this.toDateFromMs(purchaseDateMs || originalPurchaseDateMs),
      periodEndAt: this.toDateFromMs(expiresDateMs),
      trialEndAt: isTrial ? this.toDateFromMs(expiresDateMs) : null,
      gracePeriodEndsAt: null,
      cancelAtPeriodEnd: false,
      isTrial,
      environment,
      lastEventAt: new Date(),
      lastEventId: dto.eventId,
      lastEventType: dto.eventType,
      payloadHash: dto.payloadHash || this.safeHash(signedPayload),
    };
  }

  async verifyServerNotificationPayload(signedPayload: string): Promise<{
    eventId?: string;
    eventType?: string;
    environment: 'UNKNOWN' | 'SANDBOX' | 'PRODUCTION';
    externalSubscriptionId?: string;
    normalizedInput?: NormalizeEntitlementInput;
    payload: Record<string, any>;
  }> {
    const bundleId = process.env.APPLE_BUNDLE_ID || process.env.APPLE_CLIENT_ID;
    if (!bundleId) {
      throw new BadRequestException('APPLE_BUNDLE_ID or APPLE_CLIENT_ID is required for Apple webhook verification');
    }

    const payload = await this.verifySignedJws(signedPayload, bundleId);
    const notificationType = payload.notificationType as string | undefined;
    const subtype = payload.subtype as string | undefined;
    const environment =
      payload.environment === 'Sandbox'
        ? 'SANDBOX'
        : payload.environment === 'Production'
          ? 'PRODUCTION'
          : 'UNKNOWN';

    const signedTransactionInfo = payload?.data?.signedTransactionInfo;
    let normalizedInput: NormalizeEntitlementInput | undefined;
    let externalSubscriptionId: string | undefined;

    if (typeof signedTransactionInfo === 'string' && signedTransactionInfo.length > 20) {
      const txPayload = await this.verifySignedJws(signedTransactionInfo, bundleId);
      const expiresDateMs = this.parseEpochMillis(txPayload.expiresDate);
      const purchaseDateMs = this.parseEpochMillis(txPayload.purchaseDate);
      const revocationDateMs = this.parseEpochMillis(txPayload.revocationDate);

      const status = revocationDateMs
        ? 'revoked'
        : expiresDateMs && expiresDateMs <= Date.now()
          ? 'expired'
          : txPayload.offerType === 1
            ? 'trialing'
            : 'active';

      externalSubscriptionId =
        txPayload.webOrderLineItemId?.toString?.() ||
        txPayload.originalTransactionId?.toString?.() ||
        txPayload.transactionId?.toString?.();

      normalizedInput = {
        provider: 'APPLE',
        status,
        productId: txPayload.productId,
        externalSubscriptionId,
        originalTransactionId:
          txPayload.originalTransactionId?.toString?.() ||
          txPayload.transactionId?.toString?.(),
        periodStartAt: this.toDateFromMs(purchaseDateMs),
        periodEndAt: this.toDateFromMs(expiresDateMs),
        trialEndAt: status === 'trialing' ? this.toDateFromMs(expiresDateMs) : null,
        cancelAtPeriodEnd: false,
        isTrial: status === 'trialing',
        environment,
        lastEventAt: new Date(),
        lastEventType: notificationType || 'apple.notification',
        payloadHash: this.safeHash(signedTransactionInfo),
      };
    }

    return {
      eventId:
        payload.notificationUUID?.toString?.() ||
        payload.signedDate?.toString?.(),
      eventType: [notificationType, subtype].filter(Boolean).join('.') || 'apple.notification',
      environment,
      externalSubscriptionId,
      normalizedInput,
      payload,
    };
  }

  private async verifySignedJws(
    signedJws: string,
    bundleId: string,
  ): Promise<Record<string, any>> {
    const { payload } = await jwtVerify(signedJws, appleJwks);

    const payloadBundleId =
      (payload as any)?.bundleId || (payload as any)?.bid || (payload as any)?.aud;
    if (payloadBundleId && String(payloadBundleId) !== String(bundleId)) {
      throw new BadRequestException(
        `Apple signed payload bundle id mismatch. Expected '${bundleId}', got '${payloadBundleId}'.`,
      );
    }

    return payload as Record<string, any>;
  }

  private async fetchSignedTransactionInfo(
    transactionId: string,
    environment?: 'UNKNOWN' | 'SANDBOX' | 'PRODUCTION',
  ): Promise<string> {
    const keyId = process.env.APPLE_KEY_ID;
    const issuerId = process.env.APPLE_ISSUER_ID;
    const privateKeyRaw = process.env.APPLE_PRIVATE_KEY;
    const bundleId = process.env.APPLE_BUNDLE_ID || process.env.APPLE_CLIENT_ID;

    if (!keyId || !issuerId || !privateKeyRaw || !bundleId) {
      throw new BadRequestException(
        'Missing Apple App Store API credentials (APPLE_KEY_ID, APPLE_ISSUER_ID, APPLE_PRIVATE_KEY, APPLE_BUNDLE_ID/APPLE_CLIENT_ID)',
      );
    }

    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
    const ecPrivateKey = await importPKCS8(privateKey, 'ES256');
    const now = Math.floor(Date.now() / 1000);

    const token = await new SignJWT({ bid: bundleId })
      .setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
      .setIssuer(issuerId)
      .setAudience('appstoreconnect-v1')
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(ecPrivateKey);

    const host = environment === 'SANDBOX'
      ? 'https://api.storekit-sandbox.itunes.apple.com'
      : 'https://api.storekit.itunes.apple.com';
    const url = `${host}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(
        `Apple transaction lookup failed (${response.status}): ${errorText.slice(0, 300)}`,
      );
    }

    const json = (await response.json()) as any;
    if (!json?.signedTransactionInfo) {
      throw new BadRequestException('Apple transaction response missing signedTransactionInfo');
    }

    return String(json.signedTransactionInfo);
  }

  private parseEpochMillis(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return null;
    return num;
  }

  private toDateFromMs(value: number | null): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private safeHash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
