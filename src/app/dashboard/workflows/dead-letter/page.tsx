"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RotateCcw, Trash2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface DeadLetterItem {
  id: string;
  agentTeamId: string;
  agentTeam: { id: string; name: string } | null;
  nodeId: string;
  nodeType: string;
  status: "OPEN" | "RETRIED" | "DISCARDED";
  error: string;
  attempts: number;
  createdAt: string;
}

const STATUS_FILTERS = ["", "OPEN", "RETRIED", "DISCARDED"];

export default function DeadLetterPage() {
  const [items, setItems] = useState<DeadLetterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/workflows/dead-letter?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setItems(data.items ?? []);
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAction = useCallback(
    async (id: string, action: "retry" | "discard") => {
      if (action === "discard" && !confirm("Item endgueltig verwerfen?")) return;
      setBusy(id);
      await fetch(`/api/workflows/dead-letter/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setBusy(null);
      await refresh();
    },
    [refresh],
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dead-Letter Queue</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Workflow-Schritte die endgueltig fehlgeschlagen sind. Manuelles Re-Run oder Verwerfen.
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          {STATUS_FILTERS.map((option) => (
            <option key={option} value={option}>
              {option || "Alle Status"}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          <AlertTriangle className="mb-3 h-6 w-6" />
          Keine Dead-Letter-Items.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Zeit</th>
                <th className="px-3 py-2">Workflow</th>
                <th className="px-3 py-2">Node</th>
                <th className="px-3 py-2">Fehler</th>
                <th className="px-3 py-2">Versuche</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-border align-top">
                  <td className="px-3 py-2 text-muted-foreground">{new Date(item.createdAt).toLocaleString("de-DE")}</td>
                  <td className="px-3 py-2">
                    {item.agentTeam ? (
                      <Link className="hover:underline" href={`/dashboard/teams/${item.agentTeam.id}`}>
                        {item.agentTeam.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{item.agentTeamId}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {item.nodeType}
                    <div className="text-[11px]">{item.nodeId}</div>
                  </td>
                  <td className="px-3 py-2 text-foreground">
                    <div className="line-clamp-2 text-xs">{item.error}</div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{item.attempts}</td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={item.status === "OPEN" ? "destructive" : item.status === "RETRIED" ? "default" : "outline"}
                    >
                      {item.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {item.status === "OPEN" ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === item.id}
                          onClick={() => handleAction(item.id, "retry")}
                        >
                          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Retry
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === item.id}
                          onClick={() => handleAction(item.id, "discard")}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" /> Discard
                        </Button>
                      </div>
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
