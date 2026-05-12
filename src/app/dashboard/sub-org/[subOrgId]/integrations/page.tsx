/**
 * Sprint 19.7.4 — Sub-Org Integrations.
 *
 * Three tabs: API Keys (real), OAuth (status surface — wiring lands in
 * 19.7.5), Module Settings (deep link back to the agency-side editor).
 *
 * Anyone with sub-org membership can land on this page; per-tab actions
 * gate on integrations.manage.
 */
import { notFound } from "next/navigation";
import { Plug } from "lucide-react";
import { getSubOrgContext } from "@/lib/sub-org/get-sub-org-context";
import { IntegrationsTabs } from "@/components/sub-org/integrations-tabs";

export const dynamic = "force-dynamic";

interface PageProps { params: { subOrgId: string } }

export default async function SubOrgIntegrationsPage({ params }: PageProps) {
  const context = await getSubOrgContext(params.subOrgId);
  if (!context) notFound();
  if (!context.permissions.has("integrations.read")) notFound();

  const canManage = context.permissions.has("integrations.manage");
  const agencyOrgPath = `/dashboard/agency/sub-orgs/${context.subOrg.id}/modules`;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 font-serif text-2xl text-foreground">
          <Plug className="h-5 w-5 text-kiln-orange" />
          Integrations
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          API-Keys, OAuth-Connections und Module-Settings für {context.subOrg.subOrgName}.
        </p>
      </header>

      <IntegrationsTabs
        subOrgId={context.subOrg.id}
        agencyOrgPath={agencyOrgPath}
        canManage={canManage}
      />
    </div>
  );
}
