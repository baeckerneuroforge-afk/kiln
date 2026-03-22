"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck, Check, X, Clock, Loader2, ChevronDown, ChevronUp, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Approval {
  id: string;
  agentId: string;
  actionType: string;
  actionSummary: string;
  actionPayload: Record<string, unknown>;
  status: string;
  approverEmail: string;
  requestedAt: string;
  autoApproveAt: string | null;
  agent?: { name: string; slug: string };
}

export function ApprovalInbox() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchApprovals = useCallback(() => {
    fetch("/api/approvals")
      .then((r) => r.json())
      .then((data) => setApprovals(data.approvals || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchApprovals();
    const interval = setInterval(fetchApprovals, 15000);
    return () => clearInterval(interval);
  }, [fetchApprovals]);

  const handleAction = async (approvalId: string, action: "approve" | "reject") => {
    setProcessing(approvalId);
    try {
      await fetch(`/api/approvals/${approvalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setApprovals((prev) => prev.filter((a) => a.id !== approvalId));
    } catch {
      // Fehler ignorieren, nächster Fetch aktualisiert
    }
    setProcessing(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
      </div>
    );
  }

  if (approvals.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10">
          <ShieldCheck className="h-5 w-5 text-green-400" />
        </div>
        <h3 className="mb-1 text-sm font-semibold text-zinc-100">Keine offenen Genehmigungen</h3>
        <p className="text-xs text-zinc-500">Alle Aktionen wurden bereits verarbeitet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">Offene Genehmigungen</h2>
        <span className="flex h-6 items-center rounded-full bg-orange-500/10 px-2.5 text-xs font-medium text-orange-400">
          {approvals.length}
        </span>
      </div>

      {approvals.map((approval) => {
        const isExpanded = expandedId === approval.id;
        const isProcessing = processing === approval.id;
        const autoApproveDate = approval.autoApproveAt
          ? new Date(approval.autoApproveAt)
          : null;
        const minutesLeft = autoApproveDate
          ? Math.max(0, Math.round((autoApproveDate.getTime() - Date.now()) / 60000))
          : null;

        return (
          <div
            key={approval.id}
            className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden"
          >
            {/* Header */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : approval.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-800/30"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10">
                <AlertTriangle className="h-4 w-4 text-orange-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-zinc-100">
                    {approval.actionType.replace(/_/g, " ")}
                  </span>
                  {approval.agent && (
                    <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                      {approval.agent.name}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-zinc-500">{approval.actionSummary}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {minutesLeft !== null && (
                  <span className="flex items-center gap-1 text-[10px] text-yellow-500">
                    <Clock className="h-3 w-3" />
                    {minutesLeft}m
                  </span>
                )}
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-zinc-600" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-zinc-600" />
                )}
              </div>
            </button>

            {/* Details */}
            {isExpanded && (
              <div className="border-t border-zinc-800 px-4 py-3 space-y-3">
                <div>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                    Aktion Details
                  </span>
                  <pre className="mt-1 max-h-40 overflow-y-auto rounded-lg bg-zinc-950 p-3 text-[11px] text-zinc-400 font-mono">
                    {JSON.stringify(approval.actionPayload, null, 2)}
                  </pre>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleAction(approval.id, "approve")}
                    disabled={isProcessing}
                    className="bg-green-600 hover:bg-green-500 text-white text-xs h-8"
                  >
                    {isProcessing ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Genehmigen
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction(approval.id, "reject")}
                    disabled={isProcessing}
                    className="text-red-400 border-red-500/30 hover:bg-red-500/10 text-xs h-8"
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    Ablehnen
                  </Button>
                </div>

                <div className="flex items-center gap-3 text-[10px] text-zinc-600">
                  <span>
                    Angefragt: {new Date(approval.requestedAt).toLocaleString("de-DE")}
                  </span>
                  <span>Approver: {approval.approverEmail}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
