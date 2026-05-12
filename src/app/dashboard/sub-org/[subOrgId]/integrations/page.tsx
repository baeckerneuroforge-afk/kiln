/**
 * Sprint 19.7.3 — Sub-Org integrations stub.
 *
 * The full integrations management UI lands in Sprint 19.7.4; this
 * page exists today so the sidebar link doesn't 404 and so future
 * pages can be added without touching nav config.
 */
import { notFound } from "next/navigation";
import { Plug, Construction } from "lucide-react";
import { getSubOrgContext } from "@/lib/sub-org/get-sub-org-context";

export const dynamic = "force-dynamic";

interface PageProps { params: { subOrgId: string } }

export default async function SubOrgIntegrationsPage({ params }: PageProps) {
  const context = await getSubOrgContext(params.subOrgId);
  if (!context) notFound();
  // All permission levels can land on this page — gating happens once
  // real management UI shows up in Sprint 19.7.4.

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 font-serif text-2xl text-foreground">
          <Plug className="h-5 w-5 text-kiln-orange" />
          Integrations
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Verbinde {context.subOrg.subOrgName} mit deinen Tools.
        </p>
      </header>

      <div className="rounded-xl border border-dashed border-border bg-card/30 p-10 text-center" data-testid="sub-org-integrations-stub">
        <Construction className="mx-auto mb-4 h-10 w-10 text-kiln-orange" />
        <p className="text-base font-medium text-foreground">
          Integrations werden in Kürze verfügbar sein.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Sprint 19.7.4 bringt OAuth-Konnektoren für Slack, Telegram, WhatsApp,
          Email und mehr — pro Sub-Org getrennt verwaltbar.
        </p>
      </div>
    </div>
  );
}
