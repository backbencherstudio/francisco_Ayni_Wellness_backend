-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "is_on_trial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_trial_used" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trialStartsAt" TIMESTAMP(3);
