-- Sprint 19.7.8 — append-only audit of transactional email sends.
--
-- One row per attempted send. Status differentiates between a successful
-- handoff to Resend (SENT), a pre-send or transport error (FAILED), and a
-- preference-gate refusal (SKIPPED — user opt-out, kill-switch flipped,
-- dev env without API key, etc.). `externalId` stores the Resend email
-- ID so we can cross-reference Resend's dashboard and webhook events
-- when chasing a bounce or "where did my mail go" ticket.
--
-- Indexes cover the obvious filters: by-user (settings page activity),
-- by-org/sub-org (tenant-scoped audits), by-template (rollout monitoring),
-- by-status (error queues), and by-createdAt (retention sweeps).
--
-- Idempotent.

DO $$ BEGIN
  CREATE TYPE "EmailLogStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "EmailLog" (
  "id"             TEXT             PRIMARY KEY,
  "userId"         TEXT,
  "orgId"          TEXT,
  "subOrgId"       TEXT,
  "template"       TEXT             NOT NULL,
  "recipientEmail" TEXT             NOT NULL,
  "status"         "EmailLogStatus" NOT NULL,
  "externalId"     TEXT,
  "errorMessage"   TEXT,
  "metadata"       JSONB,
  "createdAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "EmailLog_userId_idx"    ON "EmailLog" ("userId");
CREATE INDEX IF NOT EXISTS "EmailLog_orgId_idx"     ON "EmailLog" ("orgId");
CREATE INDEX IF NOT EXISTS "EmailLog_subOrgId_idx"  ON "EmailLog" ("subOrgId");
CREATE INDEX IF NOT EXISTS "EmailLog_template_idx"  ON "EmailLog" ("template");
CREATE INDEX IF NOT EXISTS "EmailLog_status_idx"    ON "EmailLog" ("status");
CREATE INDEX IF NOT EXISTS "EmailLog_createdAt_idx" ON "EmailLog" ("createdAt");
