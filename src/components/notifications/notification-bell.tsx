"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, Check, X, AlertTriangle, Clock, Loader2 } from "lucide-react";

interface PendingApproval {
  id: string;
  actionType: string;
  actionSummary: string;
  requestedAt: string;
  agent?: { name: string };
}

export function NotificationBell() {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [open, setOpen] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const fetchApprovals = useCallback(() => {
    fetch("/api/approvals")
      .then((r) => r.json())
      .then((data) => setApprovals(data.approvals || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchApprovals();
    const interval = setInterval(fetchApprovals, 30000);
    return () => clearInterval(interval);
  }, [fetchApprovals]);

  // Click outside → close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleAction = async (id: string, action: "approve" | "reject") => {
    setProcessing(id);
    try {
      await fetch(`/api/approvals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setApprovals((prev) => prev.filter((a) => a.id !== id));
    } catch {
      // Retry on next poll
    }
    setProcessing(null);
  };

  const count = approvals.length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bell className="h-4.5 w-4.5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-xs font-semibold text-foreground">Benachrichtigungen</span>
            {count > 0 && (
              <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-400">
                {count} offen
              </span>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {count === 0 ? (
              <div className="px-4 py-6 text-center">
                <Bell className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Keine neuen Benachrichtigungen</p>
              </div>
            ) : (
              approvals.map((approval) => (
                <div
                  key={approval.id}
                  className="border-b border-border/50 px-4 py-3 last:border-b-0"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
                      <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-foreground">
                          {approval.actionType.replace(/_/g, " ")}
                        </span>
                        {approval.agent && (
                          <span className="text-[10px] text-muted-foreground">{approval.agent.name}</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                        {approval.actionSummary}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <button
                          onClick={() => handleAction(approval.id, "approve")}
                          disabled={processing === approval.id}
                          className="flex items-center gap-1 rounded-md bg-green-600/20 px-2 py-1 text-[10px] font-medium text-green-400 transition-colors hover:bg-green-600/30"
                        >
                          {processing === approval.id ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : (
                            <Check className="h-2.5 w-2.5" />
                          )}
                          OK
                        </button>
                        <button
                          onClick={() => handleAction(approval.id, "reject")}
                          disabled={processing === approval.id}
                          className="flex items-center gap-1 rounded-md bg-red-600/20 px-2 py-1 text-[10px] font-medium text-red-400 transition-colors hover:bg-red-600/30"
                        >
                          <X className="h-2.5 w-2.5" />
                          Nein
                        </button>
                        <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground ml-auto">
                          <Clock className="h-2.5 w-2.5" />
                          {new Date(approval.requestedAt).toLocaleTimeString("de-DE", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {count > 0 && (
            <div className="border-t border-border px-4 py-2 text-center">
              <a
                href="/dashboard/approvals"
                className="text-[11px] text-orange-400 hover:text-orange-300 transition-colors"
              >
                Alle Genehmigungen anzeigen →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
