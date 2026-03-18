-- CreateEnum
CREATE TYPE "TestComparisonWinner" AS ENUM ('A', 'B', 'SAME');

-- AlterTable
ALTER TABLE "Agent"
ADD COLUMN "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7;

-- CreateTable
CREATE TABLE "TestComparison" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "responseA" TEXT NOT NULL,
    "responseB" TEXT NOT NULL,
    "configA" JSONB NOT NULL,
    "configB" JSONB NOT NULL,
    "winner" "TestComparisonWinner",
    "responseTimeA" INTEGER,
    "responseTimeB" INTEGER,
    "tokenCountA" INTEGER,
    "tokenCountB" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestComparison_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TestComparison_agentId_createdAt_idx" ON "TestComparison"("agentId", "createdAt");

-- AddForeignKey
ALTER TABLE "TestComparison" ADD CONSTRAINT "TestComparison_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
