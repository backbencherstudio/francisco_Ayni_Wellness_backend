-- CreateTable
CREATE TABLE "mood_entries" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "user_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "emotions" TEXT[],
    "note" VARCHAR(1000),
    "ai_summary" VARCHAR(300),
    "ai_suggestions" TEXT,
    "ai_model" TEXT,
    "ai_tokens_in" INTEGER,
    "ai_tokens_out" INTEGER,
    "ai_error" TEXT,
    "sentiment_score" DOUBLE PRECISION,
    "energy_score" DOUBLE PRECISION,

    CONSTRAINT "mood_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mood_daily_aggregates" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "count_entries" INTEGER NOT NULL DEFAULT 0,
    "avg_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "min_score" INTEGER NOT NULL DEFAULT 0,
    "max_score" INTEGER NOT NULL DEFAULT 0,
    "emotions_top" TEXT[],
    "last_entry_id" TEXT,

    CONSTRAINT "mood_daily_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mood_entries_user_id_created_at_idx" ON "mood_entries"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "mood_daily_aggregates_user_id_date_idx" ON "mood_daily_aggregates"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "mood_daily_aggregates_user_id_date_key" ON "mood_daily_aggregates"("user_id", "date");

-- AddForeignKey
ALTER TABLE "mood_entries" ADD CONSTRAINT "mood_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mood_daily_aggregates" ADD CONSTRAINT "mood_daily_aggregates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
