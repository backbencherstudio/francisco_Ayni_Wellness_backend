/*
  Warnings:

  - The `type` column on the `users` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "user_type" "UserType" DEFAULT 'Normal',
DROP COLUMN "type",
ADD COLUMN     "type" TEXT DEFAULT 'user';
