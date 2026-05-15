-- Sprint 19.8 — Custom-domains for sub-orgs.
--
-- One sub-org can register one or more hostnames (e.g. ai.muellergmbh.de).
-- KILN registers the hostname with Vercel's Domains API; Vercel handles
-- DNS verification + Let's-Encrypt issuance. Middleware uses the
-- (hostname → subOrgId) mapping to rewrite incoming traffic to
-- /dashboard/sub-org/[id]/...
--
-- hostname is globally unique because Vercel domains are project-global —
-- the same hostname can't simultaneously route to two different sub-orgs.
-- ON DELETE CASCADE on subOrgId mirrors how SubOrgMembership is cleaned
-- up: deleting a sub-org tears down its domains too.
--
-- Idempotent (DO blocks + IF NOT EXISTS).

DO $$ BEGIN
  CREATE TYPE "CustomDomainStatus" AS ENUM ('PENDING', 'VERIFYING', 'ACTIVE', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "CustomDomain" (
  "id"                TEXT                 PRIMARY KEY,
  "subOrgId"          TEXT                 NOT NULL,
  "hostname"          TEXT                 NOT NULL,
  "status"            "CustomDomainStatus" NOT NULL DEFAULT 'PENDING',
  "verificationToken" TEXT,
  "vercelDomainId"    TEXT,
  "sslStatus"         TEXT,
  "sslIssuedAt"       TIMESTAMP(3),
  "isPrimary"         BOOLEAN              NOT NULL DEFAULT TRUE,
  "createdAt"         TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomDomain_subOrgId_fkey"
    FOREIGN KEY ("subOrgId") REFERENCES "OrgRelationship"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomDomain_hostname_key" ON "CustomDomain" ("hostname");
CREATE INDEX IF NOT EXISTS "CustomDomain_subOrgId_idx"        ON "CustomDomain" ("subOrgId");
CREATE INDEX IF NOT EXISTS "CustomDomain_status_idx"          ON "CustomDomain" ("status");
