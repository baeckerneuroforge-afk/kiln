-- Sprint 19.7.6 — per-membership onboarding state.
--
-- The wizard lives on SubOrgMembership (not OrgRelationship) because the
-- state is per-user: a brand-new member joining an established Sub-Org
-- still needs to walk through "set up your profile / integrations / try
-- the agent" once. Existing memberships are treated as already-onboarded
-- so we backfill onboardingCompletedAt = acceptedAt for any row that has
-- ever accepted — they've been using the workspace and shouldn't see a
-- wizard on next login.
--
-- Idempotent.

ALTER TABLE "SubOrgMembership"
  ADD COLUMN IF NOT EXISTS "onboardingStepCompleted" INTEGER,
  ADD COLUMN IF NOT EXISTS "onboardingCompletedAt"   TIMESTAMP(3);

UPDATE "SubOrgMembership"
   SET "onboardingCompletedAt" = "acceptedAt"
 WHERE "acceptedAt" IS NOT NULL
   AND "onboardingCompletedAt" IS NULL;
