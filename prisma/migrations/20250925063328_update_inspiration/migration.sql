-- AlterTable
ALTER TABLE "inspirations" ADD COLUMN     "user_id" TEXT;

-- AddForeignKey
ALTER TABLE "inspirations" ADD CONSTRAINT "inspirations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
