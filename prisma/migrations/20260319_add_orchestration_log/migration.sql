-- CreateTable
CREATE TABLE "OrchestrationLog" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "decision" JSONB NOT NULL,
    "outcome" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrchestrationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrchestrationLog_teamId_idx" ON "OrchestrationLog"("teamId");

-- CreateIndex
CREATE INDEX "OrchestrationLog_executionId_idx" ON "OrchestrationLog"("executionId");

-- CreateIndex
CREATE INDEX "OrchestrationLog_eventType_idx" ON "OrchestrationLog"("eventType");

-- CreateIndex
CREATE INDEX "OrchestrationLog_createdAt_idx" ON "OrchestrationLog"("createdAt");

-- CreateIndex
CREATE INDEX "OrchestrationLog_teamId_createdAt_idx" ON "OrchestrationLog"("teamId", "createdAt");
