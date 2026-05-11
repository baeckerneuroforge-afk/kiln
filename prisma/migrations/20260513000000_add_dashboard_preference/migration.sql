-- Sprint 19.6 — dashboardPreference column on User controls which view
-- /dashboard renders: 'auto' (default), 'onboarding', or 'operations'.
-- Idempotent: only adds the column if missing.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "dashboardPreference" TEXT NOT NULL DEFAULT 'auto';
