/**
 * Sprint 19.8.1 — Agency branding lookup for the whitelabel entry
 * point and the sign-in page when called from an agency domain.
 *
 * Single source of truth for "what colors / logo / name do we render
 * when the user is on an agency-domain". Reads from the existing
 * OrgBranding row by orgId; falls back to a minimal default so the
 * page renders even when an agency hasn't set their branding yet.
 *
 * The shape is intentionally JSON-serializable so a server component
 * can hand it to a client component without conversion.
 */
import { prisma } from "@/lib/prisma";

export interface AgencyBranding {
  agencyOrgId: string;
  agencyName: string;
  logoUrl: string | null;
  primaryColor: string;
  /** Hostname the user is currently visiting (for "Welcome to ai.x.de") */
  hostname: string;
}

const KILN_DEFAULT_COLOR = "#F97316";

export async function loadAgencyBranding(args: {
  agencyOrgId: string;
  hostname: string;
}): Promise<AgencyBranding> {
  const row = await prisma.orgBranding.findUnique({
    where: { orgId: args.agencyOrgId },
    select: { agencyName: true, logoUrl: true, primaryColor: true },
  });
  return {
    agencyOrgId: args.agencyOrgId,
    agencyName: row?.agencyName ?? args.hostname,
    logoUrl: row?.logoUrl ?? null,
    primaryColor: row?.primaryColor ?? KILN_DEFAULT_COLOR,
    hostname: args.hostname,
  };
}
