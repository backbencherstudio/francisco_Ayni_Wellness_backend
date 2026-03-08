-- CreateEnum
CREATE TYPE "BillingProvider" AS ENUM ('NONE', 'STRIPE', 'APPLE', 'GOOGLE');

-- CreateEnum
CREATE TYPE "StoreEnvironment" AS ENUM ('UNKNOWN', 'SANDBOX', 'PRODUCTION');

-- AlterTable
ALTER TABLE "subscriptions"
ADD COLUMN "provider" "BillingProvider" NOT NULL DEFAULT 'NONE',
ADD COLUMN "storeProductId" TEXT,
ADD COLUMN "storeBasePlanId" TEXT,
ADD COLUMN "storeOfferId" TEXT,
ADD COLUMN "externalSubscriptionId" TEXT,
ADD COLUMN "purchaseToken" TEXT,
ADD COLUMN "originalTransactionId" TEXT,
ADD COLUMN "environment" "StoreEnvironment" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "latestReceiptPayloadHash" TEXT,
ADD COLUMN "gracePeriodEndsAt" TIMESTAMP(3),
ADD COLUMN "pausedAt" TIMESTAMP(3),
ADD COLUMN "revokedAt" TIMESTAMP(3),
ADD COLUMN "lastEventAt" TIMESTAMP(3),
ADD COLUMN "lastEventType" TEXT,
ADD COLUMN "lastEventId" TEXT;

-- CreateTable
CREATE TABLE "store_event_logs" (
    "id" TEXT NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT,
    "environment" "StoreEnvironment" NOT NULL DEFAULT 'UNKNOWN',
    "externalSubscriptionId" TEXT,
    "userId" TEXT,
    "subscriptionId" TEXT,
    "payload" JSONB,
    "status" TEXT DEFAULT 'received',
    "error" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_purchaseToken_key" ON "subscriptions"("purchaseToken");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_originalTransactionId_key" ON "subscriptions"("originalTransactionId");

-- CreateIndex
CREATE INDEX "subscriptions_provider_externalSubscriptionId_idx" ON "subscriptions"("provider", "externalSubscriptionId");

-- CreateIndex
CREATE INDEX "subscriptions_provider_purchaseToken_idx" ON "subscriptions"("provider", "purchaseToken");

-- CreateIndex
CREATE INDEX "subscriptions_provider_originalTransactionId_idx" ON "subscriptions"("provider", "originalTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "store_event_logs_provider_eventId_key" ON "store_event_logs"("provider", "eventId");

-- CreateIndex
CREATE INDEX "store_event_logs_provider_externalSubscriptionId_idx" ON "store_event_logs"("provider", "externalSubscriptionId");

-- CreateIndex
CREATE INDEX "store_event_logs_subscriptionId_idx" ON "store_event_logs"("subscriptionId");

-- CreateIndex
CREATE INDEX "store_event_logs_userId_idx" ON "store_event_logs"("userId");

-- AddForeignKey
ALTER TABLE "store_event_logs" ADD CONSTRAINT "store_event_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_event_logs" ADD CONSTRAINT "store_event_logs_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
