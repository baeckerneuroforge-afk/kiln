-- Sprint 19.7.5 — per-org OAuth uniqueness.
--
-- Before: a user could hold exactly one IntegrationConnection per provider
-- (UNIQUE userId+provider). After: one connection per (userId, orgId,
-- provider), so an agency operator can hook up different Slack workspaces /
-- Gmail mailboxes for each Sub-Org they manage.
--
-- Migration plan:
--   1) Drop the old UNIQUE(userId, provider) index.
--   2) Backfill orgId on legacy rows — pre-19.7.5 connections were stored
--      with orgId = NULL even after Sprint 19.5's orgId column landed.
--      For each NULL row we copy the user's most recent Clerk org id from
--      AuditLog (the closest stand-in for "what org was active when the
--      user connected"). Rows that still have no match are left NULL —
--      they'll get reclaimed when the user re-connects via OAuth.
--   3) Add UNIQUE(userId, orgId, provider). Postgres treats NULL orgIds
--      as distinct, so legacy NULL rows do not block the new index.
--
-- Idempotent.

-- 1) Drop old single-provider-per-user constraint, if present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE indexname = 'IntegrationConnection_userId_provider_key'
       AND schemaname = 'public'
  ) THEN
    DROP INDEX "IntegrationConnection_userId_provider_key";
  END IF;
END $$;

-- 2) Best-effort backfill of orgId from AuditLog. We pick the most
-- recently used Clerk org id we ever logged for that user.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'AuditLog'
  ) THEN
    UPDATE "IntegrationConnection" ic
       SET "orgId" = sub."orgId"
      FROM (
        SELECT DISTINCT ON ("actorUserId") "actorUserId", "orgId"
          FROM "AuditLog"
         WHERE "orgId" IS NOT NULL
         ORDER BY "actorUserId", "createdAt" DESC
      ) sub
     WHERE ic."orgId" IS NULL
       AND ic."userId" = sub."actorUserId";
  END IF;
END $$;

-- 3) Add the per-org unique constraint.
CREATE UNIQUE INDEX IF NOT EXISTS
  "IntegrationConnection_userId_orgId_provider_key"
  ON "IntegrationConnection"("userId", "orgId", "provider");
