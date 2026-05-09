"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AuditEntry {
  id: string;
  createdAt: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  description: string | null;
  severity: string;
  actorUserId: string | null;
  actorType: string;
  ipAddress: string | null;
}

interface AuditResponse {
  entries: AuditEntry[];
  total: number;
  page: number;
  limit: number;
}

const SEVERITY_OPTIONS = ["", "INFO", "WARN", "CRITICAL"];

export default function AuditLogPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (severity) params.set("severity", severity);
    if (resourceType) params.set("resourceType", resourceType);
    params.set("page", String(page));
    setLoading(true);
    fetch(`/api/audit-log?${params.toString()}`)
      .then(async (response) => (response.ok ? ((await response.json()) as AuditResponse) : null))
      .then((payload) => {
        if (!cancelled && payload) setData(payload);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search, severity, resourceType, page]);

  const entries = useMemo(() => data?.entries ?? [], [data]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Audit-Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Append-only Trail aller Aktionen in dieser Sub-Org.
          </p>
        </div>
        <a href="/api/audit-log/export" download>
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" /> CSV-Export
          </Button>
        </a>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Beschreibung durchsuchen…"
            className="pl-9"
          />
        </div>
        <select
          value={severity}
          onChange={(event) => setSeverity(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          {SEVERITY_OPTIONS.map((option) => (
            <option key={option} value={option}>{option || "Alle Severities"}</option>
          ))}
        </select>
        <Input
          value={resourceType}
          onChange={(event) => setResourceType(event.target.value)}
          placeholder="resourceType (z.B. DEPARTMENT)"
          className="w-56"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          Noch keine Audit-Eintraege.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Zeit</th>
                <th className="px-3 py-2">Severity</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Resource</th>
                <th className="px-3 py-2">Beschreibung</th>
                <th className="px-3 py-2">Actor</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-border align-top">
                  <td className="px-3 py-2 text-muted-foreground">{new Date(entry.createdAt).toLocaleString("de-DE")}</td>
                  <td className="px-3 py-2">
                    <Badge variant={entry.severity === "CRITICAL" ? "destructive" : entry.severity === "WARN" ? "secondary" : "outline"}>
                      {entry.severity}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-foreground">{entry.action}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {entry.resourceType}
                    {entry.resourceId ? <div className="text-[11px]">{entry.resourceId}</div> : null}
                  </td>
                  <td className="px-3 py-2 text-foreground">{entry.description || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {entry.actorType}{entry.actorUserId ? ` · ${entry.actorUserId.slice(0, 12)}…` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            <span>{data?.total ?? 0} Eintraege gesamt</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                ← Vorherige
              </Button>
              <span className="self-center">Seite {page}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => p + 1)}
                disabled={data ? page * data.limit >= data.total : true}
              >
                Naechste →
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
