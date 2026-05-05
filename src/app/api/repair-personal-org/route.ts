/**
 * POST /api/repair-personal-org — repair drift between User.personalOrgId
 * (our DB) and Clerk's organization memberships for the calling user.
 *
 * Background: the Phase-2.1 backfill creates a Clerk Organization and adds
 * the user as `org:admin`. In normal operation a user always has at least
 * their personal workspace. But three failure modes have shown up:
 *
 *   B) DB has personalOrgId, Clerk has the org, but the user has NO
 *      membership for it. Fix: createOrganizationMembership.
 *   C) DB has personalOrgId, but the org no longer exists in Clerk.
 *      Fix: create a fresh org + update DB pointer.
 *   D) DB has no personalOrgId at all. Fix: create org + persist.
 *
 * Without this endpoint, OrgRequired bounces these users into the
 * onboarding loop forever — they end up creating a SECOND org instead of
 * recovering the original one. Calling this endpoint before redirecting
 * breaks the loop.
 *
 * Returns { repaired: boolean, action: ..., orgId: string | null }.
 * Idempotent: if state is already healthy, returns { repaired: false,
 * action: "noop" }.
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getUserEmailOrPlaceholder } from "@/lib/clerk-user-email";

export const dynamic = "force-dynamic";

type RepairAction =
  | "noop"
  | "membership_added"
  | "org_created"
  | "user_record_created";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await clerkClient();

    // Ensure local user row exists — repair is also reachable for users that
    // signed up before the user.created webhook landed.
    const userEmail = await getUserEmailOrPlaceholder(userId);
    const user = await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: userEmail },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        personalOrgId: true,
      },
    });

    // 1. Load current Clerk memberships for the caller.
    const memberships = await client.users.getOrganizationMembershipList({
      userId,
    });
    const membershipOrgIds = new Set(memberships.data.map((m) => m.organization.id));

    // 2. If the user already has at least one membership AND the DB pointer
    //    matches one of them, nothing to repair.
    if (
      memberships.data.length > 0 &&
      user.personalOrgId &&
      membershipOrgIds.has(user.personalOrgId)
    ) {
      return Response.json({
        repaired: false,
        action: "noop" as RepairAction,
        orgId: user.personalOrgId,
        membershipCount: memberships.data.length,
      });
    }

    // 3. If memberships exist but the personal org pointer is stale or null,
    //    sync the pointer to the user's first membership and call it good.
    if (memberships.data.length > 0) {
      const firstOrgId = memberships.data[0].organization.id;
      await prisma.user.update({
        where: { id: userId },
        data: { personalOrgId: firstOrgId },
      });
      return Response.json({
        repaired: true,
        action: "noop" as RepairAction, // membership already existed
        orgId: firstOrgId,
        membershipCount: memberships.data.length,
        note: "Synced User.personalOrgId to existing Clerk membership.",
      });
    }

    // 4. No memberships in Clerk. Try to recover the personal org by id.
    if (user.personalOrgId) {
      try {
        await client.organizations.getOrganization({
          organizationId: user.personalOrgId,
        });
        // Org exists — user just isn't a member of it.
        await client.organizations.createOrganizationMembership({
          organizationId: user.personalOrgId,
          userId,
          role: "org:admin",
        });
        return Response.json({
          repaired: true,
          action: "membership_added" as RepairAction,
          orgId: user.personalOrgId,
          membershipCount: 1,
        });
      } catch (err) {
        // Org doesn't exist — fall through to recreate.
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[repair-personal-org] org ${user.personalOrgId} unreachable for user ${userId}, recreating: ${msg}`
        );
      }
    }

    // 5. Create a fresh personal org. Clerk auto-adds createdBy as org:admin.
    const orgName = buildOrgName(user);
    const newOrg = await client.organizations.createOrganization({
      name: orgName,
      createdBy: userId,
    });
    await prisma.user.update({
      where: { id: userId },
      data: { personalOrgId: newOrg.id },
    });
    return Response.json({
      repaired: true,
      action: "org_created" as RepairAction,
      orgId: newOrg.id,
      membershipCount: 1,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Repair failed";
    console.error("[repair-personal-org] fatal:", err);
    return Response.json({ error: message }, { status: 500 });
  }
}

function buildOrgName(u: {
  email: string;
  firstName: string | null;
  lastName: string | null;
}): string {
  const first = u.firstName?.trim();
  const last = u.lastName?.trim();
  if (first || last) return `${[first, last].filter(Boolean).join(" ")}'s Workspace`;
  const local = u.email.split("@")[0];
  return `${local}'s Workspace`;
}
