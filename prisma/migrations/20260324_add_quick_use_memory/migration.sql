-- CreateTable
CREATE TABLE "QuickUseMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "inputSummary" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "keyData" JSONB NOT NULL,
    "keywords" TEXT[],
    "result" JSONB,
    "workspaceFiles" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickUseMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuickUseMemory_taskId_key" ON "QuickUseMemory"("taskId");

-- CreateIndex
CREATE INDEX "QuickUseMemory_userId_createdAt_idx" ON "QuickUseMemory"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "QuickUseMemory_userId_expiresAt_idx" ON "QuickUseMemory"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "QuickUseMemory_keywords_gin_idx" ON "QuickUseMemory" USING GIN ("keywords");

-- AddForeignKey
ALTER TABLE "QuickUseMemory" ADD CONSTRAINT "QuickUseMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickUseMemory" ADD CONSTRAINT "QuickUseMemory_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "QuickUseTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
