-- Phase 2.3c — Custom Domain support
--
-- Adds three nullable / default-false columns to OrgBranding so an agency
-- can point a hostname at its workspace. Pure additive — no existing
-- branding row is touched. Apply with `prisma migrate deploy`.

ALTER TABLE "OrgBranding"
  ADD COLUMN "customDomain"     TEXT,
  ADD COLUMN "domainVerified"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "domainVerifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "OrgBranding_customDomain_key" ON "OrgBranding"("customDomain");
CREATE INDEX "OrgBranding_customDomain_idx" ON "OrgBranding"("customDomain");
