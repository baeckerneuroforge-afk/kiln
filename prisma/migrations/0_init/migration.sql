-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'STARTER', 'PRO', 'AGENCY', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "ModelProvider" AS ENUM ('ANTHROPIC', 'OPENAI', 'PERPLEXITY', 'GOOGLE', 'GROQ');

-- CreateEnum
CREATE TYPE "CreditUsageType" AS ENUM ('CHAT', 'TEAM_TASK', 'ORCHESTRATION', 'SCHEDULED', 'WEBHOOK', 'EMBEDDING', 'TASK_RUN');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('PUBLIC', 'INTERNAL');

-- CreateEnum
CREATE TYPE "AgentMode" AS ENUM ('CHAT', 'TASK');

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('MANUAL', 'SCHEDULE', 'WEBHOOK', 'EVENT');

-- CreateEnum
CREATE TYPE "OutputType" AS ENUM ('NONE', 'HTTP_REQUEST', 'EMAIL', 'NEXT_AGENT', 'WEBHOOK', 'CUSTOM_CODE');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('SUCCESS', 'ERROR');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('DRAFT', 'LIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('BOOK_APPOINTMENT', 'COLLECT_EMAIL', 'SEND_EMAIL', 'SCORE_LEAD', 'NOTIFY_OWNER', 'FIRE_WEBHOOK', 'HANDOFF_HUMAN', 'CUSTOM_CODE', 'HTTP_REQUEST');

-- CreateEnum
CREATE TYPE "KBType" AS ENUM ('PDF', 'URL', 'FAQ', 'TEXT');

-- CreateEnum
CREATE TYPE "EmbedStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'ERROR');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'HUMAN');

-- CreateEnum
CREATE TYPE "HandoffStatus" AS ENUM ('REQUESTED', 'RESPONDED');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('WEB', 'WHATSAPP', 'INSTAGRAM', 'TELEGRAM', 'VOICE', 'SLACK', 'EMAIL', 'GITHUB');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('TELEGRAM', 'EMAIL', 'WHATSAPP', 'SLACK', 'GITHUB', 'STRIPE', 'AIRTABLE', 'CALENDLY');

-- CreateEnum
CREATE TYPE "TeamMemberRole" AS ENUM ('VIEWER', 'EDITOR');

-- CreateEnum
CREATE TYPE "WebhookAuth" AS ENUM ('NONE', 'HEADER_AUTH', 'HMAC');

-- CreateEnum
CREATE TYPE "ResponseMode" AS ENUM ('IMMEDIATE', 'AFTER_PROCESSING');

-- CreateEnum
CREATE TYPE "AgentTeamStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "TeamExecutionStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "TeamExecutionTaskStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AgentTeamRole" AS ENUM ('HEAD', 'COORDINATOR', 'EXECUTOR', 'REPORTER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "imageUrl" TEXT,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "stripeCustomerId" TEXT,
    "companyName" TEXT,
    "advancedMode" BOOLEAN NOT NULL DEFAULT false,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "referralCode" TEXT,
    "referredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "aiCreditsBalance" INTEGER NOT NULL DEFAULT 50,
    "aiCreditsMonthly" INTEGER NOT NULL DEFAULT 50,
    "aiCreditsResetDate" TIMESTAMP(3),
    "byokEnabled" BOOLEAN NOT NULL DEFAULT false,
    "creditTier" INTEGER NOT NULL DEFAULT 0,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCredit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "referredEmail" TEXT,
    "type" TEXT NOT NULL,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "systemPrompt" TEXT NOT NULL,
    "personality" JSONB,
    "welcomeMessage" TEXT,
    "suggestedQuestions" TEXT[],
    "llmModel" TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
    "modelProvider" "ModelProvider" NOT NULL DEFAULT 'ANTHROPIC',
    "status" "AgentStatus" NOT NULL DEFAULT 'DRAFT',
    "agentType" "AgentType" NOT NULL DEFAULT 'PUBLIC',
    "agentMode" "AgentMode" NOT NULL DEFAULT 'CHAT',
    "triggerType" "TriggerType" NOT NULL DEFAULT 'MANUAL',
    "triggerConfig" JSONB,
    "preProcessConfig" JSONB,
    "postProcessConfig" JSONB,
    "outputType" "OutputType" NOT NULL DEFAULT 'NONE',
    "outputConfig" JSONB,
    "lastRunAt" TIMESTAMP(3),
    "lastRunResult" JSONB,
    "whiteLabel" JSONB,
    "customDomain" TEXT,
    "showPoweredBy" BOOLEAN NOT NULL DEFAULT true,
    "avgDealValue" DOUBLE PRECISION,
    "autoDetectLanguage" BOOLEAN NOT NULL DEFAULT true,
    "memoryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "imageAnalysisEnabled" BOOLEAN NOT NULL DEFAULT false,
    "showAiDisclaimer" BOOLEAN NOT NULL DEFAULT true,
    "promptBranches" JSONB,
    "clonedFromId" TEXT,
    "clonedFromName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAction" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" "ActionType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,

    CONSTRAINT "AgentAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentCustomTool" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'GET',
    "url" TEXT NOT NULL,
    "headers" JSONB,
    "bodyTemplate" TEXT,
    "responseMapping" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentCustomTool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeBase" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" "KBType" NOT NULL,
    "sourceName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "embeddingStatus" "EmbedStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT NOT NULL,
    "leadScore" INTEGER,
    "sentiment" DOUBLE PRECISION,
    "actionsUsed" TEXT[],
    "channel" "Channel" NOT NULL DEFAULT 'WEB',
    "visitorName" TEXT,
    "visitorEmail" TEXT,
    "handoffStatus" "HandoffStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "context" TEXT,
    "score" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMemory" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiAccessKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "scopes" JSONB NOT NULL DEFAULT '["admin"]',
    "expiresAt" TIMESTAMP(3),
    "lastUsed" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiAccessKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiAccessKeyUsage" (
    "id" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiAccessKeyUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAnalytics" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalConversations" INTEGER NOT NULL DEFAULT 0,
    "avgMessagesPerConv" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "leadsCollected" INTEGER NOT NULL DEFAULT 0,
    "appointmentsBooked" INTEGER NOT NULL DEFAULT 0,
    "estimatedValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "topIntents" JSONB,

    CONSTRAINT "AgentAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "taskDescription" TEXT NOT NULL,
    "notificationMethod" TEXT NOT NULL DEFAULT 'NONE',
    "notificationTarget" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastRunResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentVersion" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "configSnapshot" JSONB NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTestCase" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inputMessage" TEXT NOT NULL,
    "expectedKeywords" JSONB NOT NULL,
    "lastResult" TEXT,
    "lastResponse" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTestRun" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "totalTests" INTEGER NOT NULL,
    "passed" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "url" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "secret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "statusCode" INTEGER,
    "responseTime" INTEGER,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentOrchestration" (
    "id" TEXT NOT NULL,
    "sourceAgentId" TEXT NOT NULL,
    "targetAgentId" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentOrchestration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrchestrationHandoff" (
    "id" TEXT NOT NULL,
    "orchestrationRuleId" TEXT NOT NULL,
    "sourceAgentId" TEXT NOT NULL,
    "targetAgentId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrchestrationHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentIntegration" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentChannel" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL,
    "config" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "TeamMemberRole" NOT NULL DEFAULT 'VIEWER',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceTemplate" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "agentConfigSnapshot" JSONB NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "screenshotUrl" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplacePurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "stripePaymentId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplacePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceRating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentWebhook" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "httpMethods" JSONB NOT NULL DEFAULT '["POST"]',
    "authType" "WebhookAuth" NOT NULL DEFAULT 'NONE',
    "authValue" TEXT,
    "responseMode" "ResponseMode" NOT NULL DEFAULT 'IMMEDIATE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTeam" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "goal" TEXT,
    "status" "AgentTeamStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "role" "AgentTeamRole" NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "responsibilities" TEXT,
    "reportsToMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTeamTask" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "result" TEXT,
    "parentTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTeamTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamExecution" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goal" TEXT,
    "status" "TeamExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "totalTasks" INTEGER NOT NULL DEFAULT 0,
    "completedTasks" INTEGER NOT NULL DEFAULT 0,
    "failedTasks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TeamExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamExecutionLog" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "taskId" TEXT,
    "taskIndex" INTEGER NOT NULL,
    "taskTitle" TEXT NOT NULL,
    "agentId" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" "TeamExecutionTaskStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB,
    "output" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "TeamExecutionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookExecution" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "incomingPayload" JSONB NOT NULL,
    "agentResponse" TEXT,
    "actionsExecuted" JSONB,
    "duration" INTEGER,
    "statusCode" INTEGER NOT NULL DEFAULT 200,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCreditUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "conversationId" TEXT,
    "creditsUsed" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "type" "CreditUsageType" NOT NULL DEFAULT 'CHAT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCreditUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "input" JSONB,
    "output" TEXT,
    "outputAction" JSONB,
    "status" "RunStatus" NOT NULL DEFAULT 'SUCCESS',
    "error" TEXT,
    "duration" INTEGER,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "ReferralCredit_userId_idx" ON "ReferralCredit"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_slug_key" ON "Agent"("slug");

-- CreateIndex
CREATE INDEX "Agent_userId_idx" ON "Agent"("userId");

-- CreateIndex
CREATE INDEX "AgentAction_agentId_idx" ON "AgentAction"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentAction_agentId_type_key" ON "AgentAction"("agentId", "type");

-- CreateIndex
CREATE INDEX "AgentCustomTool_agentId_idx" ON "AgentCustomTool"("agentId");

-- CreateIndex
CREATE INDEX "KnowledgeBase_agentId_idx" ON "KnowledgeBase"("agentId");

-- CreateIndex
CREATE INDEX "Conversation_agentId_idx" ON "Conversation"("agentId");

-- CreateIndex
CREATE INDEX "Conversation_sessionId_idx" ON "Conversation"("sessionId");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX "Lead_agentId_idx" ON "Lead"("agentId");

-- CreateIndex
CREATE INDEX "Lead_email_idx" ON "Lead"("email");

-- CreateIndex
CREATE INDEX "AgentMemory_agentId_sessionHash_idx" ON "AgentMemory"("agentId", "sessionHash");

-- CreateIndex
CREATE UNIQUE INDEX "AgentMemory_agentId_sessionHash_key_key" ON "AgentMemory"("agentId", "sessionHash", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ApiAccessKey_hashedKey_key" ON "ApiAccessKey"("hashedKey");

-- CreateIndex
CREATE INDEX "ApiAccessKey_userId_idx" ON "ApiAccessKey"("userId");

-- CreateIndex
CREATE INDEX "ApiAccessKey_hashedKey_idx" ON "ApiAccessKey"("hashedKey");

-- CreateIndex
CREATE INDEX "ApiAccessKey_expiresAt_idx" ON "ApiAccessKey"("expiresAt");

-- CreateIndex
CREATE INDEX "ApiAccessKeyUsage_keyId_idx" ON "ApiAccessKeyUsage"("keyId");

-- CreateIndex
CREATE INDEX "ApiAccessKeyUsage_createdAt_idx" ON "ApiAccessKeyUsage"("createdAt");

-- CreateIndex
CREATE INDEX "ApiAccessKeyUsage_keyId_createdAt_idx" ON "ApiAccessKeyUsage"("keyId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiAccessKeyUsage_endpoint_idx" ON "ApiAccessKeyUsage"("endpoint");

-- CreateIndex
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_userId_provider_key" ON "ApiKey"("userId", "provider");

-- CreateIndex
CREATE INDEX "AgentAnalytics_agentId_idx" ON "AgentAnalytics"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentAnalytics_agentId_date_key" ON "AgentAnalytics"("agentId", "date");

-- CreateIndex
CREATE INDEX "AutomationRule_agentId_idx" ON "AutomationRule"("agentId");

-- CreateIndex
CREATE INDEX "AutomationRule_enabled_idx" ON "AutomationRule"("enabled");

-- CreateIndex
CREATE INDEX "AgentVersion_agentId_idx" ON "AgentVersion"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentVersion_agentId_versionNumber_key" ON "AgentVersion"("agentId", "versionNumber");

-- CreateIndex
CREATE INDEX "AgentTestCase_agentId_idx" ON "AgentTestCase"("agentId");

-- CreateIndex
CREATE INDEX "AgentTestRun_agentId_idx" ON "AgentTestRun"("agentId");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_userId_idx" ON "WebhookEndpoint"("userId");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_agentId_idx" ON "WebhookEndpoint"("agentId");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_active_idx" ON "WebhookEndpoint"("active");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookId_idx" ON "WebhookDelivery"("webhookId");

-- CreateIndex
CREATE INDEX "AgentOrchestration_sourceAgentId_idx" ON "AgentOrchestration"("sourceAgentId");

-- CreateIndex
CREATE INDEX "AgentOrchestration_targetAgentId_idx" ON "AgentOrchestration"("targetAgentId");

-- CreateIndex
CREATE INDEX "OrchestrationHandoff_orchestrationRuleId_idx" ON "OrchestrationHandoff"("orchestrationRuleId");

-- CreateIndex
CREATE INDEX "OrchestrationHandoff_sourceAgentId_idx" ON "OrchestrationHandoff"("sourceAgentId");

-- CreateIndex
CREATE INDEX "OrchestrationHandoff_conversationId_idx" ON "OrchestrationHandoff"("conversationId");

-- CreateIndex
CREATE INDEX "IntegrationConnection_userId_idx" ON "IntegrationConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_userId_provider_key" ON "IntegrationConnection"("userId", "provider");

-- CreateIndex
CREATE INDEX "AgentIntegration_agentId_idx" ON "AgentIntegration"("agentId");

-- CreateIndex
CREATE INDEX "AgentIntegration_integrationId_idx" ON "AgentIntegration"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentIntegration_agentId_integrationId_key" ON "AgentIntegration"("agentId", "integrationId");

-- CreateIndex
CREATE INDEX "AgentChannel_agentId_idx" ON "AgentChannel"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentChannel_agentId_type_key" ON "AgentChannel"("agentId", "type");

-- CreateIndex
CREATE INDEX "TeamMember_agentId_idx" ON "TeamMember"("agentId");

-- CreateIndex
CREATE INDEX "TeamMember_email_idx" ON "TeamMember"("email");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_agentId_email_key" ON "TeamMember"("agentId", "email");

-- CreateIndex
CREATE INDEX "MarketplaceTemplate_authorId_idx" ON "MarketplaceTemplate"("authorId");

-- CreateIndex
CREATE INDEX "MarketplaceTemplate_category_idx" ON "MarketplaceTemplate"("category");

-- CreateIndex
CREATE INDEX "MarketplaceTemplate_downloads_idx" ON "MarketplaceTemplate"("downloads");

-- CreateIndex
CREATE INDEX "MarketplacePurchase_userId_idx" ON "MarketplacePurchase"("userId");

-- CreateIndex
CREATE INDEX "MarketplacePurchase_templateId_idx" ON "MarketplacePurchase"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplacePurchase_userId_templateId_key" ON "MarketplacePurchase"("userId", "templateId");

-- CreateIndex
CREATE INDEX "MarketplaceRating_templateId_idx" ON "MarketplaceRating"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceRating_userId_templateId_key" ON "MarketplaceRating"("userId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentWebhook_path_key" ON "AgentWebhook"("path");

-- CreateIndex
CREATE INDEX "AgentWebhook_agentId_idx" ON "AgentWebhook"("agentId");

-- CreateIndex
CREATE INDEX "AgentWebhook_path_idx" ON "AgentWebhook"("path");

-- CreateIndex
CREATE INDEX "AgentTeam_userId_idx" ON "AgentTeam"("userId");

-- CreateIndex
CREATE INDEX "AgentTeamMember_teamId_idx" ON "AgentTeamMember"("teamId");

-- CreateIndex
CREATE INDEX "AgentTeamMember_agentId_idx" ON "AgentTeamMember"("agentId");

-- CreateIndex
CREATE INDEX "AgentTeamTask_teamId_idx" ON "AgentTeamTask"("teamId");

-- CreateIndex
CREATE INDEX "AgentTeamTask_assignedToId_idx" ON "AgentTeamTask"("assignedToId");

-- CreateIndex
CREATE INDEX "TeamExecution_teamId_idx" ON "TeamExecution"("teamId");

-- CreateIndex
CREATE INDEX "TeamExecution_userId_idx" ON "TeamExecution"("userId");

-- CreateIndex
CREATE INDEX "TeamExecution_startedAt_idx" ON "TeamExecution"("startedAt");

-- CreateIndex
CREATE INDEX "TeamExecutionLog_teamId_idx" ON "TeamExecutionLog"("teamId");

-- CreateIndex
CREATE INDEX "TeamExecutionLog_executionId_idx" ON "TeamExecutionLog"("executionId");

-- CreateIndex
CREATE INDEX "TeamExecutionLog_taskId_idx" ON "TeamExecutionLog"("taskId");

-- CreateIndex
CREATE INDEX "TeamExecutionLog_agentId_idx" ON "TeamExecutionLog"("agentId");

-- CreateIndex
CREATE INDEX "TeamExecutionLog_executionId_taskIndex_idx" ON "TeamExecutionLog"("executionId", "taskIndex");

-- CreateIndex
CREATE INDEX "WebhookExecution_webhookId_idx" ON "WebhookExecution"("webhookId");

-- CreateIndex
CREATE INDEX "AiCreditUsage_userId_idx" ON "AiCreditUsage"("userId");

-- CreateIndex
CREATE INDEX "AiCreditUsage_agentId_idx" ON "AiCreditUsage"("agentId");

-- CreateIndex
CREATE INDEX "AiCreditUsage_userId_createdAt_idx" ON "AiCreditUsage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiCreditUsage_type_idx" ON "AiCreditUsage"("type");

-- CreateIndex
CREATE INDEX "AgentRun_agentId_idx" ON "AgentRun"("agentId");

-- CreateIndex
CREATE INDEX "AgentRun_agentId_createdAt_idx" ON "AgentRun"("agentId", "createdAt");

-- AddForeignKey
ALTER TABLE "ReferralCredit" ADD CONSTRAINT "ReferralCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCustomTool" ADD CONSTRAINT "AgentCustomTool_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBase" ADD CONSTRAINT "KnowledgeBase_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMemory" ADD CONSTRAINT "AgentMemory_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiAccessKeyUsage" ADD CONSTRAINT "ApiAccessKeyUsage_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "ApiAccessKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAnalytics" ADD CONSTRAINT "AgentAnalytics_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentVersion" ADD CONSTRAINT "AgentVersion_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTestCase" ADD CONSTRAINT "AgentTestCase_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTestRun" ADD CONSTRAINT "AgentTestRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentOrchestration" ADD CONSTRAINT "AgentOrchestration_sourceAgentId_fkey" FOREIGN KEY ("sourceAgentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentOrchestration" ADD CONSTRAINT "AgentOrchestration_targetAgentId_fkey" FOREIGN KEY ("targetAgentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrchestrationHandoff" ADD CONSTRAINT "OrchestrationHandoff_orchestrationRuleId_fkey" FOREIGN KEY ("orchestrationRuleId") REFERENCES "AgentOrchestration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentIntegration" ADD CONSTRAINT "AgentIntegration_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentIntegration" ADD CONSTRAINT "AgentIntegration_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentChannel" ADD CONSTRAINT "AgentChannel_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceTemplate" ADD CONSTRAINT "MarketplaceTemplate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplacePurchase" ADD CONSTRAINT "MarketplacePurchase_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MarketplaceTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceRating" ADD CONSTRAINT "MarketplaceRating_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MarketplaceTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWebhook" ADD CONSTRAINT "AgentWebhook_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTeam" ADD CONSTRAINT "AgentTeam_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTeamMember" ADD CONSTRAINT "AgentTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "AgentTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTeamMember" ADD CONSTRAINT "AgentTeamMember_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTeamMember" ADD CONSTRAINT "AgentTeamMember_reportsToMemberId_fkey" FOREIGN KEY ("reportsToMemberId") REFERENCES "AgentTeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTeamTask" ADD CONSTRAINT "AgentTeamTask_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "AgentTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamExecution" ADD CONSTRAINT "TeamExecution_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "AgentTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamExecution" ADD CONSTRAINT "TeamExecution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamExecutionLog" ADD CONSTRAINT "TeamExecutionLog_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "AgentTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamExecutionLog" ADD CONSTRAINT "TeamExecutionLog_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "TeamExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamExecutionLog" ADD CONSTRAINT "TeamExecutionLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTeamTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamExecutionLog" ADD CONSTRAINT "TeamExecutionLog_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookExecution" ADD CONSTRAINT "WebhookExecution_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "AgentWebhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCreditUsage" ADD CONSTRAINT "AiCreditUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
