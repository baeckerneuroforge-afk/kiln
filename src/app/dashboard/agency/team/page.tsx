/**
 * Sprint 19.7.6 — /dashboard/agency/team
 *
 * Lists every AgencyMembership for the caller's agency, with click-to-
 * edit rows + an "Invite member" button.
 *
 * Auth: members.manage gate via requireAgencyAccess. Sub-Org-mode users
 * are already redirected out by /dashboard/agency/layout.tsx. The page
 * also bootstraps an OWNER row on first access for Clerk org-admins so
 * the rollout doesn't lock anyone out (see ensureAgencyMembership-
 * FromClerkRole for the rationale).
 */
import { redirect, notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  ensureAgencyMembershipFromClerkRole,
  permissionsForAgencyRole,
} from "@/lib/permissions/agency-permissions";
import { TeamPageClient } from "@/components/agency/team-page-client";

export const dynamic = "force-dynamic";

export default async function AgencyTeamPage() {
  const { userId, orgId: agencyOrgId, orgRole } = await auth();
  if (!userId) redirect("/sign-in");
  if (!agencyOrgId) {
    redirect("/dashboard");
  }

  const membership = await ensureAgencyMembershipFromClerkRole(
    userId,
    agencyOrgId,
    orgRole ?? null,
  );

  if (!membership || !permissionsForAgencyRole(membership.role).has("members.manage")) {
    // Same existence-hiding rationale as the sub-org helper — 404 the
    // page rather than 403, so non-members can't probe org IDs.
    notFound();
  }

  const subOrgs = await prisma.orgRelationship.findMany({
    where: { parentOrgId: agencyOrgId, subOrgStatus: "ACTIVE" },
    orderBy: { subOrgName: "asc" },
    select: { id: true, subOrgName: true, childOrgId: true },
  });

  return (
    <div className="mx-auto max-w-5xl py-8" data-testid="agency-team-page">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-2xl text-foreground">
            <Users className="h-5 w-5 text-kiln-orange" />
            Team
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Verwalte wer auf deine Agency zugreifen kann — und welche Sub-Orgs sie sehen.
          </p>
        </div>
      </header>

      <TeamPageClient
        callerUserId={userId}
        callerRole={membership.role}
        subOrgs={subOrgs.map((s) => ({ id: s.id, name: s.subOrgName }))}
      />
    </div>
  );
}
