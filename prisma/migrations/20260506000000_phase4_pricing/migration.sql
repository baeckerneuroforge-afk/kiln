-- Phase 4 — White-labeled pricing flow.
--
-- Splits the sub-org pricing into two Stripe prices on the same product
-- (recurring monthly + one-time setup) plus an optional trial. Adds
-- invoice categorization so the agency dashboard can separate MRR from
-- one-time setup revenue.
--
-- All additive except the column rename. RENAME COLUMN preserves data.

-- 1. OrgRelationship: rename stripePriceId → stripeMonthlyPriceId so the
--    semantics line up with the new stripeSetupPriceId. RENAME COLUMN
--    is non-destructive in Postgres.
ALTER TABLE "OrgRelationship"
  RENAME COLUMN "stripePriceId" TO "stripeMonthlyPriceId";

-- 2. New columns: setup-fee price ID + optional trial in days.
ALTER TABLE "OrgRelationship"
  ADD COLUMN IF NOT EXISTS "stripeSetupPriceId" TEXT,
  ADD COLUMN IF NOT EXISTS "trialDays"          INTEGER;

-- 3. InvoiceType enum + column on SubOrgInvoice. Defaults to SUBSCRIPTION
--    so existing rows from Phase 3 keep their meaning (everything written
--    so far has been monthly recurring).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InvoiceType') THEN
    CREATE TYPE "InvoiceType" AS ENUM ('SUBSCRIPTION', 'SETUP_FEE', 'ADD_ON');
  END IF;
END$$;

ALTER TABLE "SubOrgInvoice"
  ADD COLUMN IF NOT EXISTS "invoiceType" "InvoiceType" NOT NULL DEFAULT 'SUBSCRIPTION';
