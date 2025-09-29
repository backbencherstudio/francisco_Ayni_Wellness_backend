/*
  Warnings:

  - You are about to drop the `social_medias` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `website_infos` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "next_billing_date" TIMESTAMP(3),
ADD COLUMN     "payment_method_brand" TEXT,
ADD COLUMN     "payment_method_funding" TEXT,
ADD COLUMN     "payment_method_id" TEXT,
ADD COLUMN     "payment_method_last4" TEXT,
ADD COLUMN     "payment_method_type" TEXT,
ADD COLUMN     "user_payment_method_id" TEXT;

-- AlterTable
ALTER TABLE "user_payment_methods" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "exp_month" INTEGER,
ADD COLUMN     "exp_year" INTEGER,
ADD COLUMN     "funding" TEXT,
ADD COLUMN     "is_default" BOOLEAN DEFAULT false,
ADD COLUMN     "last4" TEXT,
ADD COLUMN     "method_type" TEXT;

-- DropTable
DROP TABLE "social_medias";

-- DropTable
DROP TABLE "website_infos";

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_payment_method_id_fkey" FOREIGN KEY ("user_payment_method_id") REFERENCES "user_payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
