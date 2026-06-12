ALTER TABLE "Media"
ADD COLUMN "uploadStatus" VARCHAR(50) DEFAULT 'uploaded',
ADD COLUMN "uploadError" TEXT,
ADD COLUMN "uploadedAt" TIMESTAMP;
