"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Download, Trash2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

interface ExportRow {
  id: string;
  status: string;
  scope: string;
  format: string;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  fileUrl: string | null;
  fileSizeBytes: string | null;
}

interface DeletionRow {
  id: string;
  status: string;
  scope: string;
  reason: string | null;
  graceUntil: string;
  scheduledFor: string | null;
  executedAt: string | null;
  createdAt: string;
}

export default function DsgvoPage() {
  const [exports, setExports] = useState<ExportRow[]>([]);
  const [deletions, setDeletions] = useState<DeletionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    const [e, d] = await Promise.all([
      fetch("/api/dsgvo/export").then((res) => (res.ok ? res.json() : null)),
      fetch("/api/dsgvo/delete").then((res) => (res.ok ? res.json() : null)),
    ]);
    if (e?.exports) setExports(e.exports);
    if (d?.deletions) setDeletions(d.deletions);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const startExport = useCallback(async () => {
    setBusy("export");
    await fetch("/api/dsgvo/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "FULL", format: "JSON" }) });
    setBusy(null);
    await refresh();
  }, [refresh]);

  const startDeletion = useCallback(async () => {
    if (!confirm("Wirklich Loeschung beantragen? 30 Tage Bedenkzeit, anschliessend werden alle Daten unwiderruflich entfernt.")) return;
    setBusy("delete");
    await fetch("/api/dsgvo/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "FULL", reason: reason.trim() || null }),
    });
    setBusy(null);
    setReason("");
    await refresh();
  }, [reason, refresh]);

  const cancelDeletion = useCallback(
    async (id: string) => {
      if (!confirm("Loesch-Auftrag wirklich stornieren?")) return;
      await fetch(`/api/dsgvo/delete/${id}/cancel`, { method: "POST" });
      await refresh();
    },
    [refresh],
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">DSGVO-Tools</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Datenexport und Loeschung gemaess DSGVO. Loeschungen haben 30 Tage Bedenkzeit.
        </p>
      </div>

      <section className="rounded-md border border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Datenexport</h2>
          <Button onClick={startExport} disabled={busy === "export"}>
            <Download className="mr-2 h-4 w-4" /> Export anfordern
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Erstellt einen vollstaendigen Snapshot deiner Sub-Org-Daten. Download ist 7 Tage gueltig.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {exports.length === 0 && !loading ? (
            <li className="rounded-md border border-dashed border-border p-3 text-muted-foreground">Keine Exporte bisher.</li>
          ) : null}
          {exports.map((row) => (
            <li key={row.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={row.status === "READY" ? "default" : row.status === "FAILED" ? "destructive" : "outline"}>{row.status}</Badge>
                <span>scope={row.scope}</span>
                <span>·</span>
                <span>{new Date(row.createdAt).toLocaleString("de-DE")}</span>
                {row.fileSizeBytes ? <span>· {Math.round(Number(row.fileSizeBytes) / 1024)} KB</span> : null}
              </div>
              {row.status === "READY" && row.fileUrl ? (
                <a href={row.fileUrl} download={`export-${row.id}.json`} className="mt-1 inline-block text-sm text-primary underline">
                  Download
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-md border border-destructive/40 bg-destructive/5 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
          <ShieldAlert className="h-4 w-4" /> DSGVO-Loeschung
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Beantragt eine vollstaendige Loeschung. 30 Tage Bedenkzeit, danach werden alle Customer-, Department-, Memory- und SLA-Daten unwiderruflich entfernt.
          Buchhaltungspflichtige Stripe-Daten bleiben gemaess HGB §257 erhalten.
        </p>
        <div className="mt-3 grid gap-2">
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Begruendung (optional)" rows={2} />
          <div>
            <Button variant="destructive" onClick={startDeletion} disabled={busy === "delete"}>
              <Trash2 className="mr-2 h-4 w-4" /> Loeschung beantragen
            </Button>
          </div>
        </div>
        <ul className="mt-4 space-y-2 text-sm">
          {deletions.map((row) => (
            <li key={row.id} className="rounded-md border border-border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={row.status === "COMPLETED" ? "destructive" : row.status === "CANCELLED" ? "outline" : "secondary"}>{row.status}</Badge>
                <span>scope={row.scope}</span>
                <span>·</span>
                <span>graceUntil={new Date(row.graceUntil).toLocaleDateString("de-DE")}</span>
              </div>
              {row.reason ? <p className="mt-1 text-foreground">{row.reason}</p> : null}
              {row.status === "GRACE_PERIOD" || row.status === "PENDING" ? (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => cancelDeletion(row.id)}>
                  Stornieren
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {loading ? (
        <div className="flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : null}
    </div>
  );
}
