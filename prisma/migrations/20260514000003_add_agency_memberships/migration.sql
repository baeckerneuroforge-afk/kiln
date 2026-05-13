-- Sprint 19.7.6 — agency-internal RBAC.
--
-- Adds two tables that let an agency operator delegate work to a team
-- without giving every member full access to every Sub-Org:
--
--   * AgencyMembership          — one row per (agencyClerkOrgId, userId)
--                                 with a role (OWNER/ADMIN/CONSULTANT/VIEWER).
--   * AgencyMemberSubOrgAccess  — explicit per-Sub-Org assignments for
--                                 CONSULTANT/VIEWER members; OWNER/ADMIN
--                                 skip this table and see all sub-orgs.
--                                 Optional permissionOverride lets the
--                                 owner override the default permission
--                                 set for a specific (member, sub-org)
--                                 pair.
--
-- Backfill: every distinct `createdBy` on OrgRelationship gets an
-- AgencyMembership row with role=OWNER for the corresponding agency,
-- with `acceptedAt = now()` so existing operators keep access on first
-- deploy. Rows are inserted with a deterministic `am_<md5>` id so the
-- statement is safely re-runnable.
--
-- Idempotent.

-- 1) AgencyRole enum.
DO $$ BEGIN
  CREATE TYPE "AgencyRole" AS ENUM ('OWNER', 'ADMIN', 'CONSULTANT', 'VIEWER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2) AgencyMembership table.
CREATE TABLE IF NOT EXISTS "AgencyMembership" (
  "id" TEXT NOT NULL,
  "agencyClerkOrgId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "AgencyRole" NOT NULL DEFAULT 'VIEWER',
  "invitedById" TEXT,
  "invitedAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgencyMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS
  "AgencyMembership_agencyClerkOrgId_userId_key"
  ON "AgencyMembership"("agencyClerkOrgId", "userId");

CREATE INDEX IF NOT EXISTS "AgencyMembership_userId_idx"
  ON "AgencyMembership"("userId");

CREATE INDEX IF NOT EXISTS "AgencyMembership_agencyClerkOrgId_role_idx"
  ON "AgencyMembership"("agencyClerkOrgId", "role");

-- 3) AgencyMemberSubOrgAccess table.
CREATE TABLE IF NOT EXISTS "AgencyMemberSubOrgAccess" (
  "id" TEXT NOT NULL,
  "agencyMembershipId" TEXT NOT NULL,
  "subOrgId" TEXT NOT NULL,
  "permissionOverride" "PermissionSet",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgencyMemberSubOrgAccess_pkey" PRIMARY KEY ("id")
);

-- Foreign keys idempotently — IF NOT EXISTS doesn't apply to constraints,
-- so we DO-block them with information_schema lookups.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'AgencyMemberSubOrgAccess_agencyMembershipId_fkey'
       AND table_schema = 'public'
  ) THEN
    ALTER TABLE "AgencyMemberSubOrgAccess"
      ADD CONSTRAINT "AgencyMemberSubOrgAccess_agencyMembershipId_fkey"
      FOREIGN KEY ("agencyMembershipId") REFERENCES "AgencyMembership"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'AgencyMemberSubOrgAccess_subOrgId_fkey'
       AND table_schema = 'public'
  ) THEN
    ALTER TABLE "AgencyMemberSubOrgAccess"
      ADD CONSTRAINT "AgencyMemberSubOrgAccess_subOrgId_fkey"
      FOREIGN KEY ("subOrgId") REFERENCES "OrgRelationship"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS
  "AgencyMemberSubOrgAccess_agencyMembershipId_subOrgId_key"
  ON "AgencyMemberSubOrgAccess"("agencyMembershipId", "subOrgId");

CREATE INDEX IF NOT EXISTS "AgencyMemberSubOrgAccess_subOrgId_idx"
  ON "AgencyMemberSubOrgAccess"("subOrgId");

-- 4) Backfill: every Sub-Org's creator gets an AGENCY_OWNER row for the
-- parent agency. Deterministic id so re-runs don't duplicate.
INSERT INTO "AgencyMembership"
  ("id", "agencyClerkOrgId", "userId", "role", "acceptedAt", "createdAt", "updatedAt")
SELECT
  'am_' || md5("parentOrgId" || ':' || "createdBy"),
  "parentOrgId",
  "createdBy",
  'OWNER'::"AgencyRole",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "parentOrgId", "createdBy" FROM "OrgRelationship"
) sources
ON CONFLICT ("agencyClerkOrgId", "userId") DO NOTHING;
