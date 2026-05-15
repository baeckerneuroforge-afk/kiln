-- Sprint 19.8.1 — Agency-level whitelabel custom domains.
--
-- Sister table to CustomDomain (Sprint 19.8). Where CustomDomain ties
-- a hostname to a specific sub-org, AgencyDomain ties it to a parent
-- agency Clerk org, and middleware uses it as a smart-routing entry
-- point: the user logs in on the agency domain, then gets routed to
-- their sub-org workspace (or a selector when they have multiple).
--
-- hostname is globally unique across BOTH AgencyDomain and CustomDomain
-- because Vercel project domains are project-global. The application
-- enforces the cross-table uniqueness in the hostname validator at
-- write time; postgres only sees the per-table unique constraint.
--
-- agencyOrgId is the Clerk-Org-ID as TEXT (no FK) to match the existing
-- OrgBranding / AgencyMembership pattern — KILN has no Org table; the
-- agency identity lives in Clerk.
--
-- Idempotent (DO block for the enum, IF NOT EXISTS for the table/indexes).

DO $$ BEGIN
  CREATE TYPE "AgencyDomainStatus" AS ENUM ('PENDING', 'VERIFYING', 'ACTIVE', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "AgencyDomain" (
  "id"                TEXT                 PRIMARY KEY,
  "agencyOrgId"       TEXT                 NOT NULL,
  "hostname"          TEXT                 NOT NULL,
  "status"            "AgencyDomainStatus" NOT NULL DEFAULT 'PENDING',
  "verificationToken" TEXT,
  "vercelDomainId"    TEXT,
  "sslStatus"         TEXT,
  "sslIssuedAt"       TIMESTAMP(3),
  "isPrimary"         BOOLEAN              NOT NULL DEFAULT TRUE,
  "createdAt"         TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgencyDomain_hostname_key"   ON "AgencyDomain" ("hostname");
CREATE INDEX        IF NOT EXISTS "AgencyDomain_agencyOrgId_idx" ON "AgencyDomain" ("agencyOrgId");
CREATE INDEX        IF NOT EXISTS "AgencyDomain_status_idx"      ON "AgencyDomain" ("status");
