-- Phase 5 — White-label email branding for Agency (OrgBranding) and Sub-Org (OrgRelationship).
-- Idempotent guards because production is applied manually via Supabase SQL Editor.

ALTER TABLE "OrgBranding" ADD COLUMN IF NOT EXISTS "emailFromAddress" TEXT;
ALTER TABLE "OrgBranding" ADD COLUMN IF NOT EXISTS "emailFromName" TEXT;
ALTER TABLE "OrgBranding" ADD COLUMN IF NOT EXISTS "emailReplyTo" TEXT;
ALTER TABLE "OrgBranding" ADD COLUMN IF NOT EXISTS "emailFooterHtml" TEXT;
ALTER TABLE "OrgBranding" ADD COLUMN IF NOT EXISTS "emailSupportLink" TEXT;

ALTER TABLE "OrgRelationship" ADD COLUMN IF NOT EXISTS "emailBrandOverride" JSONB;
