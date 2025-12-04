-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "kwik_contact_id" VARCHAR(255),
ADD COLUMN     "kwik_contact_name" VARCHAR(255);

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "restricted" BOOLEAN DEFAULT false,
ADD COLUMN     "restricted_group" VARCHAR(500),
ADD COLUMN     "restricted_word" VARCHAR(500),
ADD COLUMN     "transcription" VARCHAR(5000),
ADD COLUMN     "transcription_error" VARCHAR(5000),
ADD COLUMN     "transcription_status" VARCHAR(100);

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "ignoreList" TEXT[],
ADD COLUMN     "initialConnection" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "mediaTypes" TEXT[],
ADD COLUMN     "totalSize" INTEGER DEFAULT 0;
