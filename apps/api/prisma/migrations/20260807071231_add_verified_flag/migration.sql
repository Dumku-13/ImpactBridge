-- DropIndex
DROP INDEX "Organization_status_idx";

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Organization_status_verified_idx" ON "Organization"("status", "verified");
