/**
 * GET    /api/agency/sub-orgs  — list sub-orgs for the active agency org.
 * POST   /api/agency/sub-orgs  — create a new sub-org under the active
 *                                agency org.
 *
 * Auth: caller must be in an active org (the agency) and must be allowed
 * to manage sub-orgs (see lib/agency/permissions.ts → canCreateSubOrg
 * for the full plan-tier and capacity gating).
 *
 * The new sub-org is a real Clerk Organization. We create it via the
 * Clerk Backend SDK with `createdBy` set to the agency owner so they're
 * automatically added as `org:admin` of the child workspace — meaning
 * they can switch into it via the OrganizationSwitcher and operate as
 * the client without a separate invite flow.
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { canCreateSubOrg } from "@/lib/agency/permissions";
import {
  ensureAgencyMembershipFromClerkRole,
  permissionsForAgencyRole,
} from "@/lib/permissions/agency-permissions";
import { addOwnerMembership, subOrgMetadata } from "@/lib/sub-org/provision";

export const dynamic = "force-dynamic";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function noActiveOrg() {
  return Response.json(
    { error: "No active organization. Switch to your agency org first." },
    { status: 400 }
  );
}

// GET — list sub-orgs of the active agency.
export async function GET() {
  const { userId, orgId: agencyOrgId } = await auth();
  if (!userId) return unauthorized();
  if (!agencyOrgId) return noActiveOrg();

  const subOrgs = await prisma.orgRelationship.findMany({
    where: { parentOrgId: agencyOrgId },
    orderBy: { createdAt: "desc" },
  });

  // Enrich with cached agent counts per sub-org so the list page can
  // render without a separate /api/v1/agents fan-out. Agent counts come
  // from the Agent table (org-scoped after Phase 2.2).
  const ids = subOrgs.map((r) => r.childOrgId);
  const counts =
    ids.length > 0
      ? await prisma.agent.groupBy({
          by: ["orgId"],
          where: { orgId: { in: ids } },
          _count: { _all: true },
        })
      : [];
  const countByOrg = new Map(counts.map((c) => [c.orgId ?? "", c._count._all]));

  return Response.json({
    subOrgs: subOrgs.map((r) => ({
      id: r.id,
      childOrgId: r.childOrgId,
      name: r.subOrgName,
      status: r.subOrgStatus,
      createdAt: r.createdAt.toISOString(),
      agentCount: countByOrg.get(r.childOrgId) ?? 0,
    })),
  });
}

// POST — create a new sub-org under the active agency.
export async function POST(request: Request) {
  const { userId, orgId: agencyOrgId, orgRole } = await auth();
  if (!userId) return unauthorized();
  if (!agencyOrgId) return noActiveOrg();

  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const rawName = typeof body.name === "string" ? body.name.trim() : "";
  if (!rawName) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  if (rawName.length > 100) {
    return Response.json(
      { error: "name must be 100 characters or fewer" },
      { status: 400 }
    );
  }

  const decision = await canCreateSubOrg(userId, agencyOrgId);
  if (!decision.allowed) {
    const status =
      decision.reason === "capacity_reached"
        ? 403
        : decision.reason === "wrong_tier"
          ? 403
          : 401;
    return Response.json(
      {
        error:
          decision.reason === "capacity_reached"
            ? `Sub-org limit reached (${decision.current}/${decision.max}). Archive an existing sub-org or upgrade your plan.`
            : "Your plan does not include sub-org management. Upgrade to AGENCY or higher.",
        reason: decision.reason,
        max: decision.max,
        current: decision.current,
      },
      { status }
    );
  }

  // Sprint 19.7.6 — sub-orgs.create gate. OWNER + ADMIN qualify;
  // CONSULTANT/VIEWER cannot mint new sub-orgs. Bootstrap the OWNER
  // row for legacy Clerk org-admins on first hit. Runs after the plan-
  // tier check so the "upgrade your plan" message wins over the
  // role error for users on the wrong tier entirely.
  const membership = await ensureAgencyMembershipFromClerkRole(
    userId,
    agencyOrgId,
    orgRole ?? null,
  );
  if (!membership || !permissionsForAgencyRole(membership.role).has("sub-orgs.create")) {
    return Response.json(
      { error: "Insufficient permission", permission: "sub-orgs.create" },
      { status: 403 },
    );
  }

  // Create the Clerk org with the agency owner as creator/admin. The
  // publicMetadata tag lets the clerk webhook recognise sub-org events
  // without a DB round-trip (Sprint 19.7.1).
  const client = await clerkClient();
  const newOrg = await client.organizations.createOrganization({
    name: rawName,
    createdBy: userId,
    publicMetadata: subOrgMetadata(agencyOrgId),
  });

  // Persist the parent → child link.
  const relationship = await prisma.orgRelationship.create({
    data: {
      parentOrgId: agencyOrgId,
      childOrgId: newOrg.id,
      createdBy: userId,
      subOrgName: rawName,
    },
  });

  // Agency owner gets OWNER/FULL_ACCESS on the new sub-org so subsequent
  // permission checks recognise them without a separate invite.
  await addOwnerMembership({ subOrgId: relationship.id, userId });

  return Response.json(
    {
      id: relationship.id,
      childOrgId: newOrg.id,
      name: rawName,
      status: relationship.subOrgStatus,
      createdAt: relationship.createdAt.toISOString(),
      agentCount: 0,
    },
    { status: 201 }
  );
}
