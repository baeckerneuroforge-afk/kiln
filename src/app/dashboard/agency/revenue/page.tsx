"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Loader2,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

type RevenueSnapshot = {
  mrr: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  pastDueSubscriptions: number;
  canceledLast30d: number;
  revenue30d: number;
  revenue90d: number;
  currency: string;
  subOrgs: Array<{
    subOrgId: string;
    name: string;
    status: string;
    mrrContribution: number;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  }>;
};

const STATUS_PILL: Record<string, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-600",
  TRIALING: "bg-blue-500/10 text-blue-600",
  PAST_DUE: "bg-amber-500/10 text-amber-600",
  CANCELED: "bg-muted text-muted-foreground",
  UNPAID: "bg-destructive/10 text-destructive",
  INCOMPLETE: "bg-muted text-muted-foreground",
};

export default function AgencyRevenuePage() {
  const [data, setData] = useState<RevenueSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/agency/revenue")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Load failed");
        setData(body);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Load failed"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl">
        <Header />
        <div className="flex items-center justify-center rounded-xl border border-border bg-card/60 p-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl">
        <Header />
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="text-sm text-destructive">{error}</div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const allZero =
    data.mrr === 0 &&
    data.activeSubscriptions === 0 &&
    data.trialSubscriptions === 0 &&
    data.revenue30d === 0;

  return (
    <div className="mx-auto max-w-5xl">
      <Header />

      {allZero ? (
        <EmptyState />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi
              label="MRR"
              value={formatMoney(data.mrr, data.currency)}
              accent="emerald"
            />
            <Kpi label="Active subs" value={String(data.activeSubscriptions)} />
            <Kpi label="Trials" value={String(data.trialSubscriptions)} />
            <Kpi label="Past due" value={String(data.pastDueSubscriptions)} />
            <Kpi
              label="Last 30d revenue"
              value={formatMoney(data.revenue30d, data.currency)}
            />
          </div>

          <SubOrgTable subOrgs={data.subOrgs} currency={data.currency} />
        </>
      )}
    </div>
  );
}

function Header() {
  return (
    <header className="mb-6">
      <h1 className="flex items-center gap-2 font-serif text-2xl text-foreground">
        <TrendingUp className="h-5 w-5 text-kiln-orange" />
        Agency Revenue
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Sub-org subscriptions billed via Stripe Connect. KILN takes no cut —
        these numbers are your revenue, not ours.
      </p>
    </header>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
        <Building2 className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="text-base font-semibold text-foreground">
        No subscriptions yet
      </h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Configure pricing on a sub-org and have your client activate their
        subscription to see revenue here.
      </p>
      <Link
        href="/dashboard/agency/sub-orgs"
        className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-kiln-orange transition-colors hover:text-kiln-orange/80"
      >
        Open sub-orgs
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tracking-tight",
          accent === "emerald" ? "text-emerald-600" : "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function SubOrgTable({
  subOrgs,
  currency,
}: {
  subOrgs: RevenueSnapshot["subOrgs"];
  currency: string;
}) {
  if (subOrgs.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        No subscriptions yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b border-border px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <div>Sub-org</div>
        <div>Status</div>
        <div className="text-right">MRR</div>
        <div className="text-right">Renews</div>
      </div>
      <ul className="divide-y divide-border">
        {subOrgs.map((sub) => (
          <li
            key={sub.subOrgId}
            className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-3 text-sm"
          >
            <div className="min-w-0 truncate font-medium text-foreground">
              {sub.name}
              {sub.cancelAtPeriodEnd && (
                <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                  Canceling
                </span>
              )}
            </div>
            <div>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                  STATUS_PILL[sub.status] ?? STATUS_PILL.INCOMPLETE
                )}
              >
                {sub.status}
              </span>
            </div>
            <div className="text-right tabular-nums text-foreground">
              {sub.mrrContribution > 0
                ? formatMoney(sub.mrrContribution, currency)
                : "—"}
            </div>
            <div className="text-right text-xs text-muted-foreground">
              {sub.currentPeriodEnd
                ? new Date(sub.currentPeriodEnd).toLocaleDateString()
                : "—"}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatMoney(cents: number, currency: string) {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  });
}
