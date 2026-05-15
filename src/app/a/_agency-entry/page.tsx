/**
 * Sprint 19.8.1 — Agency-domain smart-routing entry point.
 *
 * Middleware rewrites every non-passthrough request on an agency
 * domain to this page. We read the agency context from headers, then:
 *
 *   - Unauthenticated → render a branded "sign-in to continue" card
 *     with a CTA that goes to /sign-in (which the middleware will
 *     pass through with the same agency headers attached).
 *
 *   - Authenticated:
 *     - 0 sub-org memberships under this agency → branded 403 page
 *       ("You're not a member of this workspace"). Customers see
 *       the agency identity, not KILN.
 *     - 1 membership → server-redirect to /dashboard/sub-org/[id].
 *       Browser URL stays on the agency domain because the redirect
 *       is path-relative; the next request goes through middleware
 *       which sees the agency-domain pass-through rule and lets it
 *       render the sub-org workspace.
 *     - >1 memberships → branded sub-org selector.
 *
 * The page is a server component so all routing decisions happen
 * before the user sees anything — no client-side loading flash.
 */
import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Building2, LogIn, ShieldAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { loadAgencyBranding } from "@/lib/domains/agency-branding";

export const dynamic = "force-dynamic";

export default async function AgencyDomainEntryPage() {
  const hdrs = await headers();
  const agencyOrgId = hdrs.get("x-agency-org-id");
  const hostname = hdrs.get("x-agency-domain") ?? "";
  if (!agencyOrgId) {
    // Should never happen — middleware sets this header. Render a
    // generic error to keep the user on the custom domain instead of
    // leaking back to kilnbase.com.
    return <BrandedErrorShell title="Workspace nicht verfügbar" />;
  }

  const branding = await loadAgencyBranding({ agencyOrgId, hostname });
  const { userId } = await auth();

  // Unauthenticated → branded sign-in landing.
  if (!userId) {
    return <UnauthenticatedLanding branding={branding} />;
  }

  // Authenticated → look up the caller's memberships under THIS agency.
  // The join goes through OrgRelationship.parentOrgId = agencyOrgId so
  // we only see sub-orgs that belong to this specific agency, not the
  // user's memberships across the whole platform.
  const memberships = await prisma.subOrgMembership.findMany({
    where: {
      userId,
      subOrg: { parentOrgId: agencyOrgId },
    },
    select: {
      id: true,
      subOrgId: true,
      role: true,
      subOrg: {
        select: {
          id: true,
          subOrgName: true,
          subOrgStatus: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const active = memberships.filter((m) => m.subOrg.subOrgStatus === "ACTIVE");

  if (active.length === 0) {
    return <NoMembershipForbidden branding={branding} />;
  }
  if (active.length === 1) {
    // Single membership → silent redirect into the sub-org workspace.
    redirect(`/dashboard/sub-org/${active[0].subOrgId}`);
  }
  return <SubOrgSelector branding={branding} memberships={active} />;
}

function BrandedShell({
  branding,
  children,
}: {
  branding?: { agencyName: string; logoUrl: string | null; primaryColor: string };
  children: React.ReactNode;
}) {
  const accent = branding?.primaryColor ?? "#F97316";
  return (
    <div
      className="min-h-screen bg-background flex flex-col items-center justify-center px-6"
      data-testid="agency-entry-shell"
    >
      <header className="mb-6 flex items-center gap-3">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-lg border"
          style={{ borderColor: accent }}
        >
          {branding?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt={branding.agencyName}
              className="h-9 w-9 object-contain"
            />
          ) : (
            <Building2 className="h-6 w-6" style={{ color: accent }} />
          )}
        </div>
        {branding?.agencyName && (
          <h1 className="font-serif text-2xl text-foreground">
            {branding.agencyName}
          </h1>
        )}
      </header>
      {children}
    </div>
  );
}

function BrandedErrorShell({ title }: { title: string }) {
  return (
    <BrandedShell>
      <div className="max-w-md rounded-xl border border-border bg-card p-8 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="mt-3 font-serif text-xl">{title}</h2>
      </div>
    </BrandedShell>
  );
}

function UnauthenticatedLanding({
  branding,
}: {
  branding: { agencyName: string; logoUrl: string | null; primaryColor: string };
}) {
  return (
    <BrandedShell branding={branding}>
      <section
        className="max-w-md rounded-xl border border-border bg-card p-8 text-center"
        data-testid="agency-entry-unauthenticated"
      >
        <p className="text-sm text-muted-foreground">
          Willkommen bei {branding.agencyName}.
        </p>
        <h2 className="mt-2 font-serif text-2xl text-foreground">
          Melde dich an, um fortzufahren
        </h2>
        <Link
          href="/sign-in"
          className="mt-6 inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium text-white"
          style={{ backgroundColor: branding.primaryColor }}
          data-testid="agency-entry-sign-in"
        >
          <LogIn className="h-4 w-4" />
          Anmelden
        </Link>
      </section>
    </BrandedShell>
  );
}

function NoMembershipForbidden({
  branding,
}: {
  branding: { agencyName: string; logoUrl: string | null; primaryColor: string };
}) {
  return (
    <BrandedShell branding={branding}>
      <section
        className="max-w-md rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center"
        data-testid="agency-entry-forbidden"
      >
        <ShieldAlert className="mx-auto h-8 w-8 text-red-400" />
        <h2 className="mt-3 font-serif text-xl text-foreground">
          Kein Zugriff auf diesen Workspace
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Dein Konto ist nicht Teil von {branding.agencyName}. Wenn das ein
          Fehler ist, wende dich an deine Agency.
        </p>
      </section>
    </BrandedShell>
  );
}

function SubOrgSelector({
  branding,
  memberships,
}: {
  branding: { agencyName: string; logoUrl: string | null; primaryColor: string };
  memberships: Array<{
    id: string;
    subOrgId: string;
    role: string;
    subOrg: { id: string; subOrgName: string };
  }>;
}) {
  return (
    <BrandedShell branding={branding}>
      <section
        className="w-full max-w-md rounded-xl border border-border bg-card p-6"
        data-testid="agency-entry-selector"
      >
        <header className="mb-4 text-center">
          <h2 className="font-serif text-xl text-foreground">
            Workspace auswählen
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Du bist Mitglied in mehreren Workspaces.
          </p>
        </header>
        <ul
          className="space-y-2"
          data-testid="agency-entry-selector-list"
        >
          {memberships.map((m) => (
            <li key={m.id}>
              <Link
                href={`/dashboard/sub-org/${m.subOrgId}`}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-4 py-3 hover:border-foreground/40"
                data-testid={`agency-entry-selector-${m.subOrgId}`}
              >
                <span className="flex items-center gap-3">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-md"
                    style={{ backgroundColor: branding.primaryColor + "22" }}
                  >
                    <Building2
                      className="h-4 w-4"
                      style={{ color: branding.primaryColor }}
                    />
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {m.subOrg.subOrgName}
                  </span>
                </span>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {m.role.toLowerCase()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </BrandedShell>
  );
}
