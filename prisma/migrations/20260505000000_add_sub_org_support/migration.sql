-- Phase 2.3b — Sub-Org Hierarchy (Agency-Tier)
--
-- Adds two new tables for Agency → Sub-Org relationships and per-org
-- white-label branding. Both are additive — no existing rows touched —
-- so the migration is safe to apply with `prisma migrate deploy`.
--
-- The actual Clerk Organizations live in Clerk; this table just records
-- the parent → child link plus a status flag and cached display name so
-- the Agency dashboard doesn't have to round-trip Clerk for every list.

CREATE TYPE "SubOrgStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

CREATE TABLE "OrgRelationship" (
    "id" TEXT NOT NULL,
    "parentOrgId" TEXT NOT NULL,
    "childOrgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "subOrgName" TEXT NOT NULL,
    "subOrgStatus" "SubOrgStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "OrgRelationship_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgRelationship_childOrgId_key" ON "OrgRelationship"("childOrgId");
CREATE INDEX "OrgRelationship_parentOrgId_idx" ON "OrgRelationship"("parentOrgId");
CREATE INDEX "OrgRelationship_childOrgId_idx" ON "OrgRelationship"("childOrgId");
CREATE INDEX "OrgRelationship_parentOrgId_subOrgStatus_idx" ON "OrgRelationship"("parentOrgId", "subOrgStatus");

CREATE TABLE "OrgBranding" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT,
    "showAgencyLogo" BOOLEAN NOT NULL DEFAULT true,
    "agencyName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgBranding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgBranding_orgId_key" ON "OrgBranding"("orgId");
