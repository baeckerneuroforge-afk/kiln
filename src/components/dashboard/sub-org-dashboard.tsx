"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bot, Building2, CheckCircle2, MessageSquare, Plus, Waypoints } from "lucide-react";

type RecentConversation = {
  id: string;
  visitorName: string | null;
  visitorEmail: string | null;
  channel: string;
  agentName: string;
  updatedAt: string;
};

type SubOrgDashboardData = {
  subOrgName: string;
  brandColor: string | null;
  logoUrl: string | null;
  conversationsToday: number;
  pendingApprovals: number;
  activeDepartments: number;
  recentConversations: RecentConversation[];
};

const defaultData: SubOrgDashboardData = {
  subOrgName: "Customer Workspace",
  brandColor: null,
  logoUrl: null,
  conversationsToday: 0,
  pendingApprovals: 0,
  activeDepartments: 0,
  recentConversations: [],
};

export function SubOrgDashboard() {
  const [data, setData] = useState<SubOrgDashboardData>(defaultData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/org/sub-org-dashboard", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : defaultData))
      .then((payload: SubOrgDashboardData) => {
        if (!cancelled) setData(payload);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const accent = data.brandColor ?? "#F97316";

  return (
    <div className="mx-auto max-w-5xl animate-in fade-in duration-200">
      <div className="mb-6 flex items-center gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border bg-card"
          style={{ borderColor: accent }}
        >
          {data.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.logoUrl} alt={data.subOrgName} className="h-8 w-8 object-contain" />
          ) : (
            <Building2 className="h-6 w-6" style={{ color: accent }} />
          )}
        </div>
        <div>
          <h1 className="font-serif text-3xl font-normal text-foreground">
            Willkommen bei {data.subOrgName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ihre tägliche Arbeitsansicht für Conversations, Freigaben und Departments.
          </p>
        </div>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <Metric label="Conversations heute" value={data.conversationsToday} loading={loading} icon={MessageSquare} />
        <Metric label="Pending Approvals" value={data.pendingApprovals} loading={loading} icon={CheckCircle2} />
        <Metric label="Active Departments" value={data.activeDepartments} loading={loading} icon={Building2} />
      </div>

      {data.activeDepartments === 0 && !loading && (
        <div className="mb-8 rounded-lg border border-dashed border-border bg-card/50 p-5">
          <h2 className="text-base font-semibold text-foreground">Noch keine Departments installiert</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Starten Sie mit einem Agency-Template oder Industry-Pack, damit die tägliche Arbeit sofort in den richtigen Views landet.
          </p>
          <Link
            href="/dashboard/departments"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-kiln-orange px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-kiln-orange/90"
          >
            <Plus className="h-4 w-4" />
            Template importieren
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Recent Conversations
            </h2>
            <Link href="/dashboard/conversations" className="text-xs font-medium text-kiln-orange hover:text-kiln-orange/80">
              Alle ansehen
            </Link>
          </div>
          <div className="overflow-hidden rounded-lg border border-border bg-card/60">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="border-b border-border p-4 last:border-b-0">
                  <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                  <div className="mt-2 h-3 w-56 animate-pulse rounded bg-muted/70" />
                </div>
              ))
            ) : data.recentConversations.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                Noch keine Conversations in dieser Sub-Org.
              </div>
            ) : (
              data.recentConversations.map((conversation) => (
                <Link
                  key={conversation.id}
                  href={`/dashboard/conversations?conversation=${conversation.id}`}
                  className="block border-b border-border p-4 transition-colors hover:bg-muted/40 last:border-b-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium text-foreground">
                      {conversation.visitorName ?? conversation.visitorEmail ?? "Unbekannter Kontakt"}
                    </p>
                    <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {conversation.channel}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {conversation.agentName} · {new Date(conversation.updatedAt).toLocaleString("de-DE")}
                  </p>
                </Link>
              ))
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Quick Actions
          </h2>
          <div className="grid gap-2">
            <QuickAction href="/dashboard/agents/new" icon={Bot} label="Create Agent" />
            <QuickAction href="/dashboard/knowledge" icon={Waypoints} label="Add Knowledge" />
            <QuickAction href="/dashboard/departments" icon={CheckCircle2} label="View Approvals" />
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  loading,
  icon: Icon,
}: {
  label: string;
  value: number;
  loading: boolean;
  icon: typeof MessageSquare;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      {loading ? (
        <div className="h-8 w-16 animate-pulse rounded bg-muted" />
      ) : (
        <p className="text-3xl font-semibold tracking-tight text-foreground">{value.toLocaleString("de-DE")}</p>
      )}
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof MessageSquare;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-md border border-border bg-card/60 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
    >
      <Icon className="h-4 w-4 text-kiln-orange" />
      {label}
    </Link>
  );
}
