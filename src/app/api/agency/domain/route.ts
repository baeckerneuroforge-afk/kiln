/**
 * Sprint 19.8.1 — agency-domain GET + POST.
 *
 * Auth model:
 *   GET  — any agency member can list (read is open)
 *   POST — agency OWNER only (analogous to billing.manage — this is
 *          a one-row-per-agency premium feature that ties the
 *          agency's identity to a customer-facing URL).
 *
 * The agency context comes from auth().orgId (Clerk's active org for
 * the caller). Callers in sub-org-mode get 400.
 *
 * Single-row invariant: one AgencyDomain per agency. POST returns
 * `agency_domain_exists` (409) if the agency already has one — the
 * UI shows the existing row instead.
 */
import { auth } from "@clerk/nextjs/server";
import { requireAgencyAccess } from "@/lib/permissions/require-agency-access";
import {
  createAgencyDomain,
  listAgencyDomains,
} from "@/lib/domains/agency-domain-manager";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId, orgId: agencyOrgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!agencyOrgId) {
    return Response.json({ error: "No active organization." }, { status: 400 });
  }

  const access = await requireAgencyAccess(agencyOrgId, "sub-orgs.read");
  if (!access.ok) return access.response;

  const domains = await listAgencyDomains({ agencyOrgId });
  return Response.json({
    domain: domains[0] ?? null,
    canManage: access.membership.role === "OWNER",
    canVerify:
      access.membership.role === "OWNER" || access.membership.role === "ADMIN",
  });
}

export async function POST(request: Request) {
  const { userId, orgId: agencyOrgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!agencyOrgId) {
    return Response.json({ error: "No active organization." }, { status: 400 });
  }

  // POST is OWNER-only — registering an agency domain is a high-trust
  // operation comparable to billing changes.
  const access = await requireAgencyAccess(agencyOrgId);
  if (!access.ok) return access.response;
  if (access.membership.role !== "OWNER") {
    return Response.json(
      { error: "Only an agency OWNER can register a domain" },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { hostname?: unknown };
  if (typeof body.hostname !== "string" || !body.hostname.trim()) {
    return Response.json({ error: "hostname is required" }, { status: 400 });
  }

  const result = await createAgencyDomain({
    agencyOrgId,
    hostname: body.hostname,
  });
  if (!result.ok) {
    const status =
      result.code === "invalid_hostname"
        ? 400
        : result.code === "hostname_taken" ||
            result.code === "agency_domain_exists"
          ? 409
          : 502;
    return Response.json({ error: result.error, code: result.code }, { status });
  }

  // CNAME-vs-A hint matching Sprint 19.8 conventions.
  const dnsHint = hostnameLooksApex(result.domain.hostname)
    ? {
        type: "A" as const,
        name: "@",
        value: "76.76.21.21",
      }
    : {
        type: "CNAME" as const,
        name: leftmostLabel(result.domain.hostname),
        value: "cname.vercel-dns.com",
      };

  return Response.json({
    id: result.domain.id,
    hostname: result.domain.hostname,
    status: result.domain.status,
    verification: result.verification ?? [],
    dnsHint,
  });
}

function hostnameLooksApex(hostname: string): boolean {
  return hostname.split(".").length <= 2;
}

function leftmostLabel(hostname: string): string {
  return hostname.split(".")[0] ?? hostname;
}
