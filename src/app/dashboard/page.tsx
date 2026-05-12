import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OnboardingDashboardView } from "@/components/dashboard/onboarding-view";
import { OperationsDashboardView } from "@/components/dashboard/operations-view";
import { daysSince, pickDashboardView } from "@/lib/dashboard/view-resolver";

export const dynamic = "force-dynamic";

/**
 * Sprint 19.6 — unified dashboard router. Server-side picks the
 * onboarding view or the operations cockpit based on the user's
 * preference and (in auto mode) sub-org count + account age.
 *
 * Sprint 19.7.2 — auto-redirect for sub-org-only users.
 * Three cases at the top of this handler:
 *   1. Active Clerk org IS a sub-org (childOrgId match)
 *      → redirect to /dashboard/sub-org/[OrgRelationship.id]
 *   2. Active Clerk org isn't an agency, but the user has at least one
 *      SubOrgMembership → redirect to their first sub-org
 *   3. Otherwise → render the existing agency-view dashboard
 *
 * The spec asked for this in middleware. We do it here instead because
 * the standard Prisma client doesn't run in Edge middleware. The cost
 * (one extra unique lookup + one count) is paid only on /dashboard
 * landings, not on every request.
 */
export default async function DashboardPage() {
  const { userId, orgId } = await auth();
  if (!userId) {
    // Auth middleware redirects unauthenticated requests elsewhere; if
    // we somehow get here, default to the onboarding view (it tolerates
    // the absence of an authenticated user via its own client-side guards).
    return <OnboardingDashboardView />;
  }

  if (orgId) {
    const asSubOrg = await prisma.orgRelationship.findUnique({
      where: { childOrgId: orgId },
      select: { id: true },
    });
    if (asSubOrg) {
      redirect(`/dashboard/sub-org/${asSubOrg.id}`);
    }
  }

  const ownedAgencyCount = orgId
    ? await prisma.orgRelationship.count({ where: { parentOrgId: orgId } })
    : 0;

  if (ownedAgencyCount === 0) {
    const firstSubOrgMembership = await prisma.subOrgMembership.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { subOrgId: true },
    });
    if (firstSubOrgMembership) {
      redirect(`/dashboard/sub-org/${firstSubOrgMembership.subOrgId}`);
    }
  }

  const [user, subOrgCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { dashboardPreference: true, createdAt: true },
    }),
    Promise.resolve(ownedAgencyCount),
  ]);

  const preference = user?.dashboardPreference ?? "auto";
  const createdAt = user?.createdAt ?? new Date();
  const view = pickDashboardView({
    preference,
    subOrgCount,
    daysSinceSignup: daysSince(createdAt),
  });

  return view === "operations" ? <OperationsDashboardView /> : <OnboardingDashboardView />;
}
