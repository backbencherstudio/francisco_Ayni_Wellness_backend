-- AlterTable
ALTER TABLE "routines" ADD COLUMN     "redo_source_id" TEXT;

-- CreateIndex
CREATE INDEX "routines_user_id_redo_source_id_idx" ON "routines"("user_id", "redo_source_id");
