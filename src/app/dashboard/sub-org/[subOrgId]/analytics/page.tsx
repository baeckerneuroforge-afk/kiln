/**
 * Sprint 19.7.3 — Sub-Org analytics dashboard.
 *
 * Read-only for every permission level (analytics.read is in READ_ONLY).
 * Aggregates from LlmUsage + counts on Conversation / Agent / AgentTeam.
 * Default window is 7 days; future sprint adds a period picker.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, Bot, MessageSquare, Workflow, Coins } from "lucide-react";
import { getSubOrgContext } from "@/lib/sub-org/get-sub-org-context";
import { getSubOrgUsageStats } from "@/lib/sub-org/get-sub-org-data";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { subOrgId: string };
  searchParams?: { period?: string };
}

type Period = "week" | "month";

function parsePeriod(raw: string | undefined): Period {
  return raw === "month" ? "month" : "week";
}

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

export default async function SubOrgAnalyticsPage({ params, searchParams }: PageProps) {
  const context = await getSubOrgContext(params.subOrgId);
  if (!context) notFound();
  if (!context.permissions.has("analytics.read")) notFound();

  const period = parsePeriod(searchParams?.period);
  const stats = await getSubOrgUsageStats(context.clerkOrgId, period);
  const tokens = stats.inputTokens + stats.outputTokens;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-2xl text-foreground">
            <Activity className="h-5 w-5 text-kiln-orange" />
            Analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nutzung der {period === "week" ? "letzten 7 Tage" : "letzten 30 Tage"} in {context.subOrg.subOrgName}.
          </p>
        </div>
        <div
          className="inline-flex rounded-md border border-border bg-card/40 p-1 text-xs"
          data-testid="sub-org-analytics-period-switcher"
        >
          <Link
            href={`/dashboard/sub-org/${params.subOrgId}/analytics?period=week`}
            className={cn(
              "rounded px-2.5 py-1",
              period === "week"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-testid="sub-org-analytics-period-week"
          >
            7 Tage
          </Link>
          <Link
            href={`/dashboard/sub-org/${params.subOrgId}/analytics?period=month`}
            className={cn(
              "rounded px-2.5 py-1",
              period === "month"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-testid="sub-org-analytics-period-month"
          >
            30 Tage
          </Link>
        </div>
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
          label={`LLM-Calls (${period === "week" ? "7T" : "30T"})`}
          value={stats.llmCalls}
          hint={`${tokens.toLocaleString("de-DE")} Tokens`}
        />
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <StatCard
          icon={Coins}
          label={`Kosten (${period === "week" ? "7T" : "30T"})`}
          value={`$${stats.costUsd.toFixed(2)}`}
        />
        <StatCard
          icon={Activity}
          label={`Cached Tokens (${period === "week" ? "7T" : "30T"})`}
          value={stats.cachedInputTokens.toLocaleString("de-DE")}
        />
      </section>

      {stats.llmCalls === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-border bg-card/30 p-6 text-center text-sm text-muted-foreground" data-testid="sub-org-analytics-empty">
          Noch keine LLM-Aktivität in {period === "week" ? "den letzten 7 Tagen" : "den letzten 30 Tagen"}.
        </p>
      )}
    </div>
  );
}
