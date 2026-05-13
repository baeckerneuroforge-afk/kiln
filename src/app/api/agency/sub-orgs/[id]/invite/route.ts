/**
 * POST /api/agency/sub-orgs/[id]/invite — invite a user to a sub-org.
 *
 * Two paths:
 *   1. New email → Clerk org invitation; Clerk sends the sign-up email
 *      and our webhook materialises the SubOrgMembership on acceptance
 *      (carrying role + permissionSet through invitation publicMetadata).
 *   2. Existing Clerk user → direct addOrganizationMembership; we
 *      synchronously create the SubOrgMembership ourselves so the user
 *      can start using the workspace right away.
 *
 * Auth (Sprint 19.7.6.2 rewrite): SubOrgMembership-driven, NOT agency-
 * driven. Authorization is "does this user have an OWNER/ADMIN role on
 * this sub-org, or a PermissionSet that includes memberships.manage"
 * — see canManageSubOrgMembers. The old "must own the agency that
 * this sub-org belongs to" gate broke for sub-org-mode end-users
 * (their active Clerk org is the sub-org itself, not the parent
 * agency, so the parentOrgId filter never matched) and was also the
 * wrong mental model: the membership IS the source of truth.
 *
 * Cross-tenant access still returns 404 (not 403) so existence
 * cannot be probed by ID-guessing.
 *
 * NOTE: this route now uses SubOrgMembership for auth, but the other
 * /api/agency/sub-orgs/[id]/* routes still go through lib/agency/sub-
 * org-auth.ts which keeps the old parentOrgId-driven model. They're
 * not user-facing in sub-org-mode today (pages fetch via Prisma),
 * but the inconsistency is architectural tech-debt. Consolidation is
 * scheduled for Sprint 19.7.7 — see the TODO comment at the top of
 * lib/agency/sub-org-auth.ts.
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import type { PermissionSet, SubOrgRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  canManageSubOrgMembers,
  getUserSubOrgMembership,
} from "@/lib/permissions/sub-org-permissions";
import { sendBrandedEmail } from "@/lib/email/send-branded-email";
import { shouldSendEmail } from "@/lib/email/preferences";
import { resolveLocale } from "@/lib/email/i18n";

export const dynamic = "force-dynamic";

const VALID_SUB_ORG_ROLES: ReadonlySet<SubOrgRole> = new Set([
  "OWNER",
  "ADMIN",
  "MEMBER",
  "VIEWER",
]);

const VALID_PERMISSION_SETS: ReadonlySet<PermissionSet> = new Set([
  "READ_ONLY",
  "USE_AGENTS",
  "USE_AGENTS_PLUS_KNOWLEDGE",
  "FULL_ACCESS",
]);

/**
 * Map our richer SubOrgRole to Clerk's binary org-admin / org-member.
 * OWNER and ADMIN both surface as org:admin in Clerk; MEMBER and VIEWER
 * as org:member. The KILN role + permissionSet live on SubOrgMembership.
 */
function clerkRoleFor(role: SubOrgRole): "org:admin" | "org:member" {
  return role === "OWNER" || role === "ADMIN" ? "org:admin" : "org:member";
}

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const { userId } = await auth();
  if (!userId) return unauthorized();

  // Membership look-up is the auth gate AND the existence check: a
  // user who has no row for this sub-org gets 404 either because the
  // sub-org doesn't exist or because they can't see it — same surface,
  // so IDs can't be probed.
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

  const relationship = await prisma.orgRelationship.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      childOrgId: true,
      parentOrgId: true,
      subOrgName: true,
      subOrgStatus: true,
    },
  });
  if (!relationship) {
    // FK on SubOrgMembership normally prevents this, but guard anyway.
    return Response.json({ error: "Sub-org not found" }, { status: 404 });
  }
  if (relationship.subOrgStatus !== "ACTIVE") {
    return Response.json(
      { error: "Sub-org is archived or suspended" },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: unknown;
    role?: unknown;
    permissionSet?: unknown;
  };
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email || !email.includes("@")) {
    return Response.json({ error: "valid email required" }, { status: 400 });
  }

  const role: SubOrgRole =
    typeof body.role === "string" && VALID_SUB_ORG_ROLES.has(body.role as SubOrgRole)
      ? (body.role as SubOrgRole)
      : "MEMBER";

  const permissionSet: PermissionSet =
    typeof body.permissionSet === "string" &&
    VALID_PERMISSION_SETS.has(body.permissionSet as PermissionSet)
      ? (body.permissionSet as PermissionSet)
      : "READ_ONLY";

  const client = await clerkClient();

  // Shared lookup for either email path. Falls back to "KILN" if the
  // caller has no User row, which can happen in dev with a Clerk-only
  // session that hasn't been backfilled.
  const inviter = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, email: true },
  });
  const inviterName =
    [inviter?.firstName, inviter?.lastName].filter(Boolean).join(" ") ||
    inviter?.email ||
    "KILN";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";
  const subOrgName = relationship.subOrgName ?? "the workspace";

  // Path 2 — does a Clerk user already exist for this email? If yes,
  // attach them directly so they have access immediately.
  let existingClerkUserId: string | null = null;
  try {
    const users = await client.users.getUserList({ emailAddress: [email] });
    existingClerkUserId = users.data[0]?.id ?? null;
  } catch (err) {
    console.warn("[sub-org/invite] user lookup failed:", err);
  }

  if (existingClerkUserId) {
    try {
      await client.organizations.createOrganizationMembership({
        organizationId: relationship.childOrgId,
        userId: existingClerkUserId,
        role: clerkRoleFor(role),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Membership create failed";
      // Already a member is a benign error — fall through to the upsert
      // so we still record the KILN-side permissionSet.
      if (!/already.*member/i.test(message)) {
        return Response.json({ error: message }, { status: 500 });
      }
    }

    await prisma.subOrgMembership.upsert({
      where: {
        subOrgId_userId: { subOrgId: relationship.id, userId: existingClerkUserId },
      },
      create: {
        subOrgId: relationship.id,
        userId: existingClerkUserId,
        role,
        permissionSet,
        invitedById: userId,
        invitedAt: new Date(),
        acceptedAt: new Date(),
      },
      update: {
        role,
        permissionSet,
      },
    });

    // Path 2 notification — the user is now active, so this is the only
    // signal they get that they were added. Send-failure must not break
    // the API contract: the membership is already persisted.
    try {
      const recipient = await prisma.user.findUnique({
        where: { id: existingClerkUserId },
        select: { preferredLanguage: true, firstName: true, lastName: true },
      });
      const locale = resolveLocale(recipient?.preferredLanguage);
      const recipientName =
        [recipient?.firstName, recipient?.lastName].filter(Boolean).join(" ") ||
        null;
      const gate = await shouldSendEmail({
        eventType: "sub_org_invited",
        userId: existingClerkUserId,
        recipientEmail: email,
      });
      if (gate.allow) {
        await sendBrandedEmail({
          template: "sub-org-member-invited-existing",
          orgId: relationship.parentOrgId,
          subOrgId: relationship.childOrgId,
          userId: existingClerkUserId,
          to: email,
          data: {
            locale,
            recipientName,
            inviterName,
            subOrgName,
            role,
            permissionSet,
            workspaceUrl: `${appUrl}/dashboard/sub-org/${relationship.id}`,
          },
        });
      }
    } catch (err) {
      console.warn("[sub-org/invite] path-2 email send failed:", err);
    }

    return Response.json({
      email,
      role,
      permissionSet,
      status: "accepted",
      path: "existing-user",
    });
  }

  // Path 1 — fresh email → Clerk org invitation. publicMetadata carries
  // our intent through to the webhook on acceptance.
  try {
    const invitation = await client.organizations.createOrganizationInvitation({
      organizationId: relationship.childOrgId,
      emailAddress: email,
      role: clerkRoleFor(role),
      inviterUserId: userId,
      publicMetadata: { kilnRole: role, permissionSet },
    });

    // Path 1 supplemental notification — Clerk's invitation email is
    // generic ("Join the org on Clerk"). Our branded mail tells the
    // recipient who invited them, to which sub-org, with what role —
    // context the Clerk default lacks. Failure is non-fatal; the Clerk
    // invitation is already created and is what actually grants access.
    try {
      await sendBrandedEmail({
        template: "sub-org-member-invited-new",
        orgId: relationship.parentOrgId,
        subOrgId: relationship.childOrgId,
        userId: null,
        to: email,
        data: {
          locale: "de",
          inviterName,
          subOrgName,
          role,
          permissionSet,
          learnMoreUrl: appUrl,
        },
      });
    } catch (err) {
      console.warn("[sub-org/invite] path-1 email send failed:", err);
    }

    return Response.json({
      id: invitation.id,
      email: invitation.emailAddress,
      role,
      permissionSet,
      status: invitation.status,
      path: "invitation",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invite failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
