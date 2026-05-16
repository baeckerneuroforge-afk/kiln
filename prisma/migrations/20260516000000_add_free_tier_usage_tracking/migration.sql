-- Sprint 20 — Free-Tier usage tracking.
--
-- Adds the TierUsageCounter table for per-org monthly conversation
-- counters + threshold-notification stamps. Counters that are
-- inherently "current state" (agent count, oauth-connection count,
-- sub-org count, storage bytes) are NOT denormalized here — they are
-- queried on-demand via prisma.<model>.count() in
-- src/lib/billing/usage-tracker.ts.
--
-- orgId is the Clerk Org ID:
--   • Personal user  → User.personalOrgId
--   • Agency sub-org → OrgRelationship.childOrgId
--
-- The (orgId, periodMonth) unique index doubles as the upsert key in
-- usage-tracker.incrementConversations; the periodMonth is a calendar
-- ISO month string ("2026-05") which makes monthly reset implicit —
-- the first increment in a new month inserts a fresh row with all
-- counters back to zero.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + DO blocks for the indexes
-- so the migration can be re-applied without error on a database that
-- already has the table.

CREATE TABLE IF NOT EXISTS "TierUsageCounter" (
  "id"                  TEXT          PRIMARY KEY,
  "orgId"               TEXT          NOT NULL,
  "periodMonth"         TEXT          NOT NULL,
  "conversationsCount"  INTEGER       NOT NULL DEFAULT 0,
  "notifiedAt80"        TIMESTAMP(3),
  "notifiedAt95"        TIMESTAMP(3),
  "notifiedAt100"       TIMESTAMP(3),
  "createdAt"           TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
  CREATE UNIQUE INDEX "TierUsageCounter_orgId_periodMonth_key"
    ON "TierUsageCounter" ("orgId", "periodMonth");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX "TierUsageCounter_orgId_idx" ON "TierUsageCounter" ("orgId");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX "TierUsageCounter_periodMonth_idx" ON "TierUsageCounter" ("periodMonth");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
