-- WorkflowMockData: pinned mock payloads per workflow node, used by the
-- debug runner to skip real execution. Idempotent for production hotfix safety.

CREATE TABLE IF NOT EXISTS "WorkflowMockData" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkflowMockData_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WorkflowMockData_orgId_workflowId_idx"
  ON "WorkflowMockData"("orgId", "workflowId");
CREATE INDEX IF NOT EXISTS "WorkflowMockData_workflowId_nodeId_idx"
  ON "WorkflowMockData"("workflowId", "nodeId");
CREATE INDEX IF NOT EXISTS "WorkflowMockData_workflowId_nodeId_isDefault_idx"
  ON "WorkflowMockData"("workflowId", "nodeId", "isDefault");
