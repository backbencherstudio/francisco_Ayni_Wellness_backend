-- AlterTable
ALTER TABLE "SubsPlan"
ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "appleProductId" TEXT,
ADD COLUMN "googleProductId" TEXT,
ADD COLUMN "googleBasePlanId" TEXT,
ADD COLUMN "googleOfferId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SubsPlan_appleProductId_key" ON "SubsPlan"("appleProductId");

-- CreateIndex
CREATE INDEX "SubsPlan_isActive_displayOrder_idx" ON "SubsPlan"("isActive", "displayOrder");

-- CreateIndex
CREATE INDEX "SubsPlan_googleProductId_googleBasePlanId_googleOfferId_idx" ON "SubsPlan"("googleProductId", "googleBasePlanId", "googleOfferId");
