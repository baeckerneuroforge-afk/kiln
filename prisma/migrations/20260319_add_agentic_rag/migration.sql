-- AlterTable: Add enableAgenticRag to Agent
ALTER TABLE "Agent" ADD COLUMN "enableAgenticRag" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "ResearchStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "AgentResearchEntry" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sources" JSONB NOT NULL,
    "status" "ResearchStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentResearchEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentResearchEntry_agentId_idx" ON "AgentResearchEntry"("agentId");

-- CreateIndex
CREATE INDEX "AgentResearchEntry_agentId_status_idx" ON "AgentResearchEntry"("agentId", "status");

-- AddForeignKey
ALTER TABLE "AgentResearchEntry" ADD CONSTRAINT "AgentResearchEntry_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
