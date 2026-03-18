ALTER TYPE "TeamExecutionStatus" ADD VALUE IF NOT EXISTS 'AWAITING_APPROVAL';
ALTER TYPE "TeamExecutionStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TYPE "TeamExecutionTaskStatus" ADD VALUE IF NOT EXISTS 'AWAITING_APPROVAL';
ALTER TYPE "TeamExecutionTaskStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TYPE "AgentTeamRole" ADD VALUE IF NOT EXISTS 'APPROVAL_GATE';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApprovalRequestStatus') THEN
    CREATE TYPE "ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED');
  END IF;
END $$;

ALTER TABLE "AgentTeamMember"
  ALTER COLUMN "agentId" DROP NOT NULL;

ALTER TABLE "AgentTeamMember"
  ADD COLUMN IF NOT EXISTS "config" JSONB;

ALTER TABLE "TeamExecution"
  ADD COLUMN IF NOT EXISTS "taskPlan" JSONB;

ALTER TABLE "TeamExecution"
  ADD COLUMN IF NOT EXISTS "executionContext" JSONB;

CREATE TABLE IF NOT EXISTS "ApprovalRequest" (
  "id" TEXT NOT NULL,
  "teamExecutionId" TEXT NOT NULL,
  "gateMemberId" TEXT,
  "taskIndex" INTEGER NOT NULL,
  "token" TEXT NOT NULL,
  "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
  "approverEmail" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  "respondedBy" TEXT,
  "note" TEXT,

  CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ApprovalRequest_token_key" ON "ApprovalRequest"("token");
CREATE INDEX IF NOT EXISTS "ApprovalRequest_teamExecutionId_idx" ON "ApprovalRequest"("teamExecutionId");
CREATE INDEX IF NOT EXISTS "ApprovalRequest_gateMemberId_idx" ON "ApprovalRequest"("gateMemberId");
CREATE INDEX IF NOT EXISTS "ApprovalRequest_taskIndex_idx" ON "ApprovalRequest"("taskIndex");

ALTER TABLE "ApprovalRequest"
  ADD CONSTRAINT "ApprovalRequest_teamExecutionId_fkey"
  FOREIGN KEY ("teamExecutionId") REFERENCES "TeamExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApprovalRequest"
  ADD CONSTRAINT "ApprovalRequest_gateMemberId_fkey"
  FOREIGN KEY ("gateMemberId") REFERENCES "AgentTeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
