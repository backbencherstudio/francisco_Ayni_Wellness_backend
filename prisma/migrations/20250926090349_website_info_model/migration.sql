-- CreateTable
CREATE TABLE "website_infos" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "name" TEXT,
    "phone_number" TEXT,
    "email" TEXT,
    "address" TEXT,
    "logo" TEXT,
    "favicon" TEXT,
    "copyright" TEXT,
    "cancellation_policy" TEXT,

    CONSTRAINT "website_infos_pkey" PRIMARY KEY ("id")
);
