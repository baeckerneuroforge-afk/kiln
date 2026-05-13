/**
 * Sprint 19.7.3 / 19.7.6.1 — Sub-Org memberships list.
 *
 * Server-component shell: resolves context + permissions, fetches the
 * member rows, and hands off to MembershipsPageClient which owns the
 * invite modal.
 *
 * Sprint 19.7.6.1 replaced the broken "Mitglied einladen" cross-link
 * (which routed through agency/layout's requireAgencyMode and bounced
 * sub-org-mode users to /dashboard) with an inline modal hitting the
 * existing POST /api/agency/sub-orgs/[id]/invite endpoint.
 *
 * Permission matrix:
 *   FULL_ACCESS → list + invite (memberships.manage)
 *   others      → read-only ("contact your agency")
 */
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSubOrgContext } from "@/lib/sub-org/get-sub-org-context";
import { getSubOrgMemberships } from "@/lib/sub-org/get-sub-org-data";
import {
  MembershipsPageClient,
  type MembershipRow,
} from "@/components/sub-org/memberships-page-client";

export const dynamic = "force-dynamic";

interface PageProps { params: { subOrgId: string } }

export default async function SubOrgMembershipsPage({ params }: PageProps) {
  const context = await getSubOrgContext(params.subOrgId);
  if (!context) notFound();
  const canManage = context.permissions.has("memberships.manage");

  const memberships = await getSubOrgMemberships(params.subOrgId);
  // Best-effort enrich with email from our local User cache. Clerk is
  // the source of truth but we avoid round-tripping it on every render.
  const users = memberships.length
    ? await prisma.user.findMany({
        where: { id: { in: memberships.map((m) => m.userId) } },
        select: { id: true, email: true, firstName: true, lastName: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const rows: MembershipRow[] = memberships.map((m) => {
    const user = userMap.get(m.userId);
    const displayName =
      (user?.firstName || user?.lastName
        ? [user.firstName, user.lastName].filter(Boolean).join(" ")
        : null) ??
      user?.email ??
      m.userId;
    return {
      id: m.id,
      userId: m.userId,
      role: m.role,
      permissionSet: m.permissionSet,
      displayName,
      email: user?.email ?? null,
      pending: !m.acceptedAt,
    };
  });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 font-serif text-2xl text-foreground">
          <Users className="h-5 w-5 text-kiln-orange" />
          Memberships
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Team-Members im Workspace {context.subOrg.subOrgName}.
        </p>
      </header>

      <MembershipsPageClient
        subOrgId={context.subOrg.id}
        subOrgName={context.subOrg.subOrgName}
        canManage={canManage}
        members={rows}
      />
    </div>
  );
}
