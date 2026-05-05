/**
 * POST /api/agency/sub-orgs/[id]/invite — invite a user to a sub-org via
 * Clerk's org invitation flow. Clerk sends the invitation email; we
 * just route the request so the agency owner doesn't have to leave the
 * KILN UI.
 *
 * Auth: caller must own the agency org that this sub-org belongs to.
 * Sub-org ownership is verified via the OrgRelationship row before the
 * Clerk call — same 404-instead-of-403 shape as the DELETE handler.
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VALID_ROLES = new Set<"org:admin" | "org:member">([
  "org:admin",
  "org:member",
]);

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { userId, orgId: agencyOrgId } = await auth();
  if (!userId) return unauthorized();
  if (!agencyOrgId) {
    return Response.json(
      { error: "No active organization." },
      { status: 400 }
    );
  }

  const relationship = await prisma.orgRelationship.findFirst({
    where: { id: params.id, parentOrgId: agencyOrgId },
  });
  if (!relationship) {
    return Response.json({ error: "Sub-org not found" }, { status: 404 });
  }
  if (relationship.subOrgStatus !== "ACTIVE") {
    return Response.json(
      { error: "Sub-org is archived or suspended" },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: unknown;
    role?: unknown;
  };
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const role =
    typeof body.role === "string" && VALID_ROLES.has(body.role as "org:admin")
      ? (body.role as "org:admin" | "org:member")
      : "org:member";

  if (!email || !email.includes("@")) {
    return Response.json({ error: "valid email required" }, { status: 400 });
  }

  const client = await clerkClient();
  try {
    const invitation =
      await client.organizations.createOrganizationInvitation({
        organizationId: relationship.childOrgId,
        emailAddress: email,
        role,
        inviterUserId: userId,
      });
    return Response.json({
      id: invitation.id,
      email: invitation.emailAddress,
      role: invitation.role,
      status: invitation.status,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invite failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
