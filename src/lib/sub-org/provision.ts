/**
 * Sprint 19.7.1 — shared sub-org provisioning helpers.
 *
 * Two concerns:
 *   1. Clerk org metadata — every sub-org Clerk org carries
 *      publicMetadata.kiln_type="sub_org" + parentAgencyOrgId so the
 *      webhook handler can distinguish sub-org events from agency or
 *      personal-workspace events without round-tripping our DB.
 *   2. KILN-side ownership — the agency user who creates a sub-org gets
 *      a SubOrgMembership row with role=OWNER + permissionSet=FULL_ACCESS
 *      so they keep full control even after the dashboard switches to
 *      per-membership permission checks.
 */
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

export const KILN_TYPE_SUB_ORG = "sub_org";
export const KILN_TYPE_AGENCY = "agency";

export type KilnOrgType = typeof KILN_TYPE_SUB_ORG | typeof KILN_TYPE_AGENCY;

/**
 * Shape we set on every sub-org Clerk Organization's publicMetadata.
 * The webhook handler reads this off the event payload — it never has
 * to hit our DB to know "is this a sub-org?".
 *
 * Index signature is required because Clerk's typegen for
 * OrganizationPublicMetadata is open-ended (`{ [k: string]: unknown }`).
 */
export interface SubOrgClerkMetadata {
  kiln_type: typeof KILN_TYPE_SUB_ORG;
  parentAgencyOrgId: string;
  [key: string]: unknown;
}

export interface AgencyClerkMetadata {
  kiln_type: typeof KILN_TYPE_AGENCY;
  [key: string]: unknown;
}

export function subOrgMetadata(parentAgencyOrgId: string): SubOrgClerkMetadata {
  return { kiln_type: KILN_TYPE_SUB_ORG, parentAgencyOrgId };
}

export function agencyMetadata(): AgencyClerkMetadata {
  return { kiln_type: KILN_TYPE_AGENCY };
}

/**
 * Insert the OWNER row for an agency user who just created a sub-org.
 * Idempotent — uses the unique (subOrgId, userId) constraint so a retry
 * never duplicates and never downgrades an existing row.
 */
export async function addOwnerMembership(
  args: {
    subOrgId: string;
    userId: string;
  },
  client: Pick<PrismaClient, "subOrgMembership"> = defaultPrisma,
) {
  const now = new Date();
  return client.subOrgMembership.upsert({
    where: { subOrgId_userId: { subOrgId: args.subOrgId, userId: args.userId } },
    create: {
      subOrgId: args.subOrgId,
      userId: args.userId,
      role: "OWNER",
      permissionSet: "FULL_ACCESS",
      acceptedAt: now,
    },
    update: {},
  });
}
