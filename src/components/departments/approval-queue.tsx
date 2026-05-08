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
        <ApprovalItem
          key={item.id}
          item={item}
          busy={busyId === item.id}
          reason={reasons[item.id] || ""}
          setReason={(reason) =>
            setReasons((current) => ({ ...current, [item.id]: reason }))
          }
          approve={() => approve(item.id)}
          reject={() => reject(item.id)}
        />
      ))}
    </div>
  );
}

function ApprovalItem({
  item,
  busy,
  reason,
  setReason,
  approve,
  reject,
}: {
  item: BacklogItemView;
  busy: boolean;
  reason: string;
  setReason: (reason: string) => void;
  approve: () => void;
  reject: () => void;
}) {
  const draft = readDraft(item.approvalDraft);
  const trigger = readDraft(item.triggerPayload);

  return (
    <div className="rounded-lg border border-orange-500/25 bg-card/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Draft awaiting approval</p>
              <p className="text-xs text-muted-foreground">
                {item.triggerType} · {new Date(item.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-2">
              {draft.channel ? (
                <span className="rounded border border-border px-2 py-1 text-xs text-muted-foreground">
                  {draft.channel}
                </span>
              ) : null}
              <span className="rounded border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-xs text-orange-200">
                NEEDS_APPROVAL
              </span>
            </div>
          </div>
          {draft.to ? <p className="mt-3 text-sm text-muted-foreground">To: {draft.to}</p> : null}
          {draft.subject ? <p className="mt-1 text-sm text-muted-foreground">Subject: {draft.subject}</p> : null}
          <pre className="mt-4 max-h-72 overflow-auto rounded border border-border/70 bg-black/25 p-3 text-xs text-slate-200">
            {draft.body || draft.response || JSON.stringify(item.approvalDraft, null, 2)}
          </pre>
          {trigger.body ? (
            <details className="mt-3 rounded border border-border/70 bg-black/10 p-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer text-foreground">Original incoming message</summary>
              <pre className="mt-2 whitespace-pre-wrap">{trigger.body}</pre>
            </details>
          ) : null}
          <Textarea
            className="mt-4 min-h-20 bg-background/70"
            placeholder="Reason required when rejecting"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={approve}
              disabled={busy}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Approve
            </Button>
            <Button
              variant="outline"
              onClick={reject}
              disabled={busy}
              className="border-red-500/30 text-red-200 hover:bg-red-500/10"
            >
              <X className="mr-2 h-4 w-4" />
              Reject
            </Button>
          </div>
        </div>
  );
}

function readDraft(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      typeof entry === "string" ? entry : "",
    ])
  );
}
