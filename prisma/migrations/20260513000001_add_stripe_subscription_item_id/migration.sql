-- Sprint 19.5 — track the Stripe subscription-item created for each
-- pool-mode active module. Null in BYOK modes (no charge) and when the
-- billing service skipped the sync because env vars are not yet set.
-- Idempotent.

ALTER TABLE "SubAccountModuleConfig"
  ADD COLUMN IF NOT EXISTS "stripeSubscriptionItemId" TEXT;

-- Helper index for the reconcile sweep: cheap lookups of all rows that
-- have a stripe item id (regardless of mode) for drift detection.
CREATE INDEX IF NOT EXISTS "SubAccountModuleConfig_stripeSubscriptionItemId_idx"
  ON "SubAccountModuleConfig"("stripeSubscriptionItemId");
