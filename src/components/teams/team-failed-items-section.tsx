"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FailedItem {
  id: string;
  nodeId: string;
  nodeType: string;
  error: string;
  attempts: number;
  status: "OPEN" | "RETRIED" | "DISCARDED";
  createdAt: string;
}

export function TeamFailedItemsSection({ teamId }: { teamId: string }) {
  const [items, setItems] = useState<FailedItem[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchItems = async () => {
    const res = await fetch(`/api/teams/${teamId}/dead-letter`);
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.items || []);
  };

  useEffect(() => {
    fetchItems();
  }, [teamId]);

  const applyAction = async (itemId: string, action: "retry" | "discard") => {
    await fetch(`/api/teams/${teamId}/dead-letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, action }),
    });
    await fetchItems();
  };

  const openItems = items.filter((item) => item.status === "OPEN");
  if (items.length === 0) return null;

  return (
    <div className="border-b border-border bg-card/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          Failed Items
          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-300">{openItems.length} open</span>
        </h3>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Node</th>
              <th className="px-3 py-2 text-left">Error</th>
              <th className="px-3 py-2 text-left">Attempts</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.slice(0, 8).map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{item.nodeType}<br />{item.nodeId}</td>
                <td className="px-3 py-2">
                  <button onClick={() => setExpanded(expanded === item.id ? null : item.id)} className="text-left text-xs text-red-300 hover:text-red-200">
                    {expanded === item.id ? item.error : item.error.slice(0, 140)}
                  </button>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{item.attempts}</td>
                <td className="px-3 py-2 text-muted-foreground">{item.status}</td>
                <td className="px-3 py-2 text-right">
                  {item.status === "OPEN" && (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => applyAction(item.id, "retry")}>
                        <RotateCw className="h-3 w-3 mr-1" /> Retry
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => applyAction(item.id, "discard")}>
                        <Trash2 className="h-3 w-3 mr-1" /> Discard
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
