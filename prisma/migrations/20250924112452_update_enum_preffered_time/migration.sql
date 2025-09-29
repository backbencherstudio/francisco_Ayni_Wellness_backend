/*
  Warnings:

  - The `frequency` column on the `habits` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `preferred_time` column on the `habits` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('Daily', 'Weekly', 'Weekdays', 'Weekends');

-- CreateEnum
CREATE TYPE "PreferredTime" AS ENUM ('Morning (6-10am)', 'Afternoon (10am-2pm)', 'Evening (2pm-6pm)', 'Night (6pm-10pm)');

-- AlterTable
ALTER TABLE "habits" DROP COLUMN "frequency",
ADD COLUMN     "frequency" "Frequency",
DROP COLUMN "preferred_time",
ADD COLUMN     "preferred_time" "PreferredTime";
