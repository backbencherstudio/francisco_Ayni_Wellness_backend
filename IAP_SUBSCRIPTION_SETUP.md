# Mobile Subscription Implementation Guide (Backend Trial + Apple/Google IAP)

This is the current end-to-end implementation guide for this backend.

Scope:
- One backend-managed 14-day trial.
- Paid subscriptions through Apple and Google in-app purchase only.
- Webhook-authoritative entitlement updates.

Important policy:
- Trial is backend-only. Do not create trial products in Apple or Google stores.

Base URL examples:
- Production domain: https://ayni-wellness.com
- API prefix: /api

Current public APIs used by mobile app:
- POST /api/subscription/start-trial
- GET /api/subscription/status
- GET /api/subscription/plans/mobile?platform=ios|android|all
- POST /api/iap/verify/apple
- POST /api/iap/verify/google
- POST /api/iap/restore
- GET /api/iap/subscription/status
- POST /api/iap/subscription/cancel
- POST /api/iap/webhook/apple
- POST /api/iap/webhook/google

## 1) Architecture and Responsibilities

Subscription module responsibilities:
- Trial start flow.
- Plan listing for app paywall.

IAP module responsibilities:
- Verify Apple/Google purchase payloads.
- Restore flow.
- Current IAP subscription status.
- Store cancel instructions.
- Webhook ingest and final entitlement updates.

Source of truth policy:
- Verify endpoints validate and log linkage metadata.
- Webhooks are the source of truth for activate/deactivate/update lifecycle.
- Access flags are updated from webhook processing.

## 2) Prerequisites

You need:
- PostgreSQL and Redis running.
- Apple products created in App Store Connect.
- Google subscription products/base plans created in Play Console.
- HTTPS reachable backend for webhook relay.

## 3) Environment Setup

Copy and fill values from .env.example.

Required core values:

```env
APP_URL=https://ayni-wellness.com

# Trial length (seed + runtime fallback)
TRIAL_DAYS=14
SUBSCRIPTION_TRIAL_DAYS=14

# Webhook relay secret
IAP_WEBHOOK_SECRET=<strong-random-secret>

# Apple verification
APPLE_BUNDLE_ID=<ios_bundle_id>
APPLE_CLIENT_ID=<optional_fallback>
APPLE_ISSUER_ID=<app_store_connect_issuer_id>
APPLE_KEY_ID=<app_store_connect_key_id>
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
APPLE_APP_ID=<optional_app_store_connect_app_id>

# Optional Apple catalog sync
IAP_APPLE_CATALOG_SYNC_ENABLED=0
IAP_APPLE_CATALOG_SYNC_RUN_ON_STARTUP=1
IAP_APPLE_CATALOG_SYNC_DEACTIVATE_MISSING=0

# Google verification
GOOGLE_PLAY_PACKAGE_NAME=<android_package_name>
GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH=<absolute_path_to_service_account.json>

# Optional Google catalog sync
IAP_GOOGLE_CATALOG_SYNC_ENABLED=0
IAP_GOOGLE_CATALOG_SYNC_RUN_ON_STARTUP=1
IAP_GOOGLE_CATALOG_SYNC_DEACTIVATE_MISSING=0
```

Generate webhook secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 4) Database Initialization

Run migrations, then run seed.

### 4.1 Migrate

Use your normal migration process (for example, Prisma migrate deploy/dev based on environment).

### 4.2 Seed

The seed command now ensures 3 plans exist by default:
- free_trial
- premium_monthly
- premium_yearly

Command:

```bash
yarn cmd seed
```

What seed guarantees:
- Creates/updates trial plan:
  - slug: free_trial
  - type: TRIALING
  - isFree: true
  - trialDays: SUBSCRIPTION_TRIAL_DAYS or TRIAL_DAYS (default 14)
- Creates/updates paid monthly plan:
  - slug: premium_monthly
  - type: PREMIUM
  - interval: MONTH
- Creates/updates paid yearly plan:
  - slug: premium_yearly
  - type: PREMIUM
  - interval: YEAR

Seed also supports optional Apple/Google mapping values through env variables so plans can be usable immediately in app paywall filtering.

Seed mapping env keys:
- SEED_APPLE_MONTHLY_PRODUCT_ID
- SEED_GOOGLE_MONTHLY_PRODUCT_ID
- SEED_GOOGLE_MONTHLY_BASE_PLAN_ID
- SEED_GOOGLE_MONTHLY_OFFER_ID
- SEED_APPLE_YEARLY_PRODUCT_ID
- SEED_GOOGLE_YEARLY_PRODUCT_ID
- SEED_GOOGLE_YEARLY_BASE_PLAN_ID
- SEED_GOOGLE_YEARLY_OFFER_ID

## 5) Paid Plan Catalog Setup

There is no public admin API for plan creation in current app-only setup.

Recommended production strategy:
1. Seed baseline plans (trial/monthly/yearly) on every environment.
2. Keep Apple product IDs updated by Apple auto-sync (optional but recommended).
3. Keep Google product/base-plan/offer mappings updated by Google auto-sync (recommended).
4. Keep seed env mappings as fallback defaults and for deterministic bootstrapping.
5. Keep trial plan as backend-only (no Apple/Google trial product mappings).

You have 2 supported ways to keep paid plans in subs_plans:

1. Apple auto-sync (optional, recommended for Apple IDs)
- Enable IAP_APPLE_CATALOG_SYNC_ENABLED=1.
- Backend syncs Apple subscription products into subs_plans every 6 hours and optionally on startup.
- If seeded rows already exist with matching appleProductId, sync will update/activate those rows.

2. Manual DB entry (fallback for Apple/Google)
- Use Prisma Studio or SQL to set/update:
  - name, slug, type, isFree, isActive, price, currency, interval, intervalCount
  - appleProductId
  - googleProductId
  - googleBasePlanId
  - googleOfferId

Google catalog sync is now implemented similarly to Apple:
- Startup sync (optional by env)
- Scheduled sync every 6 hours
- Optional deactivation of missing catalog rows

Important:
- The mobile paywall endpoint filters by platform support.
- iOS list requires appleProductId.
- Android list requires googleProductId.

## 6) Mobile App API Usage (Step-by-Step)

### 6.1 Fetch paywall plans

Call:
- GET /api/subscription/plans/mobile?platform=ios
- GET /api/subscription/plans/mobile?platform=android

Use this endpoint for the paywall list in app.

### 6.2 Start backend trial

Call:
- POST /api/subscription/start-trial

Notes:
- Requires auth token.
- User can use trial only once.
- If planId is omitted, backend picks the active trial plan with lowest displayOrder.

### 6.3 Verify purchase after store checkout

Apple:
- POST /api/iap/verify/apple

Google:
- POST /api/iap/verify/google

Expected behavior:
- Endpoint verifies payload with store APIs.
- Endpoint logs event linkage.
- Response includes pending_webhook true.
- Final entitlement activation happens after webhook arrives.

### 6.4 Restore purchase

Call:
- POST /api/iap/restore

Use when user taps Restore Purchases.

Short explanation:
- Restore is used when the user already paid before (new phone, reinstall, re-login) and you need to reconnect store purchase history to backend user entitlement.
- It does not create a new purchase.
- It helps backend re-verify and re-link identifiers so webhook lifecycle updates continue correctly.

### 6.5 Read current IAP status

Call:
- GET /api/iap/subscription/status

Use this endpoint for current paid entitlement view.

### 6.5.1 Read unified entitlement status (recommended for app UI)

Call:
- GET /api/subscription/status

This endpoint returns one merged status for:
- backend trial (provider NONE)
- Apple/Google IAP subscription

Use this endpoint when app needs a single status source for paywall and feature gating.

### 6.6 Cancel flow

Call:
- POST /api/iap/subscription/cancel

Returns store manage URL. Actual cancellation is done by user in Apple/Google UI.

## 7) Webhook Setup (Production)

Do not manually call webhook endpoints in normal production flow.

Normal flow:
1. App verifies purchase (verify endpoint).
2. Apple/Google send server notifications asynchronously.
3. Backend webhook endpoints process event and update entitlement.

Backend webhook endpoints:
- POST /api/iap/webhook/apple
- POST /api/iap/webhook/google

Security requirement:
- Header x-iap-webhook-secret must equal IAP_WEBHOOK_SECRET.

Because Apple/Google cannot directly add this custom header, use a relay service:
1. Store -> relay endpoint.
2. Relay adds x-iap-webhook-secret.
3. Relay forwards payload to backend webhook endpoint.

### 7.1 Where to add Apple webhook

In App Store Connect:
1. Open your app.
2. Go to App Store Server Notifications.
3. Set Server Notifications URL to your relay endpoint (not direct backend), for example:
  - https://relay.yourdomain.com/apple
4. Relay forwards to backend:
  - POST /api/iap/webhook/apple
5. Relay injects header x-iap-webhook-secret.

### 7.2 Where to add Google webhook

In Google Play Console:
1. Configure Real-time developer notifications (RTDN) with a Pub/Sub topic.
2. In Google Cloud Pub/Sub, create a push subscription for that topic.
3. Set push endpoint URL to your relay endpoint, for example:
  - https://relay.yourdomain.com/google
4. Relay forwards to backend:
  - POST /api/iap/webhook/google
5. Relay injects header x-iap-webhook-secret.

## 8) Recommended Event Coverage

Apple notifications:
- SUBSCRIBED
- DID_RENEW
- DID_FAIL_TO_RENEW
- GRACE_PERIOD_EXPIRED
- EXPIRED
- DID_CHANGE_RENEWAL_STATUS
- REFUND
- REVOKE

Google RTDN:
- SUBSCRIPTION_PURCHASED
- SUBSCRIPTION_RENEWED
- SUBSCRIPTION_CANCELED
- SUBSCRIPTION_ON_HOLD
- SUBSCRIPTION_IN_GRACE_PERIOD
- SUBSCRIPTION_RECOVERED
- SUBSCRIPTION_PAUSED
- SUBSCRIPTION_REVOKED
- SUBSCRIPTION_EXPIRED

## 9) End-to-End Validation Checklist

1. Configure env values and restart backend.
2. Run migrations.
3. Run seed and confirm free_trial exists.
4. Ensure paid plans have correct appleProductId/googleProductId mappings.
5. From app, load paywall via GET /api/subscription/plans/mobile.
6. Start trial from app and verify user gets trial subscription row.
7. Complete Apple sandbox purchase and call verify/apple.
8. Complete Google test purchase and call verify/google.
9. Send real webhook events through relay and confirm subscription row updates.
10. Call GET /api/iap/subscription/status and confirm entitlement state.
11. Re-send same eventId and confirm duplicate handling behavior.

## 10) Troubleshooting

401 Invalid IAP webhook secret:
- Relay missing or wrong x-iap-webhook-secret.

Apple verification errors:
- APPLE_BUNDLE_ID mismatch.
- Missing APPLE_ISSUER_ID/APPLE_KEY_ID/APPLE_PRIVATE_KEY.
- Invalid private key formatting (must preserve newline conversion pattern).

Google verification errors:
- Invalid GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH.
- Service account missing Android Publisher permission.
- Package name mismatch with product purchase.

Webhook received but no entitlement update:
- Payload identifiers could not map to user/subscription linkage yet.
- Verify endpoint was not called earlier for that subscription lineage.

## 11) Minimal Smoke Test cURL (Testing Only)

These are for relay/backend testing only, not normal app flow.

```bash
curl -X POST "https://ayni-wellness.com/api/iap/webhook/apple" \
  -H "Content-Type: application/json" \
  -H "x-iap-webhook-secret: YOUR_SECRET" \
  -d '{"eventId":"apple-test-1","eventType":"DID_RENEW","payload":{"test":true}}'
```

```bash
curl -X POST "https://ayni-wellness.com/api/iap/webhook/google" \
  -H "Content-Type: application/json" \
  -H "x-iap-webhook-secret: YOUR_SECRET" \
  -d '{"eventId":"google-test-1","eventType":"SUBSCRIPTION_RENEWED","payload":{"subscriptionNotification":{"subscriptionId":"premium_monthly","purchaseToken":"token","notificationType":2}}}'
```

## 12) Flutter Implementation (App Side)

This section shows the exact endpoints and JSON payloads your Flutter app should call.

Important:
- App calls verify/restore/status/cancel/start-trial/plans endpoints only.
- App should NOT call webhook endpoints.
- Webhook endpoints are for Apple/Google server notifications via relay.

### 12.1 Endpoint map for Flutter

- GET /api/subscription/plans/mobile?platform=ios|android
- POST /api/subscription/start-trial
- POST /api/iap/verify/apple
- POST /api/iap/verify/google
- POST /api/iap/restore
- GET /api/iap/subscription/status
- POST /api/iap/subscription/cancel

### 12.2 JSON payloads required from Flutter

1. Start trial

URL:
- POST /api/subscription/start-trial

Request JSON (planId optional):

```json
{
  "planId": "optional_trial_plan_id"
}
```

2. Verify Apple purchase

URL:
- POST /api/iap/verify/apple

Request JSON (preferred: signedPayload):

```json
{
  "signedPayload": "apple_signed_transaction_jws",
  "productId": "com.yourapp.premium.monthly",
  "eventId": "apple-verify-001",
  "eventType": "client.verify.apple",
  "environment": "SANDBOX"
}
```

Request JSON (fallback via transactionId):

```json
{
  "transactionId": "2000001234567890",
  "productId": "com.yourapp.premium.monthly",
  "eventId": "apple-verify-002",
  "eventType": "client.verify.apple"
}
```

3. Verify Google purchase

URL:
- POST /api/iap/verify/google

Request JSON:

```json
{
  "purchaseToken": "google_purchase_token",
  "productId": "premium_monthly",
  "packageName": "com.yourapp.mobile",
  "basePlanId": "monthly",
  "offerId": "intro_offer",
  "eventId": "google-verify-001",
  "eventType": "client.verify.google"
}
```

4. Restore purchases

Apple restore JSON:

```json
{
  "provider": "APPLE",
  "originalTransactionId": "2000001234567890"
}
```

Google restore JSON:

```json
{
  "provider": "GOOGLE",
  "purchaseToken": "google_purchase_token",
  "productId": "premium_monthly"
}
```

5. Cancel instructions

Apple cancel JSON:

```json
{
  "provider": "APPLE"
}
```

Google cancel JSON:

```json
{
  "provider": "GOOGLE",
  "packageName": "com.yourapp.mobile"
}
```

### 12.3 Flutter service example (Dio)

```dart
import 'package:dio/dio.dart';

class SubscriptionApi {
  SubscriptionApi({
    required this.baseUrl,
    required this.getAccessToken,
  }) {
    _dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 20),
        receiveTimeout: const Duration(seconds: 20),
        headers: {'Content-Type': 'application/json'},
      ),
    );

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await getAccessToken();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
      ),
    );
  }

  final String baseUrl;
  final Future<String?> Function() getAccessToken;
  late final Dio _dio;

  Future<Map<String, dynamic>> getMobilePlans({required String platform}) async {
    final res = await _dio.get(
      '/api/subscription/plans/mobile',
      queryParameters: {'platform': platform}, // ios | android
    );
    return Map<String, dynamic>.from(res.data as Map);
  }

  Future<Map<String, dynamic>> startTrial({String? planId}) async {
    final res = await _dio.post(
      '/api/subscription/start-trial',
      data: planId == null ? {} : {'planId': planId},
    );
    return Map<String, dynamic>.from(res.data as Map);
  }

  Future<Map<String, dynamic>> verifyApple({
    String? signedPayload,
    String? transactionId,
    required String productId,
    String environment = 'PRODUCTION',
  }) async {
    final res = await _dio.post(
      '/api/iap/verify/apple',
      data: {
        if (signedPayload != null) 'signedPayload': signedPayload,
        if (transactionId != null) 'transactionId': transactionId,
        'productId': productId,
        'environment': environment,
        'eventType': 'client.verify.apple',
      },
    );
    return Map<String, dynamic>.from(res.data as Map);
  }

  Future<Map<String, dynamic>> verifyGoogle({
    required String purchaseToken,
    required String productId,
    required String packageName,
    String? basePlanId,
    String? offerId,
  }) async {
    final res = await _dio.post(
      '/api/iap/verify/google',
      data: {
        'purchaseToken': purchaseToken,
        'productId': productId,
        'packageName': packageName,
        if (basePlanId != null) 'basePlanId': basePlanId,
        if (offerId != null) 'offerId': offerId,
        'eventType': 'client.verify.google',
      },
    );
    return Map<String, dynamic>.from(res.data as Map);
  }

  Future<Map<String, dynamic>> restoreApple({required String originalTransactionId}) async {
    final res = await _dio.post(
      '/api/iap/restore',
      data: {
        'provider': 'APPLE',
        'originalTransactionId': originalTransactionId,
      },
    );
    return Map<String, dynamic>.from(res.data as Map);
  }

  Future<Map<String, dynamic>> restoreGoogle({
    required String purchaseToken,
    required String productId,
  }) async {
    final res = await _dio.post(
      '/api/iap/restore',
      data: {
        'provider': 'GOOGLE',
        'purchaseToken': purchaseToken,
        'productId': productId,
      },
    );
    return Map<String, dynamic>.from(res.data as Map);
  }

  Future<Map<String, dynamic>> getIapStatus() async {
    final res = await _dio.get('/api/iap/subscription/status');
    return Map<String, dynamic>.from(res.data as Map);
  }

  Future<Map<String, dynamic>> getCancelInfoApple() async {
    final res = await _dio.post(
      '/api/iap/subscription/cancel',
      data: {'provider': 'APPLE'},
    );
    return Map<String, dynamic>.from(res.data as Map);
  }

  Future<Map<String, dynamic>> getCancelInfoGoogle({required String packageName}) async {
    final res = await _dio.post(
      '/api/iap/subscription/cancel',
      data: {
        'provider': 'GOOGLE',
        'packageName': packageName,
      },
    );
    return Map<String, dynamic>.from(res.data as Map);
  }
}
```

### 12.4 Flutter purchase flow order (recommended)

1. Load paywall plans from GET /api/subscription/plans/mobile?platform=currentPlatform.
2. Execute purchase with store SDK.
3. Immediately call verify endpoint for the store.
4. Show pending state while waiting for webhook-driven entitlement update.
5. Poll GET /api/iap/subscription/status or refresh status on app resume.
6. Unlock premium only when status says active and hasSubscription true.

