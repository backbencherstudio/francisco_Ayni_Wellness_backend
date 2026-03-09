# IAP Subscription Setup Guide (Apple + Google)

This document describes the complete setup for mobile in-app subscriptions in this backend.

- Backend domain: `https://ayni-wellness.com`
- API prefix: `/api`
- IAP module routes:
  - `POST /api/iap/verify/apple`
  - `POST /api/iap/verify/google`
  - `POST /api/iap/restore`
  - `GET /api/iap/subscription/status`
  - `POST /api/iap/subscription/cancel`
  - `POST /api/iap/webhook/apple`
  - `POST /api/iap/webhook/google`

- Subscription plan catalog routes:
  - `POST /api/subscription/plans/upsert-iap` (admin/operator)
  - `GET /api/subscription/plans/mobile?platform=ios|android|all` (app)

## 1. Overview

### 1.1 Main flow

1. User purchases in Flutter app.
2. App calls verify endpoint (`/iap/verify/apple` or `/iap/verify/google`).
3. Backend verifies with Apple/Google APIs.
4. Backend logs verification context in `store_event_logs` for user mapping.
5. Apple/Google server events arrive via webhook.
6. Backend updates `subscriptions` and `users.IsSubscriptionActive` only from webhook processing.

### 1.2 Why verify + webhook both are needed

- Verify endpoints validate purchase tokens/signatures and create linkage metadata.
- Webhooks keep entitlement in sync for lifecycle changes (renewal, expiration, revocation, refund, pause, grace period).

### 1.3 Source of truth policy

- Subscription DB state and access flags are webhook-authoritative.
- Verify endpoints do not directly activate/deactivate entitlement.
- Access-control should read subscription state produced by webhook updates.

## 2. Required Environment Variables

Set these on production backend (`.env`):

```env
APP_URL=https://ayni-wellness.com

# Security for webhook relay -> backend
IAP_WEBHOOK_SECRET=<strong-random-secret>

# Apple verification
APPLE_BUNDLE_ID=<your_ios_bundle_id>
APPLE_CLIENT_ID=<optional_fallback_same_as_bundle_id>
APPLE_ISSUER_ID=<app_store_connect_issuer_id>
APPLE_KEY_ID=<app_store_connect_api_key_id>
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
APPLE_APP_ID=<optional_app_store_connect_app_id>

# Apple catalog sync (auto-update subs_plans from App Store Connect)
IAP_APPLE_CATALOG_SYNC_ENABLED=1
IAP_APPLE_CATALOG_SYNC_RUN_ON_STARTUP=1
IAP_APPLE_CATALOG_SYNC_DEACTIVATE_MISSING=0

# Google verification
GOOGLE_PLAY_PACKAGE_NAME=<your_android_package_name>
GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH=<absolute_or_deploy_path_to_service_account_json>
```

Generate webhook secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 3. Endpoints and JSON Contracts

## 3.A Apple Catalog Auto Sync (No Admin Dependency)

When enabled, backend syncs subscription products from App Store Connect into `subs_plans` automatically.

- Scheduler: every 6 hours.
- Startup behavior: one sync run on app boot when `IAP_APPLE_CATALOG_SYNC_RUN_ON_STARTUP=1`.
- Source API: App Store Connect API (`/v1/apps`, `/v1/apps/{id}/inAppPurchasesV2`).

### Sync behavior

1. Reads Apple app (`APPLE_APP_ID` or bundle-id lookup via `APPLE_BUNDLE_ID`).
2. Pulls App Store IAP catalog and filters subscription products.
3. Upserts local `subs_plans` by `appleProductId`.
4. Creates missing plans with inferred defaults (name/slug/type/interval/order).
5. Optionally deactivates local Apple-mapped plans missing in Apple list when `IAP_APPLE_CATALOG_SYNC_DEACTIVATE_MISSING=1`.

### Why this helps

- Mobile app no longer depends on manually calling admin catalog APIs after each Apple-side product change.
- `GET /api/subscription/plans/mobile` stays aligned with App Store catalog automatically.

## 3.0 Plan Catalog Management (Apple + Google mapping)

These endpoints replace Stripe-specific plan creation for mobile IAP catalog management.

- URL: `POST https://ayni-wellness.com/api/subscription/plans/upsert-iap`
- Auth: `Bearer <access_token>`
- Purpose: create/update internal plan metadata and store mapping IDs.

Important request field names for this endpoint:

- Use `description` (not `product_description`).
- Use `intervalCount` (not `interval_count`).
- Use enum-style interval values: `MONTH` or `YEAR`.

### Request JSON (create) - Free Trial

```json
{
  "name": "Free Trial",
  "slug": "free_trial",
  "description": "14-day free trial access",
  "price_description": "Free for 14 days",
  "price": 0,
  "currency": "USD",
  "interval": "MONTH",
  "intervalCount": 1,
  "type": "TRIALING",
  "trialDays": 14,
  "displayOrder": 1,
  "isActive": true,
  "isFree": true,
  "appleProductId": "com.ayniwellness.trial",
  "googleProductId": "free_trial",
  "googleBasePlanId": "trial"
}
```

### Request JSON (create) - Premium Monthly

```json
{
  "name": "Premium Monthly",
  "slug": "premium_monthly",
  "description": "Full access to all premium features",
  "price_description": "$19.99 / month",
  "price": 19.99,
  "currency": "USD",
  "interval": "MONTH",
  "intervalCount": 1,
  "type": "PREMIUM",
  "trialDays": 0,
  "displayOrder": 10,
  "isActive": true,
  "isFree": false,
  "appleProductId": "com.wellness.pro.monthly",
  "googleProductId": "premium_monthly",
  "googleBasePlanId": "monthly"
}
```

### Request JSON (create) - Premium Yearly

```json
{
  "name": "Premium Yearly",
  "slug": "premium_yearly",
  "description": "Full access to all premium features (Yearly)",
  "price_description": "$199.99 / year",
  "price": 199.99,
  "currency": "USD",
  "interval": "YEAR",
  "intervalCount": 1,
  "type": "PREMIUM",
  "trialDays": 0,
  "displayOrder": 20,
  "isActive": true,
  "isFree": false,
  "appleProductId": "com.wellness.pro.yearly",
  "googleProductId": "premium_yearly",
  "googleBasePlanId": "yearly"
}
```

### Request JSON (update existing plan)

```json
{
  "id": "<subs_plan_id>",
  "name": "Premium Monthly",
  "slug": "premium_monthly",
  "description": "Full access to all premium features",
  "price_description": "$19.99 / month",
  "price": 19.99,
  "currency": "USD",
  "interval": "MONTH",
  "intervalCount": 1,
  "type": "PREMIUM",
  "trialDays": 0,
  "displayOrder": 10,
  "isActive": true,
  "isFree": false,
  "appleProductId": "com.ayniwellness.premium.monthly",
  "googleProductId": "premium_monthly",
  "googleBasePlanId": "monthly"
}
```

- URL: `GET https://ayni-wellness.com/api/subscription/plans/mobile?platform=ios`
- Auth: `Bearer <access_token>`
- Purpose: app-ready plan list with platform-specific store identifiers.

### Response JSON (example)

```json
{
  "success": true,
  "statusCode": 200,
  "platform": "ios",
  "data": [
    {
      "id": "<subs_plan_id>",
      "name": "Premium Monthly",
      "slug": "premium_monthly",
      "description": "Full access to premium routines",
      "price_description": "Billed monthly",
      "type": "BASIC",
      "isFree": false,
      "isActive": true,
      "displayOrder": 10,
      "trialDays": 7,
      "pricing": {
        "price": "9.99",
        "currency": "USD",
        "interval": "MONTH",
        "intervalCount": 1
      },
      "store_mapping": {
        "apple": {
          "productId": "com.ayniwellness.premium.monthly"
        },
        "google": {
          "productId": "premium_monthly",
          "basePlanId": "monthly",
          "offerId": "intro_7d"
        }
      },
      "supported_platforms": {
        "ios": true,
        "android": true
      }
    }
  ]
}
```

## 3.1 Verify Apple Purchase

- URL: `POST https://ayni-wellness.com/api/iap/verify/apple`
- Auth: `Bearer <access_token>`
- Purpose: verify Apple purchase and upsert entitlement.

### Request JSON (preferred)

```json
{
  "signedPayload": "<apple_signed_transaction_jws>",
  "signedRenewalInfo": "<optional_signed_renewal_info_jws>",
  "productId": "com.ayniwellness.premium.monthly",
  "planId": "<optional_local_subsplan_id>",
  "eventId": "apple-client-verify-001",
  "eventType": "client.verify.apple",
  "environment": "SANDBOX"

}
```

### Request JSON (fallback via transactionId)

```json
{
  "transactionId": "2000001234567890",
  "productId": "com.ayniwellness.premium.monthly",
  "planId": "<optional_local_subsplan_id>",
  "eventId": "apple-client-verify-002"
}
```

### Example Response JSON

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Apple IAP payload verified. Entitlement update will be applied via webhook.",
  "duplicate_event": false,
  "pending_webhook": true,
  "data": {
    "event_id": "apple-client-verify-001",
    "event_log_status": "received",
    "entitlement": {
      "provider": "APPLE",
      "unifiedStatus": "active",
      "isActive": true,
      "storeProductId": "com.ayniwellness.premium.monthly"
    }
  }
}
```

## 3.2 Verify Google Purchase

- URL: `POST https://ayni-wellness.com/api/iap/verify/google`
- Auth: `Bearer <access_token>`
- Purpose: verify Google subscription purchase token and upsert entitlement.

### Request JSON

```json
{
  "purchaseToken": "<google_purchase_token>",
  "productId": "premium_monthly",
  "packageName": "com.ayniwellness.app",
  "basePlanId": "monthly",
  "offerId": "intro_offer",
  "planId": "<optional_local_subsplan_id>",
  "eventId": "google-client-verify-001",
  "eventType": "client.verify.google"
}
```

### Example Response JSON

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Google IAP payload verified. Entitlement update will be applied via webhook.",
  "duplicate_event": false,
  "pending_webhook": true,
  "data": {
    "event_id": "google-client-verify-001",
    "event_log_status": "received",
    "entitlement": {
      "provider": "GOOGLE",
      "unifiedStatus": "active",
      "isActive": true,
      "storeProductId": "premium_monthly"
    }
  }
}
```

## 3.3 Restore Entitlement

- URL: `POST https://ayni-wellness.com/api/iap/restore`
- Auth: `Bearer <access_token>`
- Purpose: recover entitlement from store identifiers or latest local snapshot.

### Request JSON (Apple)

```json
{
  "provider": "APPLE",
  "originalTransactionId": "2000001234567890"
}
```

### Request JSON (Google)

```json
{
  "provider": "GOOGLE",
  "purchaseToken": "<google_purchase_token>",
  "productId": "premium_monthly"
}
```

## 3.4 Apple Webhook (Relay -> Backend)

- URL: `POST https://ayni-wellness.com/api/iap/webhook/apple`
- Header required: `x-iap-webhook-secret: <IAP_WEBHOOK_SECRET>`
- Purpose: ingest Apple server notifications and update DB when mapping is found.

### Request JSON (relay format)

```json
{
  "signedPayload": "<apple_server_notification_signed_payload>",
  "eventId": "apple-notif-uuid-001",
  "eventType": "DID_RENEW"
}
```

## 3.5 Google Webhook (Relay -> Backend)

- URL: `POST https://ayni-wellness.com/api/iap/webhook/google`
- Header required: `x-iap-webhook-secret: <IAP_WEBHOOK_SECRET>`
- Purpose: ingest RTDN relay payload, verify token with Google API, update DB when mapping is found.

### Request JSON (relay format)

```json
{
  "eventId": "google-rtdn-001",
  "eventType": "SUBSCRIPTION_RENEWED",
  "payload": {
    "subscriptionNotification": {
      "subscriptionId": "premium_monthly",
      "purchaseToken": "<google_purchase_token>",
      "notificationType": 2
    }
  }
}
```

## 3.6 Get Current IAP Subscription Status

- URL: `GET https://ayni-wellness.com/api/iap/subscription/status`
- Auth: `Bearer <access_token>`
- Purpose: get current Apple/Google subscription snapshot for logged-in user.

### Example Response JSON

```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "hasSubscription": true,
    "id": "sub_...",
    "provider": "APPLE",
    "status": "active",
    "isActive": true,
    "cancelAtPeriodEnd": false,
    "startDate": "2026-03-01T00:00:00.000Z",
    "endDate": "2026-04-01T00:00:00.000Z",
    "plan": {
      "id": "plan_...",
      "name": "Premium Monthly",
      "slug": "premium_monthly",
      "type": "PREMIUM"
    }
  }
}
```

## 3.7 Cancel Subscription (Store Redirect / Instructions)

- URL: `POST https://ayni-wellness.com/api/iap/subscription/cancel`
- Auth: `Bearer <access_token>`
- Purpose: return provider-specific cancel URL and cancellation guidance.
- Note: actual cancellation must be completed in Apple/Google store UI.

### Request JSON (Apple)

```json
{
  "provider": "APPLE"
}
```

### Request JSON (Google)

```json
{
  "provider": "GOOGLE",
  "packageName": "com.ayniwellness.app"
}
```

### Example Response JSON

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Cancel must be completed in the app store. Subscription access will be updated after webhook events are processed.",
  "data": {
    "provider": "GOOGLE",
    "manageUrl": "https://play.google.com/store/account/subscriptions?package=com.ayniwellness.app",
    "actionRequired": true,
    "sourceOfTruth": "webhook",
    "currentSubscription": {
      "id": "sub_...",
      "status": "active",
      "isActive": true,
      "cancelAtPeriodEnd": true,
      "endDate": "2026-04-01T00:00:00.000Z",
      "storeProductId": "premium_monthly",
      "planName": "Premium Monthly"
    }
  }
}
```

## 4. Webhook Destination URL Setup

Important: Apple/Google do not automatically send custom header `x-iap-webhook-secret`.

Because backend requires this header, use a relay:

1. Apple/Google send to relay endpoint.
2. Relay forwards to backend webhook endpoint.
3. Relay injects `x-iap-webhook-secret`.

### 4.1 Apple destination

In App Store Connect, set App Store Server Notifications URL to relay, for example:

- `https://relay.ayni-wellness.com/apple`

Relay forwards to:

- `https://ayni-wellness.com/api/iap/webhook/apple`

### 4.2 Google destination

In Google Play Console RTDN:

1. Configure Pub/Sub topic.
2. Create push subscriber to relay endpoint, for example:
- `https://relay.ayni-wellness.com/google`

Relay forwards to:

- `https://ayni-wellness.com/api/iap/webhook/google`

## 5. Events to Enable

## 5.1 Apple events (recommended)

- `SUBSCRIBED`
- `DID_RENEW`
- `DID_FAIL_TO_RENEW`
- `GRACE_PERIOD_EXPIRED`
- `EXPIRED`
- `DID_CHANGE_RENEWAL_STATUS`
- `DID_CHANGE_RENEWAL_PREF`
- `REFUND`
- `REVOKE`
- `OFFER_REDEEMED` (if offers are used)

## 5.2 Google events (recommended RTDN types)

- `SUBSCRIPTION_PURCHASED`
- `SUBSCRIPTION_RENEWED`
- `SUBSCRIPTION_CANCELED`
- `SUBSCRIPTION_ON_HOLD`
- `SUBSCRIPTION_IN_GRACE_PERIOD`
- `SUBSCRIPTION_RECOVERED`
- `SUBSCRIPTION_PAUSED`
- `SUBSCRIPTION_REVOKED`
- `SUBSCRIPTION_EXPIRED`

## 6. Subscription Data Behavior

### 6.1 Tables involved

- `subscriptions`: active entitlement snapshot.
- `store_event_logs`: raw event log with idempotency (`provider + eventId`).
- `users.IsSubscriptionActive`: mirror flag for quick checks.

### 6.2 Update behavior

1. Verify endpoint validates purchase and logs linkage metadata (no entitlement upsert).
2. Webhook endpoint always logs event.
3. Webhook endpoint is the only path that updates subscription/access state.
4. Webhook updates subscription only if it can map payload identifiers to an existing user/subscription/linkage event.

### 6.3 Identifier mapping

- Apple: original transaction lineage and subscription identifiers.
- Google: purchase token and provider-derived identifiers.

## 7. Full End-to-End Testing Checklist

1. Ensure `subs_plans` has at least one paid plan.
2. Start backend and verify `/api/docs` contains `iap` routes.
3. Perform Apple sandbox purchase in app.
4. Call `/api/iap/verify/apple` from app with signed payload or transaction id.
5. Confirm DB updates in `subscriptions` and `store_event_logs`.
6. Perform Google test-track purchase.
7. Call `/api/iap/verify/google` with purchase token + product id.
8. Confirm DB updates.
9. Send webhook test events through relay with correct header.
10. Replay same `eventId` and confirm idempotency (`duplicate_event: true`).
11. Validate protected feature access with updated subscription state.

## 8. Common Failure Cases

1. `401 Invalid IAP webhook secret`
- Relay missing/incorrect `x-iap-webhook-secret`.

2. Apple verification fails
- Missing `APPLE_BUNDLE_ID`/`APPLE_CLIENT_ID` mismatch.
- Missing or malformed App Store API credentials.

3. Google verification fails
- `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH` invalid.
- Service account lacks Android Publisher permission.
- Package name mismatch.

4. Webhook logged but subscription not updated
- Event could not be mapped to an existing user linkage yet.

## 9. Operational Recommendations

1. Keep webhook relay and backend clocks in sync (NTP).
2. Store relay logs for troubleshooting delivery issues.
3. Alert on repeated webhook verification failures.
4. Monitor `store_event_logs.status` for stuck events.
5. Use idempotent `eventId` from source where available.

## 10. Minimal cURL Smoke Tests

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
