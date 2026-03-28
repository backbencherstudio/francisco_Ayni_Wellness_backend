# Apple App Store Connect API Keys Setup (Step-by-Step)

Use this guide to generate the correct Apple credentials for backend App Store Connect API access (catalog sync and server verification helpers).

## 1) Open App Store Connect

1. Go to https://appstoreconnect.apple.com
2. Sign in with an account that has permission to manage API keys.

## 2) Create the correct API key type

1. Open Users and Access.
2. Open the Integrations tab.
3. Open App Store Connect API.
4. Click Generate API Key (or Create API Key).
5. Enter a key name (example: ayni-backend-catalog-sync).
6. Assign role:
   - App Manager (recommended), or
   - Admin
7. If app access scoping is shown, include the app for bundle id com.ayniwellness.ayniwellness.
8. Create the key.

Important:
- This must be an App Store Connect API key.
- Do not use Sign in with Apple keys here.

## 3) Download and store key material safely

1. Download the .p8 private key file.
2. Save it in a secure secret manager.
3. Copy these values from App Store Connect:
   - Key ID
   - Issuer ID

Important:
- The .p8 file is only downloadable once.
- Rotate key immediately if it was exposed in logs/chat.

## 4) Update backend .env values

Set these values:

APPLE_BUNDLE_ID=com.ayniwellness.ayniwellness
APPLE_APP_ID=6759598419
APPLE_ISSUER_ID=<issuer-id-from-app-store-connect>
APPLE_KEY_ID=<key-id-from-app-store-connect>
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

Formatting rules for APPLE_PRIVATE_KEY:

1. Keep it as a single line in .env.
2. Wrap it in double quotes.
3. Replace line breaks with literal \n.
4. Include BEGIN/END markers.

Example shape:

APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIGT...\n-----END PRIVATE KEY-----"

## 5) Restart backend

1. Stop current backend process.
2. Start backend again so new env values are loaded.

## 6) Validate credentials quickly

Run this from project root:

node -e "require('dotenv').config(); const { importPKCS8, SignJWT } = require('jose'); (async () => { const keyId=process.env.APPLE_KEY_ID; const issuerId=process.env.APPLE_ISSUER_ID; const bundle=process.env.APPLE_BUNDLE_ID || process.env.APPLE_CLIENT_ID; const raw=process.env.APPLE_PRIVATE_KEY||''; const pk=raw.replace(/\\n/g,'\n'); const k=await importPKCS8(pk,'ES256'); const now=Math.floor(Date.now()/1000); const token=await new SignJWT({}).setProtectedHeader({alg:'ES256',kid:keyId,typ:'JWT'}).setIssuer(issuerId).setAudience('appstoreconnect-v1').setIssuedAt(now).setExpirationTime(now+600).sign(k); const url='https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]='+encodeURIComponent(bundle)+'&limit=1'; const res=await fetch(url,{headers:{Authorization:'Bearer '+token}}); const text=await res.text(); console.log('status=',res.status); console.log(text.slice(0,350)); })().catch(e=>{ console.error('ERR', e.message); process.exit(1); });"

Expected result:
- status=200 (or non-401)

If status=401 NOT_AUTHORIZED, check:

1. APPLE_KEY_ID and APPLE_PRIVATE_KEY are from the same key.
2. APPLE_ISSUER_ID belongs to the same App Store Connect account as the key.
3. Key is active and not revoked.
4. Account role has permission for the target app.

## 7) Temporary safe fallback

If setup is not complete yet, disable Apple catalog sync temporarily:

IAP_APPLE_CATALOG_SYNC_ENABLED=0

Re-enable after credentials validate.

## 8) Security checklist

1. Never commit APPLE_PRIVATE_KEY to git.
2. Keep .env in secure server storage only.
3. Rotate API key immediately if exposed.
4. Limit key role/app scope where possible.
