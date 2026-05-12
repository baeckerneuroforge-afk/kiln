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
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getUserSubOrgMembership } from "@/lib/permissions/sub-org-permissions";

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

  return <>{children}</>;
}
