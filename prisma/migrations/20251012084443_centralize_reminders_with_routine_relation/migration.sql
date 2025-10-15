-- AlterTable
ALTER TABLE "reminders" ADD COLUMN     "routine_id" TEXT,
ADD COLUMN     "scheduled_at" TIMESTAMP(3),
ADD COLUMN     "tz" TEXT,
ADD COLUMN     "window" TEXT;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "routines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
