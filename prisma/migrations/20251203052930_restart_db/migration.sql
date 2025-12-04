/*
  Warnings:

  - You are about to drop the column `cancel_at_end` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `canceled_at` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `end_date` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `interval` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `next_billing_date` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `payment_method_brand` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `payment_method_funding` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `payment_method_id` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `payment_method_last4` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `payment_method_type` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `plan_id` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `plan_name` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `start_date` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `subscription_id` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `trial_end` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `trial_start` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `user_payment_method_id` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `brand` on the `user_payment_methods` table. All the data in the column will be lost.
  - You are about to drop the column `exp_month` on the `user_payment_methods` table. All the data in the column will be lost.
  - You are about to drop the column `exp_year` on the `user_payment_methods` table. All the data in the column will be lost.
  - You are about to drop the column `funding` on the `user_payment_methods` table. All the data in the column will be lost.
  - You are about to drop the column `is_default` on the `user_payment_methods` table. All the data in the column will be lost.
  - You are about to drop the column `last4` on the `user_payment_methods` table. All the data in the column will be lost.
  - You are about to drop the column `method_type` on the `user_payment_methods` table. All the data in the column will be lost.
  - Added the required column `planId` to the `subscriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `subscriptions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `subscriptions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Interval" AS ENUM ('MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'PREMIUM_MONTHLY', 'PREMIUM_YEARLY');

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_user_payment_method_id_fkey";

-- DropIndex
DROP INDEX "subscriptions_subscription_id_key";

-- AlterTable
ALTER TABLE "subscriptions" DROP COLUMN "cancel_at_end",
DROP COLUMN "canceled_at",
DROP COLUMN "created_at",
DROP COLUMN "currency",
DROP COLUMN "deleted_at",
DROP COLUMN "description",
DROP COLUMN "end_date",
DROP COLUMN "interval",
DROP COLUMN "next_billing_date",
DROP COLUMN "payment_method_brand",
DROP COLUMN "payment_method_funding",
DROP COLUMN "payment_method_id",
DROP COLUMN "payment_method_last4",
DROP COLUMN "payment_method_type",
DROP COLUMN "plan_id",
DROP COLUMN "plan_name",
DROP COLUMN "price",
DROP COLUMN "start_date",
DROP COLUMN "status",
DROP COLUMN "subscription_id",
DROP COLUMN "trial_end",
DROP COLUMN "trial_start",
DROP COLUMN "updated_at",
DROP COLUMN "user_id",
DROP COLUMN "user_payment_method_id",
ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "planId" TEXT NOT NULL,
ADD COLUMN     "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "stripeSubId" TEXT,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "user_payment_methods" DROP COLUMN "brand",
DROP COLUMN "exp_month",
DROP COLUMN "exp_year",
DROP COLUMN "funding",
DROP COLUMN "is_default",
DROP COLUMN "last4",
DROP COLUMN "method_type";

-- CreateTable
CREATE TABLE "SubsPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "price_description" TEXT,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "price" INTEGER,
    "currency" TEXT,
    "interval" "Interval",
    "intervalCount" INTEGER,
    "stripeProductId" TEXT,
    "stripePriceId" TEXT,
    "trialDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubsPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "status" SMALLINT DEFAULT 1,
    "type" TEXT,
    "brand" TEXT,
    "last4" TEXT,
    "exp_month" INTEGER,
    "exp_year" INTEGER,
    "cardholder_name" TEXT,
    "payment_method_id" TEXT NOT NULL,
    "sort_order" INTEGER DEFAULT 0,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_SubscriptionToUser" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_SubscriptionToUser_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubsPlan_slug_key" ON "SubsPlan"("slug");

-- CreateIndex
CREATE INDEX "_SubscriptionToUser_B_index" ON "_SubscriptionToUser"("B");

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubsPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SubscriptionToUser" ADD CONSTRAINT "_SubscriptionToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SubscriptionToUser" ADD CONSTRAINT "_SubscriptionToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
