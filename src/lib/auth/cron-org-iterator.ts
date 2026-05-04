/**
 * Helper for cron jobs that need to iterate over every tenant.
 *
 * Cron jobs run without a user / org session. Today most of KILN's crons
 * iterate over `User` rows directly, which works fine while every user has
 * exactly one personalOrg (1:1 today). When shared orgs land in Phase 2.3
 * a single org may belong to multiple users, so iterating by org is the
 * correct long-term primitive.
 *
 * Usage:
 *
 *   for await (const { orgId, primaryUserId } of iterateOrgs()) {
 *     await processOrg(orgId, primaryUserId);
 *   }
 *
 * `primaryUserId` is the User.id whose personalOrgId equals this org —
 * useful for crons that still expect a user identity (email recipient,
 * stripeCustomerId lookup, etc.). For shared orgs without a single
 * "primary" user it'll be the user who originally created the org via
 * the Phase 2.1 webhook / backfill.
 */
import { prisma } from "@/lib/prisma";

export type OrgIterationItem = {
  orgId: string;
  primaryUserId: string;
};

export async function* iterateOrgs(): AsyncGenerator<
  OrgIterationItem,
  void,
  void
> {
  const users = await prisma.user.findMany({
    where: { personalOrgId: { not: null } },
    select: { id: true, personalOrgId: true },
    orderBy: { createdAt: "asc" },
  });
  for (const u of users) {
    if (!u.personalOrgId) continue;
    yield { orgId: u.personalOrgId, primaryUserId: u.id };
  }
}

/**
 * Convenience wrapper that returns the full list. Prefer `iterateOrgs()`
 * for crons that process many orgs — it streams through Prisma rather
 * than holding the entire user table in memory.
 */
export async function listOrgs(): Promise<OrgIterationItem[]> {
  const users = await prisma.user.findMany({
    where: { personalOrgId: { not: null } },
    select: { id: true, personalOrgId: true },
  });
  return users
    .filter((u): u is { id: string; personalOrgId: string } =>
      Boolean(u.personalOrgId)
    )
    .map((u) => ({ orgId: u.personalOrgId, primaryUserId: u.id }));
}
