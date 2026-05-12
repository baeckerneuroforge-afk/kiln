/**
 * Clerk webhook handler.
 *
 * Subscribed events (Clerk Dashboard → Webhooks):
 *   - user.created                     → Phase 2.1, personal workspace
 *   - organizationMembership.created   → Sprint 19.7.1, sub-org join
 *   - organizationMembership.updated   → Sprint 19.7.1, role sync
 *   - organizationMembership.deleted   → Sprint 19.7.1, membership remove
 *   - organization.created / .deleted  → acknowledged (future analytics)
 *   - user.deleted                     → acknowledged
 *
 * Required env: CLERK_WEBHOOK_SECRET (Svix signing secret from Clerk).
 *
 * All handlers are idempotent — Clerk retries with backoff, and the
 * upserts / deleteMany shapes tolerate replays without duplicates.
 */
import type { NextRequest } from "next/server";
import { Webhook } from "svix";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { KILN_TYPE_SUB_ORG } from "@/lib/sub-org/provision";
import type { PermissionSet, SubOrgRole } from "@prisma/client";

export const dynamic = "force-dynamic";

type ClerkEmailAddress = { email_address?: string };
type ClerkUserCreatedData = {
  id: string;
  email_addresses?: ClerkEmailAddress[];
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
};
type ClerkEvent = { type: string; data: unknown };

type ClerkOrgMembershipData = {
  id?: string;
  organization?: {
    id?: string;
    public_metadata?: Record<string, unknown> | null;
  };
  public_user_data?: {
    user_id?: string;
    identifier?: string | null;
  };
  role?: string;
};

export async function POST(request: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[clerk-webhook] CLERK_WEBHOOK_SECRET is not configured");
    return Response.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return Response.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const rawBody = await request.text();
  let evt: ClerkEvent;
  try {
    const wh = new Webhook(secret);
    evt = wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkEvent;
  } catch (err) {
    console.error("[clerk-webhook] signature verification failed:", err);
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    switch (evt.type) {
      case "user.created":
        await handleUserCreated(evt.data as ClerkUserCreatedData);
        break;
      case "organizationMembership.created":
        await handleMembershipCreated(evt.data as ClerkOrgMembershipData);
        break;
      case "organizationMembership.updated":
        await handleMembershipUpdated(evt.data as ClerkOrgMembershipData);
        break;
      case "organizationMembership.deleted":
        await handleMembershipDeleted(evt.data as ClerkOrgMembershipData);
        break;
      case "organization.created":
      case "organization.deleted":
      case "user.deleted":
        // Acknowledged but no-op for now — kept here so subscribed events
        // still 200 instead of returning 'unknown event' which would make
        // Clerk's retry behaviour noisy.
        break;
      default:
        // Unknown but harmless — return 200 so Clerk doesn't retry forever.
        break;
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error(`[clerk-webhook] failed to handle ${evt.type}:`, err);
    // 500 → Clerk retries with exponential backoff, which is the behavior
    // we want for transient DB / Clerk-API failures.
    return Response.json({ error: "Handler failed" }, { status: 500 });
  }
}

/**
 * On user.created: ensure the user has a Personal workspace org.
 * Idempotent — if personalOrgId already exists in our DB, do nothing.
 */
async function handleUserCreated(data: ClerkUserCreatedData) {
  const userId = data.id;
  if (!userId) return;

  const email = data.email_addresses?.[0]?.email_address ?? null;

  // Check our DB first — if backfill already provisioned an org for this user,
  // skip. Webhooks may arrive out of order or duplicate.
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { personalOrgId: true, email: true },
  });
  if (existing?.personalOrgId) {
    return;
  }

  const orgName = buildPersonalOrgName(data);
  const client = await clerkClient();
  const org = await client.organizations.createOrganization({
    name: orgName,
    createdBy: userId,
  });

  await prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      email: email ?? `${userId}@no-email.local`,
      firstName: data.first_name ?? null,
      lastName: data.last_name ?? null,
      personalOrgId: org.id,
    },
    update: {
      personalOrgId: org.id,
      ...(email ? { email } : {}),
      ...(data.first_name !== undefined ? { firstName: data.first_name } : {}),
      ...(data.last_name !== undefined ? { lastName: data.last_name } : {}),
    },
  });
}

/**
 * Sprint 19.7.1 — sync Clerk org membership events into SubOrgMembership.
 *
 * The event payload carries `organization.public_metadata` which we use
 * to filter for sub-org events — agency or personal-workspace events
 * fall through as no-ops. Permission set defaults to READ_ONLY on
 * webhook-driven creation; the invite endpoint may overwrite it
 * post-acceptance via the pending-invite lookup (Phase C).
 */
function isSubOrgEvent(data: ClerkOrgMembershipData): boolean {
  const meta = data.organization?.public_metadata;
  if (!meta || typeof meta !== "object") return false;
  return (meta as { kiln_type?: unknown }).kiln_type === KILN_TYPE_SUB_ORG;
}

function mapClerkRoleToSubOrgRole(role: string | undefined): SubOrgRole {
  // Clerk's built-in roles are "org:admin" and "org:member"; we map them
  // to KILN's richer set conservatively: admins land on ADMIN (not
  // OWNER — OWNER is reserved for the agency owner who provisioned the
  // sub-org), members on MEMBER.
  if (role === "org:admin") return "ADMIN";
  return "MEMBER";
}

async function resolveSubOrgIdFromClerkOrgId(clerkOrgId: string): Promise<string | null> {
  const rel = await prisma.orgRelationship.findUnique({
    where: { childOrgId: clerkOrgId },
    select: { id: true },
  });
  return rel?.id ?? null;
}

async function lookupInvitedPermissionSet(args: {
  clerkOrgId: string;
  email: string | null;
}): Promise<{ role?: SubOrgRole; permissionSet?: PermissionSet } | null> {
  if (!args.email) return null;
  try {
    const client = await clerkClient();
    const list = await client.organizations.getOrganizationInvitationList({
      organizationId: args.clerkOrgId,
      status: ["accepted"],
    });
    const matching = list.data.find(
      (inv) => inv.emailAddress?.toLowerCase() === args.email!.toLowerCase(),
    );
    if (!matching?.publicMetadata) return null;
    const meta = matching.publicMetadata as {
      permissionSet?: PermissionSet;
      kilnRole?: SubOrgRole;
    };
    return { permissionSet: meta.permissionSet, role: meta.kilnRole };
  } catch (err) {
    console.warn("[clerk-webhook] invitation lookup failed:", err);
    return null;
  }
}

async function handleMembershipCreated(data: ClerkOrgMembershipData) {
  if (!isSubOrgEvent(data)) return;
  const clerkOrgId = data.organization?.id;
  const userId = data.public_user_data?.user_id;
  if (!clerkOrgId || !userId) return;

  const subOrgId = await resolveSubOrgIdFromClerkOrgId(clerkOrgId);
  if (!subOrgId) return;

  const fromClerkRole = mapClerkRoleToSubOrgRole(data.role);
  const invited = await lookupInvitedPermissionSet({
    clerkOrgId,
    email: data.public_user_data?.identifier ?? null,
  });

  const role = invited?.role ?? fromClerkRole;
  const permissionSet: PermissionSet = invited?.permissionSet ?? "READ_ONLY";

  await prisma.subOrgMembership.upsert({
    where: { subOrgId_userId: { subOrgId, userId } },
    create: {
      subOrgId,
      userId,
      role,
      permissionSet,
      acceptedAt: new Date(),
    },
    update: {
      acceptedAt: new Date(),
    },
  });
}

async function handleMembershipUpdated(data: ClerkOrgMembershipData) {
  if (!isSubOrgEvent(data)) return;
  const clerkOrgId = data.organization?.id;
  const userId = data.public_user_data?.user_id;
  if (!clerkOrgId || !userId) return;

  const subOrgId = await resolveSubOrgIdFromClerkOrgId(clerkOrgId);
  if (!subOrgId) return;

  const role = mapClerkRoleToSubOrgRole(data.role);
  // Don't downgrade an explicit OWNER (provisioning script / agency
  // owner) just because Clerk's role mirror flipped to admin/member.
  await prisma.subOrgMembership.updateMany({
    where: { subOrgId, userId, role: { not: "OWNER" } },
    data: { role },
  });
}

async function handleMembershipDeleted(data: ClerkOrgMembershipData) {
  if (!isSubOrgEvent(data)) return;
  const clerkOrgId = data.organization?.id;
  const userId = data.public_user_data?.user_id;
  if (!clerkOrgId || !userId) return;

  const subOrgId = await resolveSubOrgIdFromClerkOrgId(clerkOrgId);
  if (!subOrgId) return;

  await prisma.subOrgMembership.deleteMany({
    where: { subOrgId, userId },
  });
}

function buildPersonalOrgName(data: ClerkUserCreatedData): string {
  const first = data.first_name?.trim();
  const last = data.last_name?.trim();
  if (first || last) {
    return `${[first, last].filter(Boolean).join(" ")}'s Workspace`;
  }
  if (data.username) {
    return `${data.username}'s Workspace`;
  }
  const local = data.email_addresses?.[0]?.email_address?.split("@")[0];
  if (local) {
    return `${local}'s Workspace`;
  }
  return "Personal Workspace";
}
