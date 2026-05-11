import { auth } from "@clerk/nextjs/server";
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
 * The two view components remain client components that own their own
 * data fetching; this server wrapper only resolves which one to render.
 */
export default async function DashboardPage() {
  const { userId, orgId } = await auth();
  if (!userId) {
    // Auth middleware redirects unauthenticated requests elsewhere; if
    // we somehow get here, default to the onboarding view (it tolerates
    // the absence of an authenticated user via its own client-side guards).
    return <OnboardingDashboardView />;
  }

  const [user, subOrgCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { dashboardPreference: true, createdAt: true },
    }),
    orgId
      ? prisma.orgRelationship.count({ where: { parentOrgId: orgId } })
      : Promise.resolve(0),
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
