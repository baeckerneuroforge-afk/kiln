-- Templates System migration (idempotent)
-- Apply this in production before deploying the Sub-Org Mode + Templates sprint.

CREATE TABLE IF NOT EXISTS "AgentTemplate" (
  "id" TEXT NOT NULL,
  "agencyOrgId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT,
  "agentConfig" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "isPublished" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkflowTemplate" (
  "id" TEXT NOT NULL,
  "agencyOrgId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT,
  "workflowConfig" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "isPublished" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkflowTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TemplateInstance" (
  "id" TEXT NOT NULL,
  "templateType" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "templateVersion" INTEGER NOT NULL,
  "subOrgId" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "isCustomized" BOOLEAN NOT NULL DEFAULT false,
  "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSyncedAt" TIMESTAMP(3),

  CONSTRAINT "TemplateInstance_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OnboardingWizard"
  ADD COLUMN IF NOT EXISTS "selectedAgentTemplates" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "selectedWorkflowTemplates" JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS "AgentTemplate_agencyOrgId_idx"
  ON "AgentTemplate"("agencyOrgId");

CREATE INDEX IF NOT EXISTS "AgentTemplate_agencyOrgId_isPublished_idx"
  ON "AgentTemplate"("agencyOrgId", "isPublished");

CREATE INDEX IF NOT EXISTS "WorkflowTemplate_agencyOrgId_idx"
  ON "WorkflowTemplate"("agencyOrgId");

CREATE INDEX IF NOT EXISTS "WorkflowTemplate_agencyOrgId_isPublished_idx"
  ON "WorkflowTemplate"("agencyOrgId", "isPublished");

CREATE INDEX IF NOT EXISTS "TemplateInstance_subOrgId_idx"
  ON "TemplateInstance"("subOrgId");

CREATE INDEX IF NOT EXISTS "TemplateInstance_templateType_templateId_idx"
  ON "TemplateInstance"("templateType", "templateId");

CREATE UNIQUE INDEX IF NOT EXISTS "TemplateInstance_templateType_templateId_subOrgId_instanceId_key"
  ON "TemplateInstance"("templateType", "templateId", "subOrgId", "instanceId");
