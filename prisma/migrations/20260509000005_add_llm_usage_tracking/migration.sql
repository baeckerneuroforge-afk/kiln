-- Central LLM usage tracking and per-worker model controls.
-- Idempotent for production hotfix safety.

ALTER TYPE "ModelProvider" ADD VALUE IF NOT EXISTS 'MISTRAL';

CREATE TABLE IF NOT EXISTS "LlmUsage" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "workerId" TEXT,
  "departmentId" TEXT,
  "modelId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "inputTokens" INTEGER NOT NULL,
  "outputTokens" INTEGER NOT NULL,
  "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
  "costUsd" DECIMAL(10,6) NOT NULL DEFAULT 0,
  "costSavedUsd" DECIMAL(10,6) NOT NULL DEFAULT 0,
  "routingReason" TEXT,
  "cacheHit" BOOLEAN NOT NULL DEFAULT false,
  "byokActive" BOOLEAN NOT NULL DEFAULT false,
  "validationAttempts" INTEGER NOT NULL DEFAULT 1,
  "durationMs" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LlmUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LlmUsage_orgId_createdAt_idx" ON "LlmUsage"("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "LlmUsage_orgId_modelId_idx" ON "LlmUsage"("orgId", "modelId");
CREATE INDEX IF NOT EXISTS "LlmUsage_departmentId_createdAt_idx" ON "LlmUsage"("departmentId", "createdAt");

ALTER TABLE "DepartmentWorker" ADD COLUMN IF NOT EXISTS "preferredModelTier" TEXT;
ALTER TABLE "DepartmentWorker" ADD COLUMN IF NOT EXISTS "preferredProvider" TEXT;
ALTER TABLE "DepartmentWorker" ADD COLUMN IF NOT EXISTS "customModelId" TEXT;
ALTER TABLE "DepartmentWorker" ADD COLUMN IF NOT EXISTS "enableCitationCheck" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DepartmentWorker" ADD COLUMN IF NOT EXISTS "outputSchema" JSONB;
