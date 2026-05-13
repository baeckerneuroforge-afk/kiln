/**
 * Sprint 19.7.6 — agency team management.
 *
 * GET  → list AgencyMembership rows for the caller's agency, enriched
 *        with user names/emails (from local User cache) and the count
 *        of explicit sub-org assignments per row.
 *
 * POST → invite an agency-member. Two paths mirror the sub-org invite
 *        endpoint:
 *          1. existing Clerk user → addOrganizationMembership + materialise
 *             our AgencyMembership row immediately;
 *          2. fresh email → Clerk org invitation with kilnRole in
 *             publicMetadata, materialised by the webhook on accept.
 *
 *        Optional subOrgIds[] + permissionOverrides{} populate
 *        AgencyMemberSubOrgAccess for CONSULTANT/VIEWER rows. OWNER/ADMIN
 *        invites ignore those (they get implicit all-sub-orgs.access).
 *
 * Auth: caller needs members.manage on the active agency org. Only
 * OWNERs can mint or modify other OWNERs.
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import type { AgencyRole, PermissionSet } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAgencyAccess } from "@/lib/permissions/require-agency-access";
import { permissionsForAgencyRole } from "@/lib/permissions/agency-permissions";
import { sendBrandedEmail } from "@/lib/email/send-branded-email";
import { shouldSendEmail } from "@/lib/email/preferences";
import { resolveLocale } from "@/lib/email/i18n";

export const dynamic = "force-dynamic";

const VALID_AGENCY_ROLES: ReadonlySet<AgencyRole> = new Set([
  "OWNER",
  "ADMIN",
  "CONSULTANT",
  "VIEWER",
]);

const VALID_PERMISSION_SETS: ReadonlySet<PermissionSet> = new Set([
  "READ_ONLY",
  "USE_AGENTS",
  "USE_AGENTS_PLUS_KNOWLEDGE",
  "FULL_ACCESS",
]);

function clerkRoleFor(role: AgencyRole): "org:admin" | "org:member" {
  return role === "OWNER" || role === "ADMIN" ? "org:admin" : "org:member";
}

export async function GET() {
  const { userId, orgId: agencyOrgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!agencyOrgId) {
    return Response.json({ error: "No active organization." }, { status: 400 });
  }

  const access = await requireAgencyAccess(agencyOrgId, "members.manage");
  if (!access.ok) return access.response;

  const memberships = await prisma.agencyMembership.findMany({
    where: { agencyClerkOrgId: agencyOrgId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    include: {
      subOrgAccess: {
        select: {
          id: true,
          subOrgId: true,
          permissionOverride: true,
        },
      },
    },
  });

  const users = memberships.length
    ? await prisma.user.findMany({
        where: { id: { in: memberships.map((m) => m.userId) } },
        select: { id: true, email: true, firstName: true, lastName: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const rows = memberships.map((m) => {
    const u = userMap.get(m.userId);
    const name =
      u?.firstName || u?.lastName
        ? [u.firstName, u.lastName].filter(Boolean).join(" ")
        : null;
    return {
      id: m.id,
      userId: m.userId,
      role: m.role,
      name,
      email: u?.email ?? null,
      invitedAt: m.invitedAt,
      acceptedAt: m.acceptedAt,
      createdAt: m.createdAt,
      assignedSubOrgCount: m.subOrgAccess.length,
      subOrgAccess: m.subOrgAccess,
      // for OWNER/ADMIN rows the assignment count is meaningless because
      // they see everything — the table renders "alle" instead.
      hasAllSubOrgs: permissionsForAgencyRole(m.role).has("all-sub-orgs.access"),
    };
  });

  return Response.json({ members: rows });
}

export async function POST(request: Request) {
  const { userId, orgId: agencyOrgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!agencyOrgId) {
    return Response.json({ error: "No active organization." }, { status: 400 });
  }

  const access = await requireAgencyAccess(agencyOrgId, "members.manage");
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => ({}))) as {
    email?: unknown;
    role?: unknown;
    subOrgIds?: unknown;
    permissionOverrides?: unknown;
  };

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email || !email.includes("@")) {
    return Response.json({ error: "valid email required" }, { status: 400 });
  }

  const role: AgencyRole =
    typeof body.role === "string" && VALID_AGENCY_ROLES.has(body.role as AgencyRole)
      ? (body.role as AgencyRole)
      : "VIEWER";

  // Only OWNERs can create other OWNERs — prevents an ADMIN from
  // self-escalating by inviting a new OWNER and accepting from them.
  if (role === "OWNER" && access.membership.role !== "OWNER") {
    return Response.json(
      { error: "Only an OWNER can invite another OWNER" },
      { status: 403 },
    );
  }

  const subOrgIdsInput = Array.isArray(body.subOrgIds) ? body.subOrgIds : [];
  const subOrgIds = subOrgIdsInput
    .filter((s): s is string => typeof s === "string" && s.length > 0);

  const permissionOverridesInput =
    body.permissionOverrides && typeof body.permissionOverrides === "object"
      ? (body.permissionOverrides as Record<string, unknown>)
      : {};
  const permissionOverrides: Record<string, PermissionSet> = {};
  for (const [k, v] of Object.entries(permissionOverridesInput)) {
    if (
      typeof v === "string" &&
      VALID_PERMISSION_SETS.has(v as PermissionSet)
    ) {
      permissionOverrides[k] = v as PermissionSet;
    }
  }

  // Validate every subOrgId belongs to this agency. Cross-agency leaks
  // here would let an attacker grant themselves access to another
  // agency's sub-orgs by guessing IDs.
  if (subOrgIds.length > 0) {
    const valid = await prisma.orgRelationship.findMany({
      where: { id: { in: subOrgIds }, parentOrgId: agencyOrgId },
      select: { id: true },
    });
    if (valid.length !== subOrgIds.length) {
      return Response.json(
        { error: "One or more sub-orgs do not belong to this agency" },
        { status: 400 },
      );
    }
  }

  const client = await clerkClient();

  // Inviter context for the email body. Mirrors the sub-org/invite route.
  const inviter = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, email: true },
  });
  const inviterName =
    [inviter?.firstName, inviter?.lastName].filter(Boolean).join(" ") ||
    inviter?.email ||
    "KILN";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";

  let existingClerkUserId: string | null = null;
  try {
    const users = await client.users.getUserList({ emailAddress: [email] });
    existingClerkUserId = users.data[0]?.id ?? null;
  } catch (err) {
    console.warn("[agency/team] user lookup failed:", err);
  }

  // Path A — existing user → attach to Clerk agency org + materialize row.
  if (existingClerkUserId) {
    try {
      await client.organizations.createOrganizationMembership({
        organizationId: agencyOrgId,
        userId: existingClerkUserId,
        role: clerkRoleFor(role),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Membership create failed";
      if (!/already.*member/i.test(message)) {
        return Response.json({ error: message }, { status: 500 });
      }
    }

    const membership = await prisma.agencyMembership.upsert({
      where: {
        agencyClerkOrgId_userId: { agencyClerkOrgId: agencyOrgId, userId: existingClerkUserId },
      },
      create: {
        agencyClerkOrgId: agencyOrgId,
        userId: existingClerkUserId,
        role,
        invitedById: userId,
        invitedAt: new Date(),
        acceptedAt: new Date(),
      },
      update: { role },
    });

    if (subOrgIds.length > 0) {
      await prisma.$transaction([
        prisma.agencyMemberSubOrgAccess.deleteMany({
          where: { agencyMembershipId: membership.id },
        }),
        prisma.agencyMemberSubOrgAccess.createMany({
          data: subOrgIds.map((subOrgId) => ({
            agencyMembershipId: membership.id,
            subOrgId,
            permissionOverride: permissionOverrides[subOrgId] ?? null,
          })),
        }),
      ]);
    }

    // Existing-user notification — they now have agency-team access, and
    // this is the only signal they get. Failure is non-fatal.
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
        eventType: "agency_invited",
        userId: existingClerkUserId,
        recipientEmail: email,
      });
      if (gate.allow) {
        await sendBrandedEmail({
          template: "agency-member-invited",
          orgId: agencyOrgId,
          userId: existingClerkUserId,
          to: email,
          data: {
            locale,
            recipientName,
            inviterName,
            role,
            assignmentCount: subOrgIds.length,
            teamUrl: `${appUrl}/dashboard/agency/team`,
          },
        });
      }
    } catch (err) {
      console.warn("[agency/team] existing-user email send failed:", err);
    }

    return Response.json({
      id: membership.id,
      email,
      role,
      status: "accepted",
      path: "existing-user",
    });
  }

  // Path B — fresh email → Clerk org invitation, webhook will materialise
  // the row when accepted. Carry kilnRole + subOrgIds + overrides in
  // publicMetadata so the webhook can reproduce our intent.
  try {
    const invitation = await client.organizations.createOrganizationInvitation({
      organizationId: agencyOrgId,
      emailAddress: email,
      role: clerkRoleFor(role),
      inviterUserId: userId,
      publicMetadata: {
        kilnAgencyRole: role,
        kilnAssignedSubOrgIds: subOrgIds,
        kilnPermissionOverrides: permissionOverrides,
      },
    });

    // New-email supplemental notification — adds team-specific context
    // that Clerk's generic invitation email lacks. Failure is non-fatal:
    // the Clerk invitation grants access regardless.
    try {
      await sendBrandedEmail({
        template: "agency-member-invited",
        orgId: agencyOrgId,
        userId: null,
        to: email,
        data: {
          locale: "de",
          recipientName: null,
          inviterName,
          role,
          assignmentCount: subOrgIds.length,
          teamUrl: `${appUrl}/dashboard/agency/team`,
        },
      });
    } catch (err) {
      console.warn("[agency/team] new-email email send failed:", err);
    }

    return Response.json({
      id: invitation.id,
      email: invitation.emailAddress,
      role,
      status: invitation.status,
      path: "invitation",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invite failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
