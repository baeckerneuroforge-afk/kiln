-- Sprint 19.7.1 — Sub-Org Auth Foundation.
--
-- Adds SubOrgMembership table + the two enums it needs. The migration is
-- additive only: OrgRelationship rows keep working unchanged. Sub-org
-- "clerkOrgId" already exists as OrgRelationship.childOrgId, so no new
-- column is needed for that linkage.
--
-- Fully idempotent — safe to re-run on production.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubOrgRole') THEN
    CREATE TYPE "SubOrgRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PermissionSet') THEN
    CREATE TYPE "PermissionSet" AS ENUM (
      'READ_ONLY',
      'USE_AGENTS',
      'USE_AGENTS_PLUS_KNOWLEDGE',
      'FULL_ACCESS'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SubOrgMembership" (
  "id" TEXT NOT NULL,
  "subOrgId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "SubOrgRole" NOT NULL DEFAULT 'MEMBER',
  "permissionSet" "PermissionSet" NOT NULL DEFAULT 'READ_ONLY',
  "invitedById" TEXT,
  "invitedAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SubOrgMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SubOrgMembership_subOrgId_userId_key"
  ON "SubOrgMembership"("subOrgId", "userId");

CREATE INDEX IF NOT EXISTS "SubOrgMembership_userId_idx"
  ON "SubOrgMembership"("userId");

CREATE INDEX IF NOT EXISTS "SubOrgMembership_subOrgId_role_idx"
  ON "SubOrgMembership"("subOrgId", "role");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SubOrgMembership_subOrgId_fkey'
  ) THEN
    ALTER TABLE "SubOrgMembership"
      ADD CONSTRAINT "SubOrgMembership_subOrgId_fkey"
      FOREIGN KEY ("subOrgId") REFERENCES "OrgRelationship"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
