/**
 * POST /api/agency/login-as-client — agency owner records intent to act
 * inside one of their sub-orgs.
 *
 * What this endpoint does NOT do: change the active org. The active-org
 * flip happens client-side via Clerk's setActive() after this endpoint
 * confirms the agency owns the sub-org and writes the audit log. Doing
 * the flip client-side keeps the JWT round-trip in one place — Clerk's
 * frontend SDK is the only thing that can write the new session token.
 *
 * The endpoint's two real jobs are:
 *   1. Verify the caller's agency owns the requested sub-org (return
 *      404 otherwise to avoid existence leak).
 *   2. Write a tamper-evident audit row so we can prove later who
 *      acted as which client at which time.
 *
 * Response: { ok, childOrgId, name } — frontend uses childOrgId for
 * setActive().
 */
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { AuditLogger } from "@/lib/audit/audit-logger";

export const dynamic = "force-dynamic";

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  const { userId, orgId: agencyOrgId } = await auth();
  if (!userId) return unauthorized();
  if (!agencyOrgId) {
    return Response.json(
      { error: "No active agency org. Switch to your agency first." },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { subOrgId?: unknown };
  const requested =
    typeof body.subOrgId === "string" ? body.subOrgId.trim() : "";
  if (!requested) {
    return Response.json({ error: "subOrgId is required" }, { status: 400 });
  }

  // Look up the relationship by either the OrgRelationship.id or the
  // Clerk childOrgId — frontends may have the convenient one. parentOrgId
  // gate prevents impersonating a sub-org that belongs to another agency.
  const relationship = await prisma.orgRelationship.findFirst({
    where: {
      parentOrgId: agencyOrgId,
      OR: [{ id: requested }, { childOrgId: requested }],
    },
  });
  if (!relationship) {
    return Response.json({ error: "Sub-org not found" }, { status: 404 });
  }
  if (relationship.subOrgStatus !== "ACTIVE") {
    return Response.json(
      { error: "Sub-org is archived or suspended — login disabled" },
      { status: 400 }
    );
  }

  await AuditLogger.log({
    userId,
    category: "portal",
    action: "agency.login_as_client",
    resourceId: relationship.id,
    resourceType: "OrgRelationship",
    details: {
      agencyOrgId,
      childOrgId: relationship.childOrgId,
      subOrgName: relationship.subOrgName,
    },
    severity: "info",
  });

  return Response.json({
    ok: true,
    childOrgId: relationship.childOrgId,
    name: relationship.subOrgName,
  });
}
