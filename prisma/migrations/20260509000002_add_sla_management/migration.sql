-- SLA-Management: per-Department response-time policies, tracking and events.
-- Idempotent for production hotfix safety.

CREATE TABLE IF NOT EXISTS "SlaPolicy" (
  "id" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "appliesTo" TEXT NOT NULL DEFAULT 'ALL',
  "conditionValue" TEXT,
  "firstResponseTargetMinutes" INTEGER NOT NULL,
  "resolutionTargetMinutes" INTEGER,
  "warningThresholdPercent" INTEGER NOT NULL DEFAULT 75,
  "escalationChannel" TEXT,
  "escalationTargetUserId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 50,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SlaPolicy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SlaPolicy_departmentId_isActive_idx"
  ON "SlaPolicy"("departmentId", "isActive");
CREATE INDEX IF NOT EXISTS "SlaPolicy_departmentId_priority_idx"
  ON "SlaPolicy"("departmentId", "priority");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SlaPolicy_departmentId_fkey'
  ) THEN
    ALTER TABLE "SlaPolicy"
      ADD CONSTRAINT "SlaPolicy_departmentId_fkey"
      FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "SlaTracking" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT,
  "channelMessageId" TEXT,
  "customerProfileId" TEXT,
  "slaPolicyId" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "firstResponseAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "firstResponseMinutes" INTEGER,
  "resolutionMinutes" INTEGER,
  "warningEscalatedAt" TIMESTAMP(3),
  "breachEscalatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SlaTracking_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SlaTracking_orgId_status_idx" ON "SlaTracking"("orgId", "status");
CREATE INDEX IF NOT EXISTS "SlaTracking_departmentId_status_idx" ON "SlaTracking"("departmentId", "status");
CREATE INDEX IF NOT EXISTS "SlaTracking_status_startedAt_idx" ON "SlaTracking"("status", "startedAt");
CREATE INDEX IF NOT EXISTS "SlaTracking_conversationId_idx" ON "SlaTracking"("conversationId");
CREATE INDEX IF NOT EXISTS "SlaTracking_customerProfileId_idx" ON "SlaTracking"("customerProfileId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SlaTracking_slaPolicyId_fkey'
  ) THEN
    ALTER TABLE "SlaTracking"
      ADD CONSTRAINT "SlaTracking_slaPolicyId_fkey"
      FOREIGN KEY ("slaPolicyId") REFERENCES "SlaPolicy"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "SlaEvent" (
  "id" TEXT NOT NULL,
  "slaTrackingId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "message" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SlaEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SlaEvent_slaTrackingId_createdAt_idx"
  ON "SlaEvent"("slaTrackingId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SlaEvent_slaTrackingId_fkey'
  ) THEN
    ALTER TABLE "SlaEvent"
      ADD CONSTRAINT "SlaEvent_slaTrackingId_fkey"
      FOREIGN KEY ("slaTrackingId") REFERENCES "SlaTracking"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;
