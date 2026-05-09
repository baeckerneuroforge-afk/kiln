"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ReportDetail {
  id: string;
  periodStart: string;
  periodEnd: string;
  periodType: string;
  status: string;
  recipientEmail: string;
  sentAt: string | null;
  metrics: Record<string, unknown>;
  highlights: string[] | null;
  htmlBody: string | null;
}

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const res = await fetch(`/api/reports/${id}`);
    if (res.ok) {
      setReport((await res.json()) as ReportDetail);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSend = useCallback(async () => {
    if (!id) return;
    setBusy(true);
    await fetch(`/api/reports/${id}/send`, { method: "POST" });
    setBusy(false);
    await refresh();
  }, [id, refresh]);

  if (loading || !report) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const metrics = report.metrics as Record<string, number | string | null>;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      <Link href="/dashboard/reports" className="text-xs text-muted-foreground hover:underline">
        ← Reports
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Report {new Date(report.periodStart).toLocaleDateString("de-DE")} —{" "}
            {new Date(report.periodEnd).toLocaleDateString("de-DE")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Empfaenger: {report.recipientEmail} · {report.periodType}
            {report.sentAt ? ` · gesendet ${new Date(report.sentAt).toLocaleString("de-DE")}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={report.status === "SENT" ? "default" : report.status === "FAILED" ? "destructive" : "outline"}>
            {report.status}
          </Badge>
          {report.status === "READY" || report.status === "FAILED" ? (
            <Button onClick={handleSend} disabled={busy}>
              <Send className="mr-2 h-4 w-4" /> Senden
            </Button>
          ) : null}
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <Stat label="Anfragen" value={Number(metrics.conversationsTotal ?? 0).toLocaleString("de-DE")} />
        <Stat label="SLA" value={`${Number(metrics.slaCompliancePercent ?? 0)}%`} />
        <Stat label="Avg. Reaktion" value={metrics.avgFirstResponseMinutes ? `${metrics.avgFirstResponseMinutes} Min` : "—"} />
        <Stat label="Kosten gespart" value={`${Number(metrics.costSavedEur ?? 0).toLocaleString("de-DE")} €`} />
      </section>

      {report.highlights && report.highlights.length > 0 ? (
        <section className="rounded-md border border-border p-4">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Highlights</h2>
          <ul className="space-y-1 text-sm text-foreground">
            {report.highlights.map((line, index) => (
              <li key={index}>• {line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {report.htmlBody ? (
        <section className="rounded-md border border-border">
          <h2 className="border-b border-border px-4 py-2 text-sm font-semibold text-foreground">Email-Vorschau</h2>
          <iframe
            title="Report Preview"
            srcDoc={report.htmlBody}
            className="h-[600px] w-full"
          />
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}
