-- Workflow Canvas Phase 4 production features

CREATE TYPE "WorkflowVariableType" AS ENUM ('STRING', 'NUMBER', 'SECRET', 'JSON');
CREATE TYPE "MemoryScope" AS ENUM ('AGENT', 'WORKFLOW', 'GLOBAL');
CREATE TYPE "WorkflowDeadLetterStatus" AS ENUM ('OPEN', 'RETRIED', 'DISCARDED');

ALTER TABLE "AgentTeam"
ADD COLUMN "isSubWorkflow" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "parentWorkflowIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "TeamExecution"
ADD COLUMN "errorHandlingApplied" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AgentMemory"
ADD COLUMN "workflowExecutionId" TEXT,
ADD COLUMN "scope" "MemoryScope" NOT NULL DEFAULT 'AGENT';

CREATE TABLE "WorkflowVariable" (
  "id" TEXT NOT NULL,
  "agentTeamId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "type" "WorkflowVariableType" NOT NULL,
  "isSecret" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkflowVariable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowDeadLetter" (
  "id" TEXT NOT NULL,
  "agentTeamId" TEXT NOT NULL,
  "teamExecutionId" TEXT,
  "nodeId" TEXT NOT NULL,
  "nodeType" TEXT NOT NULL,
  "payload" JSONB,
  "error" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "status" "WorkflowDeadLetterStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retriedAt" TIMESTAMP(3),
  "discardedAt" TIMESTAMP(3),
  CONSTRAINT "WorkflowDeadLetter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowComment" (
  "id" TEXT NOT NULL,
  "agentTeamId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "position" JSONB NOT NULL,
  "color" TEXT NOT NULL DEFAULT 'yellow',
  "authorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkflowComment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowVariable_agentTeamId_name_key" ON "WorkflowVariable"("agentTeamId", "name");
CREATE INDEX "AgentTeam_isSubWorkflow_idx" ON "AgentTeam"("isSubWorkflow");
CREATE INDEX "AgentMemory_workflowExecutionId_idx" ON "AgentMemory"("workflowExecutionId");
CREATE INDEX "AgentMemory_scope_idx" ON "AgentMemory"("scope");
CREATE INDEX "WorkflowVariable_agentTeamId_idx" ON "WorkflowVariable"("agentTeamId");
CREATE INDEX "WorkflowDeadLetter_agentTeamId_status_idx" ON "WorkflowDeadLetter"("agentTeamId", "status");
CREATE INDEX "WorkflowDeadLetter_teamExecutionId_idx" ON "WorkflowDeadLetter"("teamExecutionId");
CREATE INDEX "WorkflowDeadLetter_nodeId_idx" ON "WorkflowDeadLetter"("nodeId");
CREATE INDEX "WorkflowComment_agentTeamId_idx" ON "WorkflowComment"("agentTeamId");
CREATE INDEX "WorkflowComment_authorUserId_idx" ON "WorkflowComment"("authorUserId");

ALTER TABLE "WorkflowVariable"
ADD CONSTRAINT "WorkflowVariable_agentTeamId_fkey"
FOREIGN KEY ("agentTeamId") REFERENCES "AgentTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkflowDeadLetter"
ADD CONSTRAINT "WorkflowDeadLetter_agentTeamId_fkey"
FOREIGN KEY ("agentTeamId") REFERENCES "AgentTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkflowDeadLetter"
ADD CONSTRAINT "WorkflowDeadLetter_teamExecutionId_fkey"
FOREIGN KEY ("teamExecutionId") REFERENCES "TeamExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkflowComment"
ADD CONSTRAINT "WorkflowComment_agentTeamId_fkey"
FOREIGN KEY ("agentTeamId") REFERENCES "AgentTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
