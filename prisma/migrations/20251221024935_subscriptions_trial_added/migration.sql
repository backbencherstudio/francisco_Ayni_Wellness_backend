/*
  Warnings:

  - The values [PREMIUM_MONTHLY,PREMIUM_YEARLY] on the enum `SubscriptionPlan` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `is_on_trial` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `is_trial_used` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `trialStartsAt` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the `_SubscriptionToUser` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `type` to the `subscriptions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "SubscriptionPlan_new" AS ENUM ('FREE', 'TRIALING', 'BASIC', 'PREMIUM');

-- Rename types
ALTER TYPE "SubscriptionPlan" RENAME TO "SubscriptionPlan_old";
ALTER TYPE "SubscriptionPlan_new" RENAME TO "SubscriptionPlan";

-- Update column if exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'SubsPlan' AND column_name = 'type') THEN
        ALTER TABLE "SubsPlan" ALTER COLUMN "type" TYPE "SubscriptionPlan" USING (
            CASE
                WHEN "type"::text = 'PREMIUM_MONTHLY' THEN 'PREMIUM'::"SubscriptionPlan"
                WHEN "type"::text = 'PREMIUM_YEARLY' THEN 'PREMIUM'::"SubscriptionPlan"
                ELSE 'FREE'::"SubscriptionPlan"
            END
        );
    END IF;
END $$;

-- Drop old type
DROP TYPE "SubscriptionPlan_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "_SubscriptionToUser" DROP CONSTRAINT IF EXISTS "_SubscriptionToUser_A_fkey";
ALTER TABLE "_SubscriptionToUser" DROP CONSTRAINT IF EXISTS "_SubscriptionToUser_B_fkey";

-- AlterTable SubsPlan
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'SubsPlan' AND column_name = 'type') THEN
        ALTER TABLE "SubsPlan" ADD COLUMN "type" "SubscriptionPlan" NOT NULL DEFAULT 'FREE';
    END IF;
END $$;

ALTER TABLE "SubsPlan" ALTER COLUMN "price" DROP NOT NULL;

-- AlterTable subscriptions
ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "is_on_trial",
DROP COLUMN IF EXISTS "is_trial_used",
DROP COLUMN IF EXISTS "trialStartsAt",
ADD COLUMN IF NOT EXISTS "isTrial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "remainingDays" INTEGER,
ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'FREE';

-- AlterTable users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscriptionId" TEXT;

-- DropTable
DROP TABLE IF EXISTS "_SubscriptionToUser";

-- AddForeignKey
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_subscriptionId_fkey";
ALTER TABLE "users" ADD CONSTRAINT "users_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
