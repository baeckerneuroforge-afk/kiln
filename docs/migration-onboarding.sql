DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OnboardingMethod') THEN
    CREATE TYPE "OnboardingMethod" AS ENUM ('MANUAL', 'WIZARD', 'API');
  END IF;
END $$;

ALTER TABLE "OrgRelationship"
  ADD COLUMN IF NOT EXISTS "industry" TEXT,
  ADD COLUMN IF NOT EXISTS "onboardedVia" "OnboardingMethod" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS "onboardingDuration" INTEGER,
  ADD COLUMN IF NOT EXISTS "onboardedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "brandColor" TEXT,
  ADD COLUMN IF NOT EXISTS "logoUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "customSubdomain" TEXT,
  ADD COLUMN IF NOT EXISTS "emailSignature" TEXT;

ALTER TABLE "OrgBranding"
  ADD COLUMN IF NOT EXISTS "emailSignature" TEXT;

CREATE TABLE IF NOT EXISTS "IndustryTemplate" (
  "id" TEXT NOT NULL,
  "industry" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "displayNameDe" TEXT,
  "description" TEXT NOT NULL,
  "descriptionDe" TEXT,
  "departmentTemplates" JSONB NOT NULL,
  "knowledgeBaseSeeds" JSONB,
  "recommendedChannels" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "iconName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IndustryTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OnboardingWizard" (
  "id" TEXT NOT NULL,
  "agencyOrgId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "currentStep" INTEGER NOT NULL DEFAULT 1,
  "basics" JSONB NOT NULL DEFAULT '{}',
  "selectedTemplates" JSONB NOT NULL DEFAULT '[]',
  "knowledgeConfig" JSONB NOT NULL DEFAULT '{}',
  "channelConfig" JSONB NOT NULL DEFAULT '{}',
  "brandingConfig" JSONB NOT NULL DEFAULT '{}',
  "activationResult" JSONB,
  "progress" JSONB,
  "error" TEXT,
  "subOrgId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnboardingWizard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IndustryTemplate_industry_key"
  ON "IndustryTemplate"("industry");
CREATE INDEX IF NOT EXISTS "IndustryTemplate_isActive_sortOrder_idx"
  ON "IndustryTemplate"("isActive", "sortOrder");
CREATE INDEX IF NOT EXISTS "OnboardingWizard_agencyOrgId_status_idx"
  ON "OnboardingWizard"("agencyOrgId", "status");
CREATE INDEX IF NOT EXISTS "OnboardingWizard_userId_updatedAt_idx"
  ON "OnboardingWizard"("userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "OnboardingWizard_expiresAt_idx"
  ON "OnboardingWizard"("expiresAt");
CREATE INDEX IF NOT EXISTS "OrgRelationship_parentOrgId_industry_idx"
  ON "OrgRelationship"("parentOrgId", "industry");
