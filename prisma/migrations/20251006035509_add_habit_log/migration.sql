/*
  Warnings:

  - You are about to drop the column `deleted_at` on the `moods` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `reminders` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `roles` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `ucodes` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "moods" DROP COLUMN "deleted_at";

-- AlterTable
ALTER TABLE "reminders" DROP COLUMN "status";

-- AlterTable
ALTER TABLE "roles" DROP COLUMN "deleted_at";

-- AlterTable
ALTER TABLE "ucodes" DROP COLUMN "status";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "deleted_at",
DROP COLUMN "status";

-- CreateTable
CREATE TABLE "habit_logs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    "habit_id" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration_minutes" INTEGER,
    "note" VARCHAR(500),

    CONSTRAINT "habit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "habit_logs_user_id_day_idx" ON "habit_logs"("user_id", "day");

-- CreateIndex
CREATE INDEX "habit_logs_habit_id_day_idx" ON "habit_logs"("habit_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "habit_logs_habit_id_day_key" ON "habit_logs"("habit_id", "day");

-- AddForeignKey
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_habit_id_fkey" FOREIGN KEY ("habit_id") REFERENCES "habits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
