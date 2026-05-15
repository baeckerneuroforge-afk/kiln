/**
 * Sprint 19.8.1 — agency-domain settings page (premium whitelabel).
 *
 * Server component bootstraps:
 *   - caller's AgencyMembership + role (drives canManage/canVerify)
 *   - current AgencyDomain row (single-row invariant for this sprint)
 *
 * Hands off to the client orchestrator for state-machine UI (none →
 * setup → verifying → active). Permission checks are duplicated in
 * the API layer; this page is the read-side gate that prevents
 * non-OWNER users from even seeing the setup UI.
 */
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { requireAgencyAccess } from "@/lib/permissions/require-agency-access";
import { listAgencyDomains } from "@/lib/domains/agency-domain-manager";
import { AgencyDomainSettingsClient } from "@/components/agency/agency-domain-settings-client";

export const dynamic = "force-dynamic";

export default async function AgencyDomainSettingsPage() {
  const { userId, orgId: agencyOrgId } = await auth();
  if (!userId || !agencyOrgId) notFound();

  const access = await requireAgencyAccess(agencyOrgId, "sub-orgs.read");
  if (!access.ok) notFound();

  const role = access.membership.role;
  const canManage = role === "OWNER";
  const canVerify = role === "OWNER" || role === "ADMIN";

  const domains = await listAgencyDomains({ agencyOrgId });
  const domain = domains[0] ?? null;

  return (
    <div className="mx-auto max-w-3xl py-8" data-testid="agency-domain-page">
      <header className="mb-6">
        <h1 className="font-serif text-2xl text-foreground">
          Whitelabel-Domain
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Eine eigene Domain für deine Agency. Deine Kunden landen auf deiner
          Marke — KILN bleibt unsichtbar im Hintergrund.
        </p>
      </header>
      <AgencyDomainSettingsClient
        initialDomain={
          domain
            ? {
                id: domain.id,
                hostname: domain.hostname,
                status: domain.status,
                sslStatus: domain.sslStatus,
                sslIssuedAt: domain.sslIssuedAt?.toISOString() ?? null,
                isPrimary: domain.isPrimary,
                createdAt: domain.createdAt.toISOString(),
              }
            : null
        }
        canManage={canManage}
        canVerify={canVerify}
      />
    </div>
  );
}
