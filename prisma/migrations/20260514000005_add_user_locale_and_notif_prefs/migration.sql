-- Sprint 19.7.8 — per-user email locale + granular notification toggles.
--
-- `preferredLanguage` defaults to "de" (DACH-first). The i18n resolver
-- collapses unknown values to "de" so an unmigrated NULL or stray value
-- never breaks a send. We backfill existing rows to "de" explicitly so
-- audits show the choice was deliberate, not a column default that
-- happened to win.
--
-- `notificationPreferences` is a JSON map keyed by event-type
-- ("sub_org_invited", "agency_invited", "onboarding_completed", …).
-- Missing keys default to enabled in code; the existing
-- `emailNotifications` boolean remains as a master kill-switch so users
-- who set it false stay opted out of everything.
--
-- Idempotent.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "preferredLanguage"       TEXT NOT NULL DEFAULT 'de',
  ADD COLUMN IF NOT EXISTS "notificationPreferences" JSONB;

-- Belt-and-braces for any row that pre-existed the column with a NULL via
-- some odd path (NOT NULL above should prevent it, but safe anyway).
UPDATE "User"
   SET "preferredLanguage" = 'de'
 WHERE "preferredLanguage" IS NULL;
