"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ReportRow {
  id: string;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  recipientEmail: string;
  sentAt: string | null;
  createdAt: string;
}

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/reports");
    if (res.ok) {
      const data = await res.json();
      setReports(data.reports ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleGenerate = useCallback(async () => {
    setBusy(true);
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString();
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    await fetch("/api/reports/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ periodStart, periodEnd, sendImmediately: false }),
    });
    setBusy(false);
    await refresh();
  }, [refresh]);

  const handleSend = useCallback(
    async (id: string) => {
      if (!confirm("Report jetzt versenden?")) return;
      await fetch(`/api/reports/${id}/send`, { method: "POST" });
      await refresh();
    },
    [refresh],
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monatliche Reports werden automatisch erstellt und an die hinterlegten Empfaenger gesendet.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/reports/settings">
            <Button variant="outline" size="sm">
              <Settings className="mr-2 h-4 w-4" /> Einstellungen
            </Button>
          </Link>
          <Button onClick={handleGenerate} disabled={busy}>
            <Plus className="mr-2 h-4 w-4" /> Letzten Monat generieren
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : reports.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          Noch keine Reports — beim Monatsende kommt automatisch der erste.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Zeitraum</th>
                <th className="px-3 py-2">Empfaenger</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Gesendet</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id} className="border-t border-border">
                  <td className="px-3 py-2 text-foreground">
                    {new Date(report.periodStart).toLocaleDateString("de-DE")} —
                    {" "}
                    {new Date(report.periodEnd).toLocaleDateString("de-DE")}
                    <div className="text-[11px] text-muted-foreground">{report.periodType}</div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{report.recipientEmail}</td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={
                        report.status === "SENT"
                          ? "default"
                          : report.status === "FAILED"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {report.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {report.sentAt ? new Date(report.sentAt).toLocaleString("de-DE") : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/dashboard/reports/${report.id}`} className="mr-2">
                      <Button size="sm" variant="outline">Details</Button>
                    </Link>
                    {report.status === "READY" || report.status === "FAILED" ? (
                      <Button size="sm" onClick={() => handleSend(report.id)}>
                        Senden
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
