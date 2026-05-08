-- Apply in Supabase SQL Editor for Phase 5 white-label email branding.
-- After apply, mark resolved:
-- npx prisma migrate resolve --applied 20260508000006_add_email_branding

ALTER TABLE "OrgBranding" ADD COLUMN IF NOT EXISTS "emailFromAddress" TEXT;
ALTER TABLE "OrgBranding" ADD COLUMN IF NOT EXISTS "emailFromName" TEXT;
ALTER TABLE "OrgBranding" ADD COLUMN IF NOT EXISTS "emailReplyTo" TEXT;
ALTER TABLE "OrgBranding" ADD COLUMN IF NOT EXISTS "emailFooterHtml" TEXT;
ALTER TABLE "OrgBranding" ADD COLUMN IF NOT EXISTS "emailSupportLink" TEXT;

ALTER TABLE "OrgRelationship" ADD COLUMN IF NOT EXISTS "emailBrandOverride" JSONB;
