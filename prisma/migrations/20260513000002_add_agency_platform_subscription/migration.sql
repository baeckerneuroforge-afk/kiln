-- Sprint 19.5.1 — AgencyPlatformSubscription: per-agency-org platform
-- subscription that KILN bills (opposite direction from AgencyStripeAccount
-- which is the agency's connected account for receiving sub-org payments).
-- Idempotent.

CREATE TABLE IF NOT EXISTS "AgencyPlatformSubscription" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "stripeCustomerId" TEXT NOT NULL,
  "stripeSubscriptionId" TEXT,
  "tierSubscriptionItemId" TEXT,
  "tier" TEXT NOT NULL DEFAULT 'starter',
  "status" TEXT NOT NULL DEFAULT 'incomplete',
  "currentPeriodEnd" TIMESTAMP(3),
  "trialEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "createdSource" TEXT NOT NULL DEFAULT 'api',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgencyPlatformSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgencyPlatformSubscription_orgId_key"
  ON "AgencyPlatformSubscription"("orgId");
CREATE UNIQUE INDEX IF NOT EXISTS "AgencyPlatformSubscription_stripeCustomerId_key"
  ON "AgencyPlatformSubscription"("stripeCustomerId");
CREATE UNIQUE INDEX IF NOT EXISTS "AgencyPlatformSubscription_stripeSubscriptionId_key"
  ON "AgencyPlatformSubscription"("stripeSubscriptionId");
CREATE INDEX IF NOT EXISTS "AgencyPlatformSubscription_status_idx"
  ON "AgencyPlatformSubscription"("status");
CREATE INDEX IF NOT EXISTS "AgencyPlatformSubscription_tier_status_idx"
  ON "AgencyPlatformSubscription"("tier", "status");
