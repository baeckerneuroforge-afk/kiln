"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ComplianceWindow {
  windowDays: number;
  total: number;
  met: number;
  breached: number;
  open: number;
  warning: number;
  cancelled: number;
  compliancePercent: number;
  avgFirstResponseMinutes: number | null;
}

interface ComplianceResponse {
  last7Days: ComplianceWindow;
  last30Days: ComplianceWindow;
}

interface BreachRow {
  id: string;
  departmentId: string;
  startedAt: string;
  firstResponseMinutes: number | null;
  resolutionMinutes: number | null;
  policyName: string;
  customerProfileId: string | null;
}

interface TrackingRow {
  id: string;
  departmentId: string;
  status: string;
  startedAt: string;
  firstResponseAt: string | null;
  firstResponseMinutes: number | null;
  slaPolicy: { id: string; name: string; firstResponseTargetMinutes: number };
}

export default function SlaDashboardPage() {
  const [compliance, setCompliance] = useState<ComplianceResponse | null>(null);
  const [breaches, setBreaches] = useState<BreachRow[]>([]);
  const [trackings, setTrackings] = useState<TrackingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [c, b, t] = await Promise.all([
        fetch("/api/sla/reports/compliance").then((res) => (res.ok ? res.json() : null)),
        fetch("/api/sla/reports/breaches").then((res) => (res.ok ? res.json() : null)),
        fetch("/api/sla/trackings?limit=50").then((res) => (res.ok ? res.json() : null)),
      ]);
      if (cancelled) return;
      if (c) setCompliance(c);
      if (b?.breaches) setBreaches(b.breaches);
      if (t?.trackings) setTrackings(t.trackings);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const tally = { OPEN: 0, WARNING: 0, BREACHED: 0, MET: 0 } as Record<string, number>;
    for (const tracking of trackings) {
      tally[tracking.status] = (tally[tracking.status] ?? 0) + 1;
    }
    return tally;
  }, [trackings]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">SLA & Reaktionszeiten</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reaktionszeit-Compliance pro Department, Eskalationen und offene Trackings.
        </p>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <Card icon={<Activity className="h-4 w-4" />} label="Aktiv (open)" value={counts.OPEN ?? 0} tone="default" />
        <Card icon={<Clock className="h-4 w-4" />} label="Warnung" value={counts.WARNING ?? 0} tone="warn" />
        <Card icon={<AlertTriangle className="h-4 w-4" />} label="Bruch" value={counts.BREACHED ?? 0} tone="danger" />
        <Card icon={<CheckCircle2 className="h-4 w-4" />} label="Erfuellt" value={counts.MET ?? 0} tone="success" />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <ComplianceCard title="Letzte 7 Tage" data={compliance?.last7Days ?? null} />
        <ComplianceCard title="Letzte 30 Tage" data={compliance?.last30Days ?? null} />
      </section>

      <section className="rounded-lg border border-border p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Recent Breaches</h2>
        {breaches.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Brueche im aktuellen Zeitraum.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {breaches.map((row) => (
              <li key={row.id} className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="destructive">BREACHED</Badge>
                  <span>{row.policyName}</span>
                  <span>·</span>
                  <span>{new Date(row.startedAt).toLocaleString("de-DE")}</span>
                  {row.firstResponseMinutes !== null ? <span>· {row.firstResponseMinutes} Min</span> : null}
                </div>
                <p className="mt-1 text-foreground">
                  Department <Link href={`/dashboard/departments/${row.departmentId}/sla`} className="underline">{row.departmentId}</Link>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Aktive Trackings</h2>
        {trackings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine aktiven SLA-Trackings.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Policy</th>
                <th className="px-2 py-2">Department</th>
                <th className="px-2 py-2">Gestartet</th>
                <th className="px-2 py-2">Erste Antwort</th>
              </tr>
            </thead>
            <tbody>
              {trackings.map((tracking) => (
                <tr key={tracking.id} className="border-t border-border">
                  <td className="px-2 py-2">
                    <Badge variant={tracking.status === "BREACHED" ? "destructive" : tracking.status === "WARNING" ? "secondary" : "outline"}>
                      {tracking.status}
                    </Badge>
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">{tracking.slaPolicy.name}</td>
                  <td className="px-2 py-2 text-muted-foreground">
                    <Link href={`/dashboard/departments/${tracking.departmentId}/sla`} className="hover:underline">{tracking.departmentId}</Link>
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">{new Date(tracking.startedAt).toLocaleString("de-DE")}</td>
                  <td className="px-2 py-2 text-muted-foreground">
                    {tracking.firstResponseMinutes !== null ? `${tracking.firstResponseMinutes} Min` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Card({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "default" | "warn" | "danger" | "success" }) {
  const colorClass =
    tone === "warn"
      ? "text-yellow-500"
      : tone === "danger"
        ? "text-red-500"
        : tone === "success"
          ? "text-green-500"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className={`flex items-center gap-2 text-xs uppercase ${colorClass}`}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-3xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function ComplianceCard({ title, data }: { title: string; data: ComplianceWindow | null }) {
  if (!data) {
    return (
      <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">{title}: keine Daten</div>
    );
  }
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="text-xs uppercase text-muted-foreground">{title}</div>
      <div className="mt-2 flex items-end justify-between">
        <div className="text-3xl font-semibold text-foreground">{data.compliancePercent}%</div>
        <div className="text-xs text-muted-foreground">
          {data.met} erfuellt / {data.breached} Brueche
        </div>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        Avg. erste Antwort: {data.avgFirstResponseMinutes !== null ? `${data.avgFirstResponseMinutes} Min` : "—"}
      </div>
    </div>
  );
}
