"use client";

import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { BacklogItemView } from "./types";

export function ApprovalQueue({
  departmentId,
  items,
  onChanged,
}: {
  departmentId: string;
  items: BacklogItemView[];
  onChanged?: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  async function approve(itemId: string) {
    setBusyId(itemId);
    await fetch(`/api/departments/${departmentId}/approve/${itemId}`, { method: "POST" });
    setBusyId(null);
    onChanged?.();
  }

  async function reject(itemId: string) {
    setBusyId(itemId);
    await fetch(`/api/departments/${departmentId}/reject/${itemId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reasons[itemId] || "Rejected" }),
    });
    setBusyId(null);
    onChanged?.();
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card/50 p-6 text-sm text-muted-foreground">
        No drafts waiting for review.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.id} className="rounded-lg border border-orange-500/25 bg-card/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Draft awaiting approval</p>
              <p className="text-xs text-muted-foreground">
                {item.triggerType} · {new Date(item.createdAt).toLocaleString()}
              </p>
            </div>
            <span className="rounded border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-xs text-orange-200">
              NEEDS_APPROVAL
            </span>
          </div>
          <pre className="mt-4 max-h-72 overflow-auto rounded border border-border/70 bg-black/25 p-3 text-xs text-slate-200">
            {JSON.stringify(item.approvalDraft, null, 2)}
          </pre>
          <Textarea
            className="mt-4 min-h-20 bg-background/70"
            placeholder="Reason required when rejecting"
            value={reasons[item.id] || ""}
            onChange={(event) =>
              setReasons((current) => ({ ...current, [item.id]: event.target.value }))
            }
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => approve(item.id)}
              disabled={busyId === item.id}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {busyId === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Approve
            </Button>
            <Button
              variant="outline"
              onClick={() => reject(item.id)}
              disabled={busyId === item.id}
              className="border-red-500/30 text-red-200 hover:bg-red-500/10"
            >
              <X className="mr-2 h-4 w-4" />
              Reject
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
