"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AgentAction {
  id: string;
  type: string;
  enabled: boolean;
  config: Record<string, string> | null;
}

interface ActionsTabProps {
  agentId: string;
  initialActions: AgentAction[];
}

const actionTypes = [
  {
    type: "BOOK_APPOINTMENT",
    label: "Terminbuchung",
    icon: "\u{1F4C5}",
    description: "Termin buchen via Calendly/Cal.com",
    configFields: [
      { key: "calendlyUrl", label: "Calendly- oder Cal.com-URL", placeholder: "https://calendly.com/dein-link" },
    ],
  },
  {
    type: "COLLECT_EMAIL",
    label: "E-Mail sammeln",
    icon: "\u{2709}\u{FE0F}",
    description: "Agent fragt nach E-Mail bei Interesse",
    configFields: [],
  },
  {
    type: "SEND_EMAIL",
    label: "E-Mail senden",
    icon: "\u{1F4E7}",
    description: "Bestätigungsmail an Besucher senden",
    configFields: [
      { key: "emailTemplate", label: "E-Mail-Betreff", placeholder: "Danke für deine Anfrage!" },
    ],
  },
  {
    type: "SCORE_LEAD",
    label: "Lead-Scoring",
    icon: "\u{1F4CA}",
    description: "Agent bewertet Lead-Qualität (1-10)",
    configFields: [
      { key: "criteria", label: "Scoring-Kriterien (optional)", placeholder: "Budget > 5000, Entscheider, Zeitrahmen < 3 Monate" },
    ],
  },
  {
    type: "NOTIFY_OWNER",
    label: "Benachrichtigung",
    icon: "\u{1F514}",
    description: "Betreiber per E-Mail/Slack benachrichtigen",
    configFields: [
      { key: "notifyEmail", label: "E-Mail-Adresse", placeholder: "du@example.com" },
      { key: "slackWebhook", label: "Slack Webhook URL (optional)", placeholder: "https://hooks.slack.com/..." },
    ],
  },
  {
    type: "FIRE_WEBHOOK",
    label: "Webhook",
    icon: "\u{1F517}",
    description: "Custom Webhook für Integrationen triggern",
    configFields: [
      { key: "webhookUrl", label: "Webhook URL", placeholder: "https://api.example.com/webhook" },
      { key: "webhookSecret", label: "Secret Header (optional)", placeholder: "Bearer token..." },
    ],
  },
  {
    type: "HANDOFF_HUMAN",
    label: "Menschliche Übergabe",
    icon: "\u{1F91D}",
    description: "An Menschen übergeben bei komplexen Anfragen",
    configFields: [
      { key: "handoffEmail", label: "Eskalations-E-Mail", placeholder: "support@example.com" },
    ],
  },
];

export function ActionsTab({ agentId, initialActions }: ActionsTabProps) {
  const [actions, setActions] = useState<AgentAction[]>(initialActions);
  const [configModal, setConfigModal] = useState<string | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  async function toggleAction(actionType: string) {
    const existing = actions.find((a) => a.type === actionType);
    const newEnabled = existing ? !existing.enabled : true;

    setSaving(actionType);
    try {
      const res = await fetch(`/api/agents/${agentId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: actionType,
          enabled: newEnabled,
          config: existing?.config || {},
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setActions((prev) => {
          const idx = prev.findIndex((a) => a.type === actionType);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = updated;
            return copy;
          }
          return [...prev, updated];
        });
      }
    } catch {
      // Stille Fehlerbehandlung
    } finally {
      setSaving(null);
    }
  }

  function openConfig(actionType: string) {
    const existing = actions.find((a) => a.type === actionType);
    setConfigValues((existing?.config as Record<string, string>) || {});
    setConfigModal(actionType);
  }

  async function saveConfig() {
    if (!configModal) return;
    setSaving(configModal);

    try {
      const res = await fetch(`/api/agents/${agentId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: configModal,
          enabled: true,
          config: configValues,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setActions((prev) => {
          const idx = prev.findIndex((a) => a.type === configModal);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = updated;
            return copy;
          }
          return [...prev, updated];
        });
      }
    } catch {
      // Stille Fehlerbehandlung
    } finally {
      setSaving(null);
      setConfigModal(null);
    }
  }

  const modalAction = actionTypes.find((a) => a.type === configModal);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Aktiviere Actions die dein Agent automatisch ausführen kann. Claude
        entscheidet im Gespräch, wann eine Action sinnvoll ist.
      </p>

      {actionTypes.map((action) => {
        const existing = actions.find((a) => a.type === action.type);
        const isEnabled = existing?.enabled ?? false;
        const hasConfig = action.configFields.length > 0;
        const isSaving = saving === action.type;

        return (
          <div
            key={action.type}
            className={cn(
              "flex items-center justify-between rounded-xl border bg-card p-4 transition-colors",
              isEnabled ? "border-primary/30" : "border-border"
            )}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{action.icon}</span>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {action.label}
                  </p>
                  {hasConfig && isEnabled && (
                    <button
                      onClick={() => openConfig(action.type)}
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                    >
                      Konfigurieren
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {action.description}
                </p>
              </div>
            </div>
            <button
              onClick={() => toggleAction(action.type)}
              disabled={isSaving}
              className={cn(
                "relative h-6 w-11 rounded-full transition-colors",
                isEnabled ? "bg-primary" : "bg-muted"
              )}
            >
              {isSaving ? (
                <Loader2 className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 animate-spin text-foreground" />
              ) : (
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform",
                    isEnabled && "translate-x-5"
                  )}
                />
              )}
            </button>
          </div>
        );
      })}

      {/* Config Modal */}
      {configModal && modalAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">
                {modalAction.icon} {modalAction.label} konfigurieren
              </h3>
              <button
                onClick={() => setConfigModal(null)}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              {modalAction.configFields.map((field) => (
                <div key={field.key}>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    {field.label}
                  </label>
                  <input
                    type="text"
                    value={configValues[field.key] || ""}
                    onChange={(e) =>
                      setConfigValues((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    placeholder={field.placeholder}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfigModal(null)}
              >
                Abbrechen
              </Button>
              <Button
                size="sm"
                onClick={saveConfig}
                disabled={saving === configModal}
              >
                {saving === configModal ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Speichern
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
