-- Departments Engine Phase 1
-- Idempotent guards are intentional because production is applied manually via Supabase SQL Editor.

ALTER TYPE "TriggerType" ADD VALUE IF NOT EXISTS 'FOLLOWUP';

DO $$ BEGIN
  CREATE TYPE "DepartmentType" AS ENUM (
    'CUSTOMER_SUPPORT',
    'SALES_OUTREACH',
    'LEAD_QUALIFICATION',
    'CONTENT_PRODUCTION',
    'RESEARCH',
    'CUSTOM'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DepartmentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ApprovalMode" AS ENUM ('APPROVAL_FIRST', 'AUTO', 'OFF');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BacklogStatus" AS ENUM ('PENDING', 'CLAIMED', 'RUNNING', 'NEEDS_APPROVAL', 'DONE', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Department" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "orgId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" "DepartmentType" NOT NULL DEFAULT 'CUSTOMER_SUPPORT',
  "status" "DepartmentStatus" NOT NULL DEFAULT 'DRAFT',
  "managerAgentId" TEXT,
  "managerSystemPrompt" TEXT,
  "managerModel" TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  "approvalMode" "ApprovalMode" NOT NULL DEFAULT 'APPROVAL_FIRST',
  "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
  "scheduleCron" TEXT,
  "webhookEnabled" BOOLEAN NOT NULL DEFAULT true,
  "webhookSecret" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "operatingMemory" JSONB NOT NULL DEFAULT '{}',
  "totalTasks" INTEGER NOT NULL DEFAULT 0,
  "totalApprovals" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DepartmentWorker" (
  "id" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "description" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "DepartmentWorker_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DepartmentBacklogItem" (
  "id" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "triggerType" "TriggerType" NOT NULL,
  "triggerPayload" JSONB NOT NULL,
  "status" "BacklogStatus" NOT NULL DEFAULT 'PENDING',
  "claimedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "result" JSONB,
  "error" TEXT,
  "approvalDraft" JSONB,
  "approvedAt" TIMESTAMP(3),
  "approvedBy" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectedBy" TEXT,
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DepartmentBacklogItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DepartmentRunLog" (
  "id" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "backlogItemId" TEXT,
  "managerDecision" JSONB NOT NULL,
  "workerInvoked" TEXT,
  "invocationType" TEXT NOT NULL,
  "durationMs" INTEGER NOT NULL,
  "tokensUsed" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DepartmentRunLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DepartmentWorker_departmentId_agentId_key" ON "DepartmentWorker"("departmentId", "agentId");
CREATE INDEX IF NOT EXISTS "Department_userId_idx" ON "Department"("userId");
CREATE INDEX IF NOT EXISTS "Department_orgId_status_idx" ON "Department"("orgId", "status");
CREATE INDEX IF NOT EXISTS "Department_orgId_type_idx" ON "Department"("orgId", "type");
CREATE INDEX IF NOT EXISTS "DepartmentWorker_departmentId_idx" ON "DepartmentWorker"("departmentId");
CREATE INDEX IF NOT EXISTS "DepartmentWorker_agentId_idx" ON "DepartmentWorker"("agentId");
CREATE INDEX IF NOT EXISTS "DepartmentBacklogItem_departmentId_status_idx" ON "DepartmentBacklogItem"("departmentId", "status");
CREATE INDEX IF NOT EXISTS "DepartmentBacklogItem_departmentId_createdAt_idx" ON "DepartmentBacklogItem"("departmentId", "createdAt");
CREATE INDEX IF NOT EXISTS "DepartmentRunLog_departmentId_createdAt_idx" ON "DepartmentRunLog"("departmentId", "createdAt");
CREATE INDEX IF NOT EXISTS "DepartmentRunLog_backlogItemId_idx" ON "DepartmentRunLog"("backlogItemId");

DO $$ BEGIN
  ALTER TABLE "Department"
    ADD CONSTRAINT "Department_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Department"
    ADD CONSTRAINT "Department_managerAgentId_fkey"
    FOREIGN KEY ("managerAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DepartmentWorker"
    ADD CONSTRAINT "DepartmentWorker_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DepartmentWorker"
    ADD CONSTRAINT "DepartmentWorker_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DepartmentBacklogItem"
    ADD CONSTRAINT "DepartmentBacklogItem_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DepartmentRunLog"
    ADD CONSTRAINT "DepartmentRunLog_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
