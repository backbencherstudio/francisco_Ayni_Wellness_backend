/*
  Warnings:

  - The `type` column on the `users` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('Premium', 'Trial', 'Normal');

-- CreateEnum
CREATE TYPE "HabitCategory" AS ENUM ('Meditation', 'Gratitude', 'Breathing', 'Journaling', 'Movement', 'Reading');

-- CreateEnum
CREATE TYPE "Emotions" AS ENUM ('Peaceful', 'Grateful', 'Energetic', 'Focused', 'Calm', 'Hopeful', 'Anxious', 'Tired', 'Stressed', 'OverWhelmed', 'Sad', 'Frustrated', 'Excited', 'Creative', 'Motivated', 'Relexed', 'Inspired', 'Content', 'Happy', 'Angry', 'Lonely');

-- CreateEnum
CREATE TYPE "InspirationCategory" AS ENUM ('Peace', 'Love', 'Mindfulness', 'Gratitude');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "IsSubscriptionActive" BOOLEAN DEFAULT false,
DROP COLUMN "type",
ADD COLUMN     "type" "UserType" DEFAULT 'Normal';

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "user_id" TEXT,
    "plan_name" TEXT,
    "description" TEXT,
    "plan_id" TEXT,
    "price" DECIMAL(65,30),
    "currency" TEXT,
    "interval" TEXT,
    "status" TEXT DEFAULT 'active',
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "cancel_at_end" BOOLEAN DEFAULT false,
    "canceled_at" TIMESTAMP(3),
    "trial_start" TIMESTAMP(3),
    "trial_end" TIMESTAMP(3),
    "subscription_id" TEXT,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habits" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "status" SMALLINT DEFAULT 1,
    "habit_name" TEXT,
    "description" TEXT,
    "category" "HabitCategory",
    "frequency" TEXT,
    "preferred_time" TEXT,
    "reminder_time" TEXT,
    "duration" INTEGER,
    "user_id" TEXT,

    CONSTRAINT "habits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moods" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "status" SMALLINT DEFAULT 1,
    "mood" TEXT,
    "note" TEXT,
    "rate_overall_mood" INTEGER DEFAULT 0,
    "emotion" "Emotions",
    "Additional_thoughts" TEXT,
    "user_id" TEXT,
    "statistics_id" TEXT,

    CONSTRAINT "moods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statistics" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "user_id" TEXT,
    "date" TIMESTAMP(3),
    "mood_count" INTEGER DEFAULT 0,
    "current_streak" INTEGER DEFAULT 0,
    "completion_rate" DOUBLE PRECISION DEFAULT 0.0,
    "total_time_spent" INTEGER DEFAULT 0,
    "average_mood" DOUBLE PRECISION DEFAULT 0.0,
    "achievements" JSONB[] DEFAULT ARRAY[]::JSONB[],

    CONSTRAINT "statistics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspirations" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "status" SMALLINT DEFAULT 1,
    "quote" TEXT,
    "author" TEXT,
    "category" "InspirationCategory",

    CONSTRAINT "inspirations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_HabitStatistics" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_HabitStatistics_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_HabitStatistics_B_index" ON "_HabitStatistics"("B");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moods" ADD CONSTRAINT "moods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moods" ADD CONSTRAINT "moods_statistics_id_fkey" FOREIGN KEY ("statistics_id") REFERENCES "statistics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statistics" ADD CONSTRAINT "statistics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_HabitStatistics" ADD CONSTRAINT "_HabitStatistics_A_fkey" FOREIGN KEY ("A") REFERENCES "habits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_HabitStatistics" ADD CONSTRAINT "_HabitStatistics_B_fkey" FOREIGN KEY ("B") REFERENCES "statistics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
