/**
 * Sprint 19.8 — sub-org custom-domain settings.
 *
 * Server component bootstraps caller permission + initial domain list,
 * then hands off to the client orchestrator for add/verify/remove
 * interactions. Permission gate matches the rest of /settings/* —
 * any member can read, only OWNER/ADMIN can mutate (enforced both
 * server-side here and again in the API route).
 */
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import {
  canManageSubOrgMembers,
  getUserSubOrgMembership,
} from "@/lib/permissions/sub-org-permissions";
import { listDomainsForSubOrg } from "@/lib/domains/domain-manager";
import { DomainsSettingsClient } from "@/components/sub-org/domains-settings-client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { subOrgId: string };
}

export default async function DomainsSettingsPage({ params }: PageProps) {
  const { userId } = await auth();
  if (!userId) notFound();

  const membership = await getUserSubOrgMembership(userId, params.subOrgId);
  if (!membership) notFound();

  const domains = await listDomainsForSubOrg({ subOrgId: params.subOrgId });
  const canManage = canManageSubOrgMembers(membership);

  return (
    <div className="mx-auto max-w-3xl py-8">
      <header className="mb-6">
        <h1 className="font-serif text-2xl text-foreground">Custom-Domains</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Verbinde deinen eigenen DNS-Namen mit dieser Sub-Org. Endkunden landen
          dann auf deiner Domain statt auf kilnbase.com.
        </p>
      </header>
      <DomainsSettingsClient
        subOrgId={params.subOrgId}
        canManage={canManage}
        initialDomains={domains.map((d) => ({
          id: d.id,
          hostname: d.hostname,
          status: d.status,
          sslStatus: d.sslStatus,
          isPrimary: d.isPrimary,
          createdAt: d.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
