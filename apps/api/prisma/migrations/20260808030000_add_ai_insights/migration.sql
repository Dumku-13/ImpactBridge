-- CreateEnum
CREATE TYPE "AiInsightKind" AS ENUM ('APPLICATION_SUMMARY', 'APPLICATION_REVIEW', 'GRANT_MATCH');

-- CreateTable
CREATE TABLE "AiInsight" (
    "id" TEXT NOT NULL,
    "kind" "AiInsightKind" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiInsight_kind_createdAt_idx" ON "AiInsight"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiInsight_targetType_targetId_kind_key" ON "AiInsight"("targetType", "targetId", "kind");

