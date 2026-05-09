-- Customer-Memory: cross-conversation customer profiles + durable memory entries
-- per Sub-Org. Idempotent for production hotfix safety.

CREATE TABLE IF NOT EXISTS "CustomerProfile" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "primaryEmail" TEXT,
  "primaryPhone" TEXT,
  "fullName" TEXT,
  "emailAliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "phoneAliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "preferences" JSONB,
  "metadata" JSONB,
  "totalConversations" INTEGER NOT NULL DEFAULT 0,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isAnonymized" BOOLEAN NOT NULL DEFAULT false,
  "anonymizedAt" TIMESTAMP(3),
  "consentGiven" BOOLEAN NOT NULL DEFAULT false,
  "consentGivenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomerProfile_orgId_idx" ON "CustomerProfile"("orgId");
CREATE INDEX IF NOT EXISTS "CustomerProfile_orgId_primaryEmail_idx" ON "CustomerProfile"("orgId", "primaryEmail");
CREATE INDEX IF NOT EXISTS "CustomerProfile_orgId_primaryPhone_idx" ON "CustomerProfile"("orgId", "primaryPhone");
CREATE INDEX IF NOT EXISTS "CustomerProfile_orgId_lastSeenAt_idx" ON "CustomerProfile"("orgId", "lastSeenAt");

CREATE TABLE IF NOT EXISTS "CustomerMemoryEntry" (
  "id" TEXT NOT NULL,
  "customerProfileId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceId" TEXT,
  "departmentId" TEXT,
  "workerId" TEXT,
  "importance" INTEGER NOT NULL DEFAULT 5,
  "embedding" BYTEA,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerMemoryEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomerMemoryEntry_customerProfileId_idx" ON "CustomerMemoryEntry"("customerProfileId");
CREATE INDEX IF NOT EXISTS "CustomerMemoryEntry_customerProfileId_isActive_importance_idx"
  ON "CustomerMemoryEntry"("customerProfileId", "isActive", "importance");
CREATE INDEX IF NOT EXISTS "CustomerMemoryEntry_customerProfileId_createdAt_idx"
  ON "CustomerMemoryEntry"("customerProfileId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomerMemoryEntry_customerProfileId_fkey'
  ) THEN
    ALTER TABLE "CustomerMemoryEntry"
      ADD CONSTRAINT "CustomerMemoryEntry_customerProfileId_fkey"
      FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "CustomerProfileAudit" (
  "id" TEXT NOT NULL,
  "customerProfileId" TEXT,
  "orgId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerProfileAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomerProfileAudit_orgId_createdAt_idx"
  ON "CustomerProfileAudit"("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "CustomerProfileAudit_customerProfileId_createdAt_idx"
  ON "CustomerProfileAudit"("customerProfileId", "createdAt");

ALTER TABLE "DepartmentChannelMessage"
  ADD COLUMN IF NOT EXISTS "customerProfileId" TEXT;

CREATE INDEX IF NOT EXISTS "DepartmentChannelMessage_customerProfileId_idx"
  ON "DepartmentChannelMessage"("customerProfileId");
