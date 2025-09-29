/*
  Warnings:

  - You are about to drop the column `category` on the `inspirations` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "InspirationKeyword" AS ENUM ('Peace', 'Love', 'Mindfulness', 'Gratitude');

-- AlterTable
ALTER TABLE "inspirations" DROP COLUMN "category",
ADD COLUMN     "keyword" "InspirationKeyword";

-- DropEnum
DROP TYPE "InspirationCategory";
