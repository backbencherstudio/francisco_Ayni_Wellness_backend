-- CreateEnum
CREATE TYPE "RoutineStatus" AS ENUM ('generated', 'started', 'completed');

-- CreateEnum
CREATE TYPE "RoutineItemType" AS ENUM ('Meditation', 'Sound healing', 'Journaling', 'Podcast');

-- CreateEnum
CREATE TYPE "RoutineItemStatus" AS ENUM ('pending', 'completed');

-- CreateTable
CREATE TABLE "user_routine_profiles" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    "onboarding_completed_at" TIMESTAMP(3),
    "preferences" JSONB,

    CONSTRAINT "user_routine_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routines" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "RoutineStatus" NOT NULL DEFAULT 'generated',
    "mood_entry_id" TEXT,
    "mood_check_id" TEXT,
    "remind_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "notes" TEXT,
    "profile_snapshot" JSONB,

    CONSTRAINT "routines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine_items" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "routine_id" TEXT NOT NULL,
    "type" "RoutineItemType" NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "gcs_path" TEXT,
    "content_type" TEXT,
    "duration_min" INTEGER,
    "order" INTEGER DEFAULT 0,
    "status" "RoutineItemStatus" NOT NULL DEFAULT 'pending',
    "completed_at" TIMESTAMP(3),
    "journal_text" TEXT,

    CONSTRAINT "routine_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine_mood_checks" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    "rating" INTEGER,
    "emotions" TEXT[],
    "statements" TEXT[],
    "note" VARCHAR(1000),

    CONSTRAINT "routine_mood_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_routine_profiles_user_id_key" ON "user_routine_profiles"("user_id");

-- CreateIndex
CREATE INDEX "routines_user_id_date_idx" ON "routines"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "routines_user_id_date_key" ON "routines"("user_id", "date");

-- CreateIndex
CREATE INDEX "routine_items_routine_id_idx" ON "routine_items"("routine_id");

-- CreateIndex
CREATE INDEX "routine_mood_checks_user_id_created_at_idx" ON "routine_mood_checks"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "user_routine_profiles" ADD CONSTRAINT "user_routine_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routines" ADD CONSTRAINT "routines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routines" ADD CONSTRAINT "routines_mood_check_id_fkey" FOREIGN KEY ("mood_check_id") REFERENCES "routine_mood_checks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_items" ADD CONSTRAINT "routine_items_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "routines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_mood_checks" ADD CONSTRAINT "routine_mood_checks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
