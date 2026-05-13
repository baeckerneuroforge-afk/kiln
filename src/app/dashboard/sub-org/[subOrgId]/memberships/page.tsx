/**
 * Sprint 19.7.3 — Sub-Org memberships list.
 *
 * Permission matrix:
 *   FULL_ACCESS → list + invite/remove (memberships.manage)
 *   others      → read-only ("contact your agency")
 *
 * The actual invite endpoint lives at /api/agency/sub-orgs/[id]/invite
 * (Sprint 19.7.1); the CTA points there so the existing flow is
 * reused.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { Users, Lock, UserPlus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { prisma } from "@/lib/prisma";
import { getSubOrgContext } from "@/lib/sub-org/get-sub-org-context";
import { getSubOrgMemberships } from "@/lib/sub-org/get-sub-org-data";

export const dynamic = "force-dynamic";

interface PageProps { params: { subOrgId: string } }

export default async function SubOrgMembershipsPage({ params }: PageProps) {
  const context = await getSubOrgContext(params.subOrgId);
  if (!context) notFound();
  // Membership visibility is a baseline expectation — anyone with
  // sub-org access sees who their teammates are.
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

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-2xl text-foreground">
            <Users className="h-5 w-5 text-kiln-orange" />
            Memberships
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Team-Members im Workspace {context.subOrg.subOrgName}.
          </p>
        </div>
        {canManage ? (
          <Link
            href={`/dashboard/agency/sub-orgs/${context.subOrg.id}`}
            className={buttonVariants()}
            data-testid="sub-org-memberships-invite-cta"
          >
            <UserPlus className="mr-1 h-4 w-4" /> Mitglied einladen
          </Link>
        ) : (
          <span
            data-testid="sub-org-memberships-readonly-badge"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card/40 px-3 py-1.5 text-xs text-muted-foreground"
          >
            <Lock className="h-3 w-3" /> Nur Lesen
          </span>
        )}
      </header>

      {memberships.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/30 p-10 text-center" data-testid="sub-org-memberships-empty">
          <Users className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <p className="text-base font-medium text-foreground">Noch keine Members.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage
              ? `Lade Team-Members ein, damit sie an ${context.subOrg.subOrgName} arbeiten können.`
              : "Kontaktiere deine Agency, um Members hinzuzufügen."}
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="sub-org-memberships-list">
          {memberships.map((m) => {
            const user = userMap.get(m.userId);
            const displayName =
              (user?.firstName || user?.lastName
                ? [user.firstName, user.lastName].filter(Boolean).join(" ")
                : null) ??
              user?.email ??
              m.userId;
            return (
              <div key={m.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{displayName}</p>
                    {user?.email && (
                      <p className="mt-1 text-xs text-muted-foreground">{user.email}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium text-foreground">{m.role}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {m.permissionSet.replace(/_/g, " ").toLowerCase()}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
