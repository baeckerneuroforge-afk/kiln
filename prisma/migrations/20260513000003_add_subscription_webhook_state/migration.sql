-- Sprint 19.5.3 — webhook bookkeeping columns on AgencyPlatformSubscription:
--   invoiceFailedAt          — opens the 7-day grace window on first failure;
--                              cleared on next successful payment.
--   lastSubscriptionEventId  — Stripe event id idempotency for subscription.*
--   lastInvoiceEventId       — Stripe event id idempotency for invoice.*
-- Idempotent.

ALTER TABLE "AgencyPlatformSubscription"
  ADD COLUMN IF NOT EXISTS "invoiceFailedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastSubscriptionEventId" TEXT,
  ADD COLUMN IF NOT EXISTS "lastInvoiceEventId" TEXT;

CREATE INDEX IF NOT EXISTS "AgencyPlatformSubscription_invoiceFailedAt_idx"
  ON "AgencyPlatformSubscription"("invoiceFailedAt");
