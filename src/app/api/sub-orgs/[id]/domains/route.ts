/**
 * Sprint 19.8 — sub-org custom-domain CRUD.
 *
 * GET  → list domains attached to this sub-org
 * POST → register a new hostname (calls Vercel + creates CustomDomain row)
 *
 * Auth: caller must have an OWNER/ADMIN SubOrgMembership for the sub-org
 * OR `memberships.manage` permission. We re-use `canManageSubOrgMembers`
 * because domain management is a workspace-administration concern at
 * the same trust level as inviting/removing members.
 *
 * Cross-tenant access returns 404 (existence-hiding), not 403, so
 * sub-org-ids can't be probed by ID-guessing.
 */
import { auth } from "@clerk/nextjs/server";
import {
  canManageSubOrgMembers,
  getUserSubOrgMembership,
} from "@/lib/permissions/sub-org-permissions";
import {
  createCustomDomain,
  listDomainsForSubOrg,
} from "@/lib/domains/domain-manager";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const callerMembership = await getUserSubOrgMembership(userId, params.id);
  if (!callerMembership) {
    return Response.json({ error: "Sub-org not found" }, { status: 404 });
  }
  // Listing is read-only — any member can see what's been wired up.
  // Mutation requires OWNER/ADMIN. The UI hides the add/delete buttons
  // for non-managers, but defense-in-depth on POST/DELETE handlers.
  const domains = await listDomainsForSubOrg({ subOrgId: params.id });
  return Response.json({
    domains: domains.map((d) => ({
      id: d.id,
      hostname: d.hostname,
      status: d.status,
      sslStatus: d.sslStatus,
      sslIssuedAt: d.sslIssuedAt,
      isPrimary: d.isPrimary,
      createdAt: d.createdAt,
    })),
    canManage: canManageSubOrgMembers(callerMembership),
  });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const callerMembership = await getUserSubOrgMembership(userId, params.id);
  if (!callerMembership) {
    return Response.json({ error: "Sub-org not found" }, { status: 404 });
  }
  if (!canManageSubOrgMembers(callerMembership)) {
    return Response.json(
      { error: "Insufficient permission", permission: "memberships.manage" },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    hostname?: unknown;
  };
  if (typeof body.hostname !== "string" || !body.hostname.trim()) {
    return Response.json({ error: "hostname is required" }, { status: 400 });
  }

  const result = await createCustomDomain({
    subOrgId: params.id,
    hostname: body.hostname,
  });
  if (!result.ok) {
    const status =
      result.code === "invalid_hostname"
        ? 400
        : result.code === "hostname_taken"
          ? 409
          : result.code === "sub_org_not_found"
            ? 404
            : 502;
    return Response.json({ error: result.error, code: result.code }, { status });
  }

  return Response.json({
    id: result.domain.id,
    hostname: result.domain.hostname,
    status: result.domain.status,
    verification: result.verification ?? [],
    // Convenience: the typical Vercel guidance is a CNAME to cname.vercel-dns.com
    // for sub-domains and an A-record for apex domains. We surface
    // both so the UI can show the right one without re-checking.
    dnsHint: hostnameLooksApex(result.domain.hostname)
      ? {
          type: "A",
          name: "@",
          value: "76.76.21.21",
        }
      : {
          type: "CNAME",
          name: leftmostLabel(result.domain.hostname),
          value: "cname.vercel-dns.com",
        },
  });
}

function hostnameLooksApex(hostname: string): boolean {
  // Heuristic: an apex has exactly two labels for a plain TLD
  // (example.com) or three labels for a known SLD (example.co.uk).
  // Conservatively call anything with ≤ 2 labels apex. The Vercel
  // dashboard will tell the user the exact records anyway.
  return hostname.split(".").length <= 2;
}

function leftmostLabel(hostname: string): string {
  return hostname.split(".")[0] ?? hostname;
}
