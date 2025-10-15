/*
  Warnings:

  - The values [Gratitude,Breathing,Movement,Reading] on the enum `HabitCategory` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "HabitCategory_new" AS ENUM ('Meditation', 'Sound healing', 'Journaling', 'Podcast');
ALTER TABLE "habits" ALTER COLUMN "category" TYPE "HabitCategory_new" USING ("category"::text::"HabitCategory_new");
ALTER TYPE "HabitCategory" RENAME TO "HabitCategory_old";
ALTER TYPE "HabitCategory_new" RENAME TO "HabitCategory";
DROP TYPE "HabitCategory_old";
COMMIT;
