/**
 * Sprint 19.7.3 — Sub-Org workflows list (backed by AgentTeam).
 *
 * Permission matrix mirrors the agents page:
 *   READ_ONLY                  → notFound()
 *   USE_AGENTS / +KNOWLEDGE    → read-only
 *   FULL_ACCESS                → list + create
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { Workflow, Lock, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { getSubOrgContext } from "@/lib/sub-org/get-sub-org-context";
import { getSubOrgWorkflows } from "@/lib/sub-org/get-sub-org-data";
import { getAvailableWorkflowTemplateUpdates } from "@/lib/sub-org/get-template-updates";
import { TemplateUpdatesBanner } from "@/components/sub-org/template-updates-banner";

export const dynamic = "force-dynamic";

interface PageProps { params: { subOrgId: string } }

export default async function SubOrgWorkflowsPage({ params }: PageProps) {
  const context = await getSubOrgContext(params.subOrgId);
  if (!context) notFound();
  // USE_AGENTS includes agents.read which we use as the workflow gate
  // here too — workflows.read is in FULL_ACCESS but a workflow list
  // also makes sense for USE_AGENTS callers who run them.
  if (!context.permissions.has("agents.read")) notFound();

  const canWrite = context.permissions.has("workflows.write");
  const workflows = await getSubOrgWorkflows(context.clerkOrgId);
  const templateUpdates = await getAvailableWorkflowTemplateUpdates(context.clerkOrgId);

  return (
    <div className="mx-auto max-w-5xl">
      <TemplateUpdatesBanner updates={templateUpdates} kind="workflows" />

      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-2xl text-foreground">
            <Workflow className="h-5 w-5 text-kiln-orange" />
            Workflows
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Multi-Step-Workflows im Workspace {context.subOrg.subOrgName}.
          </p>
        </div>
        {canWrite ? (
          <Link
            href="/dashboard/teams/new"
            className={buttonVariants()}
            data-testid="sub-org-workflows-create-cta"
          >
            <Plus className="mr-1 h-4 w-4" /> Workflow erstellen
          </Link>
        ) : (
          <span
            data-testid="sub-org-workflows-readonly-badge"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card/40 px-3 py-1.5 text-xs text-muted-foreground"
          >
            <Lock className="h-3 w-3" /> Nur Lesen
          </span>
        )}
      </header>

      {workflows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/30 p-10 text-center" data-testid="sub-org-workflows-empty">
          <Workflow className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <p className="text-base font-medium text-foreground">Noch keine Workflows.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canWrite
              ? "Lege deinen ersten Workflow an."
              : "Kontaktiere deine Agency, um Workflows einzurichten."}
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="sub-org-workflows-list">
          {workflows.map((w) => (
            <div key={w.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{w.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {w.memberCount} Member · {w.status}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                  {w.createdAt.toLocaleDateString("de-DE")}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
