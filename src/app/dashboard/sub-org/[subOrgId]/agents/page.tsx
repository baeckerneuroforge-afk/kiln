/**
 * Sprint 19.7.3 — Sub-Org agents list.
 *
 * Permission matrix:
 *   READ_ONLY                  → notFound() (no agents.read in matrix)
 *   USE_AGENTS / +KNOWLEDGE    → read-only list
 *   FULL_ACCESS                → list + "Create Agent" CTA
 *
 * Mutation flows (create / edit) are gated server-side; the UI surfaces
 * the button when the caller has `agents.write` but the actual create
 * route lives outside this sprint's scope.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { Bot, Lock, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getSubOrgContext } from "@/lib/sub-org/get-sub-org-context";
import { getSubOrgAgents } from "@/lib/sub-org/get-sub-org-data";
import { getAvailableAgentTemplateUpdates } from "@/lib/sub-org/get-template-updates";
import { TemplateUpdatesBanner } from "@/components/sub-org/template-updates-banner";

export const dynamic = "force-dynamic";

interface PageProps { params: { subOrgId: string } }

export default async function SubOrgAgentsPage({ params }: PageProps) {
  const context = await getSubOrgContext(params.subOrgId);
  if (!context) notFound();
  if (!context.permissions.has("agents.read")) notFound();

  const canWrite = context.permissions.has("agents.write");
  const agents = await getSubOrgAgents(context.clerkOrgId);
  const templateUpdates = await getAvailableAgentTemplateUpdates(context.clerkOrgId);

  return (
    <div className="mx-auto max-w-5xl">
      <TemplateUpdatesBanner updates={templateUpdates} kind="agents" />

      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-2xl text-foreground">
            <Bot className="h-5 w-5 text-kiln-orange" />
            Agents
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Agents im Workspace {context.subOrg.subOrgName}.
          </p>
        </div>
        {canWrite ? (
          <Link
            href="/dashboard/agents/new"
            className={buttonVariants()}
            data-testid="sub-org-agents-create-cta"
          >
            <Plus className="mr-1 h-4 w-4" /> Agent erstellen
          </Link>
        ) : (
          <span
            data-testid="sub-org-agents-readonly-badge"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card/40 px-3 py-1.5 text-xs text-muted-foreground"
          >
            <Lock className="h-3 w-3" /> Nur Lesen
          </span>
        )}
      </header>

      {agents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/30 p-10 text-center" data-testid="sub-org-agents-empty">
          <Bot className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <p className="text-base font-medium text-foreground">Noch keine Agents.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canWrite
              ? "Lege deinen ersten Agent an um zu starten."
              : "Kontaktiere deine Agency, um den ersten Agent erstellen zu lassen."}
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="sub-org-agents-list">
          {agents.map((agent) => (
            <div key={agent.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{agent.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {agent.llmModel} · {agent.status}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                  {agent.createdAt.toLocaleDateString("de-DE")}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
