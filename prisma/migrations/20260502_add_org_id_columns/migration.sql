-- Phase 2.1 — Multi-Tenancy Foundation
-- Adds nullable orgId columns + indices to user-owned tables. No NOT NULL
-- constraint and no data migration in this step — backfill is handled by
-- scripts/backfill-personal-orgs.ts after deploy.
--
-- User receives a unique personalOrgId column instead of orgId, since users
-- can be members of multiple orgs (Clerk semantics) but each user has exactly
-- one auto-created Personal workspace.

-- User
ALTER TABLE "User" ADD COLUMN "personalOrgId" TEXT;
CREATE UNIQUE INDEX "User_personalOrgId_key" ON "User"("personalOrgId");

-- Tier-A user-owned models
ALTER TABLE "Agent" ADD COLUMN "orgId" TEXT;
CREATE INDEX "Agent_orgId_idx" ON "Agent"("orgId");

ALTER TABLE "AgentTeam" ADD COLUMN "orgId" TEXT;
CREATE INDEX "AgentTeam_orgId_idx" ON "AgentTeam"("orgId");

ALTER TABLE "KnowledgeBase" ADD COLUMN "orgId" TEXT;
CREATE INDEX "KnowledgeBase_orgId_idx" ON "KnowledgeBase"("orgId");

ALTER TABLE "Conversation" ADD COLUMN "orgId" TEXT;
CREATE INDEX "Conversation_orgId_idx" ON "Conversation"("orgId");

ALTER TABLE "Lead" ADD COLUMN "orgId" TEXT;
CREATE INDEX "Lead_orgId_idx" ON "Lead"("orgId");

ALTER TABLE "AgentMemory" ADD COLUMN "orgId" TEXT;
CREATE INDEX "AgentMemory_orgId_idx" ON "AgentMemory"("orgId");

ALTER TABLE "VisitorMemory" ADD COLUMN "orgId" TEXT;
CREATE INDEX "VisitorMemory_orgId_idx" ON "VisitorMemory"("orgId");

ALTER TABLE "ApiAccessKey" ADD COLUMN "orgId" TEXT;
CREATE INDEX "ApiAccessKey_orgId_idx" ON "ApiAccessKey"("orgId");

ALTER TABLE "ApiKey" ADD COLUMN "orgId" TEXT;
CREATE INDEX "ApiKey_orgId_idx" ON "ApiKey"("orgId");

ALTER TABLE "IntegrationConnection" ADD COLUMN "orgId" TEXT;
CREATE INDEX "IntegrationConnection_orgId_idx" ON "IntegrationConnection"("orgId");

ALTER TABLE "WebhookEndpoint" ADD COLUMN "orgId" TEXT;
CREATE INDEX "WebhookEndpoint_orgId_idx" ON "WebhookEndpoint"("orgId");

ALTER TABLE "AiCreditUsage" ADD COLUMN "orgId" TEXT;
CREATE INDEX "AiCreditUsage_orgId_idx" ON "AiCreditUsage"("orgId");

ALTER TABLE "AutomationRule" ADD COLUMN "orgId" TEXT;
CREATE INDEX "AutomationRule_orgId_idx" ON "AutomationRule"("orgId");

ALTER TABLE "AgentRun" ADD COLUMN "orgId" TEXT;
CREATE INDEX "AgentRun_orgId_idx" ON "AgentRun"("orgId");

ALTER TABLE "AgentOrchestration" ADD COLUMN "orgId" TEXT;
CREATE INDEX "AgentOrchestration_orgId_idx" ON "AgentOrchestration"("orgId");

ALTER TABLE "TeamExecution" ADD COLUMN "orgId" TEXT;
CREATE INDEX "TeamExecution_orgId_idx" ON "TeamExecution"("orgId");

ALTER TABLE "AgentChannel" ADD COLUMN "orgId" TEXT;
CREATE INDEX "AgentChannel_orgId_idx" ON "AgentChannel"("orgId");

ALTER TABLE "AutoTopUpConfig" ADD COLUMN "orgId" TEXT;
CREATE INDEX "AutoTopUpConfig_orgId_idx" ON "AutoTopUpConfig"("orgId");

ALTER TABLE "ResellerAccount" ADD COLUMN "orgId" TEXT;
CREATE INDEX "ResellerAccount_orgId_idx" ON "ResellerAccount"("orgId");

ALTER TABLE "ClientPortal" ADD COLUMN "orgId" TEXT;
CREATE INDEX "ClientPortal_orgId_idx" ON "ClientPortal"("orgId");

ALTER TABLE "ClientSubscription" ADD COLUMN "orgId" TEXT;
CREATE INDEX "ClientSubscription_orgId_idx" ON "ClientSubscription"("orgId");

ALTER TABLE "ReferralCredit" ADD COLUMN "orgId" TEXT;
CREATE INDEX "ReferralCredit_orgId_idx" ON "ReferralCredit"("orgId");

ALTER TABLE "AuditEvent" ADD COLUMN "orgId" TEXT;
CREATE INDEX "AuditEvent_orgId_idx" ON "AuditEvent"("orgId");

ALTER TABLE "AgentResearchEntry" ADD COLUMN "orgId" TEXT;
CREATE INDEX "AgentResearchEntry_orgId_idx" ON "AgentResearchEntry"("orgId");

ALTER TABLE "ApiDiscovery" ADD COLUMN "orgId" TEXT;
CREATE INDEX "ApiDiscovery_orgId_idx" ON "ApiDiscovery"("orgId");

ALTER TABLE "WatchLearnSession" ADD COLUMN "orgId" TEXT;
CREATE INDEX "WatchLearnSession_orgId_idx" ON "WatchLearnSession"("orgId");

ALTER TABLE "ROIConfig" ADD COLUMN "orgId" TEXT;
CREATE INDEX "ROIConfig_orgId_idx" ON "ROIConfig"("orgId");

ALTER TABLE "ModelRoutingConfig" ADD COLUMN "orgId" TEXT;
CREATE INDEX "ModelRoutingConfig_orgId_idx" ON "ModelRoutingConfig"("orgId");

ALTER TABLE "AgentWorkspaceFile" ADD COLUMN "orgId" TEXT;
CREATE INDEX "AgentWorkspaceFile_orgId_idx" ON "AgentWorkspaceFile"("orgId");

ALTER TABLE "MCPConnection" ADD COLUMN "orgId" TEXT;
CREATE INDEX "MCPConnection_orgId_idx" ON "MCPConnection"("orgId");

ALTER TABLE "WorkflowApproval" ADD COLUMN "orgId" TEXT;
CREATE INDEX "WorkflowApproval_orgId_idx" ON "WorkflowApproval"("orgId");

ALTER TABLE "AgentVersion" ADD COLUMN "orgId" TEXT;
CREATE INDEX "AgentVersion_orgId_idx" ON "AgentVersion"("orgId");

ALTER TABLE "TeamVersion" ADD COLUMN "orgId" TEXT;
CREATE INDEX "TeamVersion_orgId_idx" ON "TeamVersion"("orgId");

ALTER TABLE "AgentAnalytics" ADD COLUMN "orgId" TEXT;
CREATE INDEX "AgentAnalytics_orgId_idx" ON "AgentAnalytics"("orgId");

ALTER TABLE "AgentPublication" ADD COLUMN "orgId" TEXT;
CREATE INDEX "AgentPublication_orgId_idx" ON "AgentPublication"("orgId");

ALTER TABLE "KnowledgeEntity" ADD COLUMN "orgId" TEXT;
CREATE INDEX "KnowledgeEntity_orgId_idx" ON "KnowledgeEntity"("orgId");

ALTER TABLE "DataConnection" ADD COLUMN "orgId" TEXT;
CREATE INDEX "DataConnection_orgId_idx" ON "DataConnection"("orgId");

ALTER TABLE "TeamABTest" ADD COLUMN "orgId" TEXT;
CREATE INDEX "TeamABTest_orgId_idx" ON "TeamABTest"("orgId");

ALTER TABLE "QuickUseTask" ADD COLUMN "orgId" TEXT;
CREATE INDEX "QuickUseTask_orgId_idx" ON "QuickUseTask"("orgId");

ALTER TABLE "QuickUseMemory" ADD COLUMN "orgId" TEXT;
CREATE INDEX "QuickUseMemory_orgId_idx" ON "QuickUseMemory"("orgId");

ALTER TABLE "EmbedToken" ADD COLUMN "orgId" TEXT;
CREATE INDEX "EmbedToken_orgId_idx" ON "EmbedToken"("orgId");

ALTER TABLE "CollaborationLink" ADD COLUMN "orgId" TEXT;
CREATE INDEX "CollaborationLink_orgId_idx" ON "CollaborationLink"("orgId");
