/**
 * Sprint 19.7.5.1 — sub-org dashboard with real stats.
 *
 * Replaces the 19.7.2 placeholder ("Echte Daten folgen in 19.7.3") that
 * stayed in main long after the dedicated pages landed. The dashboard
 * now shows the 30-day usage rollup + a five-row recent-conversation
 * feed alongside the quick-link grid the user already knows.
 */
import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Bot,
  MessageSquare,
  Activity,
  Workflow,
  Waypoints,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUserSubOrgMembership } from "@/lib/permissions/sub-org-permissions";
import {
  getSubOrgConversations,
  getSubOrgUsageStats,
  getSubOrgKnowledgeBases,
} from "@/lib/sub-org/get-sub-org-data";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { subOrgId: string };
}

const NUMBER_DE = new Intl.NumberFormat("de-DE");

export default async function SubOrgDashboardPage({ params }: PageProps) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const membership = await getUserSubOrgMembership(userId, params.subOrgId);
  if (!membership) {
    notFound();
  }

  const subOrg = await prisma.orgRelationship.findUnique({
    where: { id: params.subOrgId },
    select: { id: true, childOrgId: true, subOrgName: true, brandColor: true },
  });
  if (!subOrg) {
    notFound();
  }

  // 30-day window for headline stats — matches the agency Verbrauchs-
  // Übersicht and feels representative for ongoing operations. The
  // dedicated /analytics page still defaults to 7 days for finer-grained
  // recent-activity inspection.
  const [stats, recentConversations, knowledgeBases] = await Promise.all([
    getSubOrgUsageStats(subOrg.childOrgId, "month"),
    getSubOrgConversations(subOrg.childOrgId, 5),
    getSubOrgKnowledgeBases(subOrg.childOrgId),
  ]);

  const base = `/dashboard/sub-org/${subOrg.id}`;
  const quickLinks = [
    { href: `${base}/agents`, icon: Bot, label: "Agents", hint: "Agents in dieser Sub-Org verwalten." },
    { href: `${base}/conversations`, icon: MessageSquare, label: "Conversations", hint: "Inbox + Verlauf je Channel." },
    { href: `${base}/analytics`, icon: Activity, label: "Analytics", hint: "Volume, Tokens, Kosten." },
  ];

  return (
    <div className="mx-auto max-w-5xl" data-testid="sub-org-dashboard">
      <header className="mb-8 flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-card/60"
          style={subOrg.brandColor ? { borderColor: subOrg.brandColor } : undefined}
        >
          <Building2 className="h-5 w-5 text-kiln-orange" />
        </div>
        <div>
          <h1 className="font-serif text-2xl text-foreground">
            Willkommen bei {subOrg.subOrgName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Du bist im Sub-Org-Kontext. Was du hier baust ist auf{" "}
            <span className="font-medium text-foreground">{subOrg.subOrgName}</span> beschränkt
            — nichts davon leckt in andere Sub-Orgs deiner Agency.
          </p>
        </div>
      </header>

      <section
        className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        data-testid="sub-org-dashboard-stats"
      >
        <StatCard
          icon={MessageSquare}
          label="Conversations (30T)"
          value={NUMBER_DE.format(stats.conversationCount)}
        />
        <StatCard icon={Bot} label="Agents" value={NUMBER_DE.format(stats.agentCount)} />
        <StatCard
          icon={Workflow}
          label="Workflows"
          value={NUMBER_DE.format(stats.workflowCount)}
        />
        <StatCard
          icon={Waypoints}
          label="Knowledge Bases"
          value={NUMBER_DE.format(knowledgeBases.length)}
        />
      </section>

      <section
        className="mb-6 rounded-xl border border-border bg-card/30 p-5"
        data-testid="sub-org-dashboard-recent"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent activity
          </p>
          <Link
            href={`${base}/conversations`}
            className="text-xs text-kiln-orange hover:underline"
          >
            Alle ansehen →
          </Link>
        </div>
        {recentConversations.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="sub-org-dashboard-recent-empty"
          >
            Noch keine Konversationen. Die erste Aktivität deiner Agents erscheint hier.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="sub-org-dashboard-recent-list">
            {recentConversations.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-md bg-card px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-foreground">
                    {c.visitorName || c.visitorEmail || "Anonym"}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {c.agentName ? `via ${c.agentName}` : "ohne Agent"}
                    {c.leadScore !== null && ` · Score ${c.leadScore}`}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {c.createdAt.toLocaleDateString("de-DE")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-3" data-testid="sub-org-dashboard-quick-links">
        {quickLinks.map(({ href, icon: Icon, label, hint }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-kiln-orange/40 hover:bg-card/80"
          >
            <Icon className="mb-3 h-5 w-5 text-kiln-orange" />
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Bot;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="font-serif text-2xl text-foreground">{value}</p>
    </div>
  );
}
