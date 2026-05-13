/**
 * Sprint 19.7.2 — sub-org context layout.
 *
 * Wraps every /dashboard/sub-org/[subOrgId]/* route. We use this layout
 * for two things:
 *   1. Access control — caller must have a SubOrgMembership row for
 *      this sub-org. Anything else gets 404 (existence-hiding).
 *   2. Data hydration — pull the sub-org name + status off the
 *      OrgRelationship so child pages can render without re-querying.
 *
 * The visible sidebar is inherited from /dashboard/layout.tsx and
 * detects the sub-org URL pattern automatically (see Sidebar's
 * extractNestedSubOrgIdFromPath).
 */
import { auth } from "@clerk/nextjs/server";
import { headers, cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getUserSubOrgMembership } from "@/lib/permissions/sub-org-permissions";
import {
  ONBOARDING_SKIP_COOKIE,
  resolveOnboardingRedirect,
} from "@/lib/sub-org/onboarding-redirect";

export const dynamic = "force-dynamic";

interface LayoutProps {
  children: React.ReactNode;
  params: { subOrgId: string };
}

export default async function SubOrgLayout({ children, params }: LayoutProps) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const membership = await getUserSubOrgMembership(userId, params.subOrgId);
  if (!membership) {
    notFound();
  }

  const subOrg = await prisma.orgRelationship.findUnique({
    where: { id: params.subOrgId },
    select: {
      id: true,
      subOrgName: true,
      subOrgStatus: true,
      parentOrgId: true,
    },
  });
  if (!subOrg) {
    notFound();
  }

  // Sprint 19.7.6 — onboarding wizard redirect.
  // Skip when the user already finished, hasn't accepted yet, opted into
  // "remind me later", or is already inside the wizard route. Pathname
  // comes from the middleware's x-pathname header.
  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname");
  const cookieStore = await cookies();
  const skipCookie = cookieStore.get(ONBOARDING_SKIP_COOKIE)?.value ?? null;

  const onboardingTarget = resolveOnboardingRedirect({
    subOrgId: params.subOrgId,
    acceptedAt: membership.acceptedAt,
    onboardingCompletedAt: membership.onboardingCompletedAt,
    onboardingStepCompleted: membership.onboardingStepCompleted,
    pathname,
    skipCookie,
  });
  if (onboardingTarget) {
    redirect(onboardingTarget);
  }

  return <>{children}</>;
}
