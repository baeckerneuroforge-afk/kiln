/**
 * Sprint 19.7.3 — Sub-Org analytics dashboard.
 *
 * Read-only for every permission level (analytics.read is in READ_ONLY).
 * Aggregates from LlmUsage + counts on Conversation / Agent / AgentTeam.
 * Default window is 7 days; future sprint adds a period picker.
 */
import { notFound } from "next/navigation";
import { Activity, Bot, MessageSquare, Workflow, Coins } from "lucide-react";
import { getSubOrgContext } from "@/lib/sub-org/get-sub-org-context";
import { getSubOrgUsageStats } from "@/lib/sub-org/get-sub-org-data";

export const dynamic = "force-dynamic";

interface PageProps { params: { subOrgId: string } }

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="font-serif text-2xl text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default async function SubOrgAnalyticsPage({ params }: PageProps) {
  const context = await getSubOrgContext(params.subOrgId);
  if (!context) notFound();
  if (!context.permissions.has("analytics.read")) notFound();

  const stats = await getSubOrgUsageStats(context.clerkOrgId, "week");
  const tokens = stats.inputTokens + stats.outputTokens;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 font-serif text-2xl text-foreground">
          <Activity className="h-5 w-5 text-kiln-orange" />
          Analytics
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Nutzung der letzten 7 Tage in {context.subOrg.subOrgName}.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="sub-org-analytics-stats">
        <StatCard
          icon={MessageSquare}
          label="Conversations (gesamt)"
          value={stats.conversationCount}
        />
        <StatCard icon={Bot} label="Agents" value={stats.agentCount} />
        <StatCard icon={Workflow} label="Workflows" value={stats.workflowCount} />
        <StatCard
          icon={Activity}
          label="LLM-Calls (7T)"
          value={stats.llmCalls}
          hint={`${tokens.toLocaleString("de-DE")} Tokens`}
        />
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <StatCard
          icon={Coins}
          label="Kosten (7T)"
          value={`$${stats.costUsd.toFixed(2)}`}
        />
        <StatCard
          icon={Activity}
          label="Cached Tokens (7T)"
          value={stats.cachedInputTokens.toLocaleString("de-DE")}
        />
      </section>

      {stats.llmCalls === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-border bg-card/30 p-6 text-center text-sm text-muted-foreground" data-testid="sub-org-analytics-empty">
          Noch keine LLM-Aktivität in den letzten 7 Tagen.
        </p>
      )}
    </div>
  );
}
