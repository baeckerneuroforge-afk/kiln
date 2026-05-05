-- Phase 3 — Stripe Connect: BUSINESS plan tier, agency Connect accounts,
-- sub-org subscriptions billed via Connected Accounts, cached invoices,
-- and pricing fields on the existing OrgRelationship.
--
-- All additive: no rows are touched, no columns dropped. Existing AGENCY
-- subscriptions stay grandfathered; the BUSINESS tier is new and starts
-- empty. Safe to apply with `prisma migrate deploy`.

-- 1. New plan tier
ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'BUSINESS';

-- 2. Sub-org pricing mode + status enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubOrgPricingMode') THEN
    CREATE TYPE "SubOrgPricingMode" AS ENUM ('NONE', 'FIXED', 'CUSTOM');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionStatus') THEN
    CREATE TYPE "SubscriptionStatus" AS ENUM (
      'INCOMPLETE', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'TRIALING'
    );
  END IF;
END$$;

-- 3. OrgRelationship pricing fields. Defaults keep existing rows in NONE.
ALTER TABLE "OrgRelationship"
  ADD COLUMN IF NOT EXISTS "pricingMode"       "SubOrgPricingMode" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "monthlyPriceCents" INTEGER,
  ADD COLUMN IF NOT EXISTS "setupFeeCents"     INTEGER,
  ADD COLUMN IF NOT EXISTS "pricingCurrency"   TEXT DEFAULT 'eur',
  ADD COLUMN IF NOT EXISTS "stripeProductId"   TEXT,
  ADD COLUMN IF NOT EXISTS "stripePriceId"     TEXT;

-- 4. AgencyStripeAccount — Connect Express accounts owned by agencies
CREATE TABLE IF NOT EXISTS "AgencyStripeAccount" (
    "id"                 TEXT NOT NULL,
    "orgId"              TEXT NOT NULL,
    "stripeAccountId"    TEXT NOT NULL,
    "onboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "detailsSubmitted"   BOOLEAN NOT NULL DEFAULT false,
    "payoutsEnabled"     BOOLEAN NOT NULL DEFAULT false,
    "chargesEnabled"     BOOLEAN NOT NULL DEFAULT false,
    "requirementsJson"   JSONB,
    "lastSyncedAt"       TIMESTAMP(3),
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgencyStripeAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AgencyStripeAccount_orgId_key"
  ON "AgencyStripeAccount"("orgId");
CREATE UNIQUE INDEX IF NOT EXISTS "AgencyStripeAccount_stripeAccountId_key"
  ON "AgencyStripeAccount"("stripeAccountId");

-- 5. SubOrgSubscription — sub-org's active subscription on the agency's
--    connected account.
CREATE TABLE IF NOT EXISTS "SubOrgSubscription" (
    "id"                   TEXT NOT NULL,
    "subOrgId"             TEXT NOT NULL,
    "parentAgencyOrgId"    TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "stripeCustomerId"     TEXT NOT NULL,
    "stripePriceId"        TEXT NOT NULL,
    "stripeProductId"      TEXT,
    "status"               "SubscriptionStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "currentPeriodEnd"     TIMESTAMP(3),
    "cancelAtPeriodEnd"    BOOLEAN NOT NULL DEFAULT false,
    "priceAmount"          INTEGER NOT NULL,
    "priceCurrency"        TEXT NOT NULL DEFAULT 'eur',
    "priceInterval"        TEXT NOT NULL DEFAULT 'month',
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SubOrgSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SubOrgSubscription_subOrgId_key"
  ON "SubOrgSubscription"("subOrgId");
CREATE UNIQUE INDEX IF NOT EXISTS "SubOrgSubscription_stripeSubscriptionId_key"
  ON "SubOrgSubscription"("stripeSubscriptionId");
CREATE INDEX IF NOT EXISTS "SubOrgSubscription_parentAgencyOrgId_idx"
  ON "SubOrgSubscription"("parentAgencyOrgId");
CREATE INDEX IF NOT EXISTS "SubOrgSubscription_status_idx"
  ON "SubOrgSubscription"("status");

-- 6. SubOrgInvoice — cached invoice snapshots
CREATE TABLE IF NOT EXISTS "SubOrgInvoice" (
    "id"                TEXT NOT NULL,
    "subOrgId"          TEXT NOT NULL,
    "parentAgencyOrgId" TEXT NOT NULL,
    "stripeInvoiceId"   TEXT NOT NULL,
    "amount"            INTEGER NOT NULL,
    "currency"          TEXT NOT NULL DEFAULT 'eur',
    "status"            TEXT NOT NULL,
    "invoiceDate"       TIMESTAMP(3) NOT NULL,
    "paidAt"            TIMESTAMP(3),
    "pdfUrl"            TEXT,
    "hostedInvoiceUrl"  TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubOrgInvoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SubOrgInvoice_stripeInvoiceId_key"
  ON "SubOrgInvoice"("stripeInvoiceId");
CREATE INDEX IF NOT EXISTS "SubOrgInvoice_parentAgencyOrgId_invoiceDate_idx"
  ON "SubOrgInvoice"("parentAgencyOrgId", "invoiceDate");
