"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, Save, Loader2, Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const APPROVAL_MODES = [
  { id: "none", label: "Keine Genehmigung", description: "Alle Aktionen werden sofort ausgeführt" },
  { id: "critical_only", label: "Nur kritische Aktionen", description: "E-Mails, HTTP-Requests, Webhooks" },
  { id: "all_actions", label: "Alle Aktionen", description: "Jede Aktion braucht Genehmigung" },
  { id: "custom", label: "Benutzerdefiniert", description: "Wähle welche Aktionen genehmigt werden müssen" },
] as const;

const ACTION_TYPES = [
  "send_email",
  "http_request",
  "fire_webhook",
  "send_slack",
  "a2a_call",
  "custom_code",
  "book_appointment",
  "collect_email",
  "score_lead",
];

interface Props {
  agentId: string;
}

export function ApprovalSettings({ agentId }: Props) {
  const [mode, setMode] = useState("none");
  const [checklist, setChecklist] = useState<string[]>([]);
  const [autoApproveTimeout, setAutoApproveTimeout] = useState(0);
  const [approverEmail, setApproverEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/agents/${agentId}`)
      .then((r) => r.json())
      .then((data) => {
        const agent = data.agent || data;
        setMode(agent.approvalMode || "none");
        const config = agent.approvalConfig || {};
        setChecklist(config.checklist || []);
        setAutoApproveTimeout(config.autoApproveTimeoutMinutes || 0);
        setApproverEmail(config.approverEmail || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [agentId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvalMode: mode,
          approvalConfig: {
            checklist,
            autoApproveTimeoutMinutes: autoApproveTimeout,
            approverEmail,
          },
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      // Fehler ignorieren
    }
    setSaving(false);
  };

  const toggleAction = (action: string) => {
    setChecklist((prev) =>
      prev.includes(action) ? prev.filter((a) => a !== action) : [...prev, action],
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-orange-400" />
        <h3 className="text-sm font-semibold text-foreground">Approval Workflows</h3>
      </div>

      {/* Mode Selection */}
      <div className="space-y-2">
        <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Genehmigungsmodus
        </label>
        <div className="grid gap-2">
          {APPROVAL_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                mode === m.id
                  ? "border-orange-500/40 bg-orange-500/5"
                  : "border-border bg-card/50 hover:border-border"
              }`}
            >
              <div
                className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${
                  mode === m.id ? "border-orange-500 bg-orange-500" : "border-border"
                }`}
              />
              <div>
                <span className="text-sm font-medium text-foreground">{m.label}</span>
                <p className="mt-0.5 text-xs text-muted-foreground">{m.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Checklist */}
      {mode === "custom" && (
        <div className="space-y-2">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Welche Aktionen brauchen Genehmigung?
          </label>
          <div className="grid gap-1.5">
            {ACTION_TYPES.map((action) => (
              <button
                key={action}
                onClick={() => toggleAction(action)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  checklist.includes(action)
                    ? "bg-orange-500/10 text-orange-300"
                    : "bg-card/50 text-muted-foreground hover:bg-muted"
                }`}
              >
                {checklist.includes(action) ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-orange-400" />
                ) : (
                  <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                {action.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Auto-Approve Timeout */}
      {mode !== "none" && (
        <div className="space-y-2">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Auto-Genehmigung nach (Minuten)
          </label>
          <input
            type="number"
            min={0}
            max={1440}
            value={autoApproveTimeout}
            onChange={(e) => setAutoApproveTimeout(parseInt(e.target.value) || 0)}
            placeholder="0 = deaktiviert"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-orange-500/60 placeholder:text-muted-foreground"
          />
          <p className="text-[10px] text-muted-foreground">
            0 = keine automatische Genehmigung. Empfohlen: 60-120 Minuten.
          </p>
        </div>
      )}

      {/* Approver Email */}
      {mode !== "none" && (
        <div className="space-y-2">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Approver E-Mail
          </label>
          <input
            type="email"
            value={approverEmail}
            onChange={(e) => setApproverEmail(e.target.value)}
            placeholder="approver@example.com"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-orange-500/60 placeholder:text-muted-foreground"
          />
          <p className="text-[10px] text-muted-foreground">
            Leer = du wirst per Dashboard benachrichtigt.
          </p>
        </div>
      )}

      {/* Save */}
      <Button
        onClick={handleSave}
        disabled={saving}
        className="bg-orange-600 hover:bg-orange-500 text-white text-xs h-8"
      >
        {saving ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : saved ? (
          <Check className="mr-1.5 h-3.5 w-3.5" />
        ) : (
          <Save className="mr-1.5 h-3.5 w-3.5" />
        )}
        {saved ? "Gespeichert" : "Speichern"}
      </Button>
    </div>
  );
}
