"use client";

import { useState } from "react";
import { Loader2, X, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAdvancedMode } from "@/hooks/use-advanced-mode";
import { CustomCodeEditor } from "@/components/agents/custom-code-editor";

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
    label: "Appointment Booking",
    icon: "\u{1F4C5}",
    description: "Book appointments via Calendly/Cal.com",
    configFields: [
      { key: "calendlyUrl", label: "Calendly or Cal.com URL", placeholder: "https://calendly.com/your-link" },
    ],
  },
  {
    type: "COLLECT_EMAIL",
    label: "Collect Email",
    icon: "\u{2709}\u{FE0F}",
    description: "Agent asks for email when interest is shown",
    configFields: [],
  },
  {
    type: "SEND_EMAIL",
    label: "Send Email",
    icon: "\u{1F4E7}",
    description: "Send confirmation email to visitor",
    configFields: [
      { key: "emailTemplate", label: "Email subject", placeholder: "Thanks for your inquiry!" },
    ],
  },
  {
    type: "SCORE_LEAD",
    label: "Lead-Scoring",
    icon: "\u{1F4CA}",
    description: "Agent scores lead quality (1-10)",
    configFields: [
      { key: "criteria", label: "Scoring criteria (optional)", placeholder: "Budget > 5000, decision maker, timeline < 3 months" },
    ],
  },
  {
    type: "NOTIFY_OWNER",
    label: "Notification",
    icon: "\u{1F514}",
    description: "Notify owner via email/Slack",
    configFields: [
      { key: "notifyEmail", label: "Email address", placeholder: "you@example.com" },
      { key: "slackWebhook", label: "Slack Webhook URL (optional)", placeholder: "https://hooks.slack.com/..." },
    ],
  },
  {
    type: "FIRE_WEBHOOK",
    label: "Webhook",
    icon: "\u{1F517}",
    description: "Trigger custom webhook for integrations",
    configFields: [
      { key: "webhookUrl", label: "Webhook URL", placeholder: "https://api.example.com/webhook" },
      { key: "webhookSecret", label: "Secret header (optional)", placeholder: "Bearer token..." },
    ],
  },
  {
    type: "HANDOFF_HUMAN",
    label: "Human Handoff",
    icon: "\u{1F91D}",
    description: "Hand off to a human for complex inquiries",
    configFields: [
      { key: "handoffEmail", label: "Escalation email", placeholder: "support@example.com" },
    ],
  },
  {
    type: "HTTP_REQUEST",
    label: "HTTP Request",
    icon: "\u{1F310}",
    description: "Agent makes HTTP API calls during conversations",
    configFields: [
      { key: "description", label: "When to use (description for Claude)", placeholder: "Call this API when the user asks about order status" },
      { key: "url", label: "URL (supports {{variables}})", placeholder: "https://api.example.com/orders/{{order_id}}" },
      { key: "method", label: "Method (GET/POST/PUT/DELETE)", placeholder: "GET" },
      { key: "headers", label: "Headers (JSON)", placeholder: '{"Authorization": "Bearer xxx"}' },
      { key: "bodyTemplate", label: "Body template (JSON with {{variables}})", placeholder: '{"query": "{{user_question}}"}' },
      { key: "responseMapping", label: "Response mapping (JSON path)", placeholder: "data.results[0].status" },
    ],
  },
];

export function ActionsTab({ agentId, initialActions }: ActionsTabProps) {
  const { advancedMode } = useAdvancedMode();
  const [actions, setActions] = useState<AgentAction[]>(initialActions);
  const [configModal, setConfigModal] = useState<string | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [showCodeEditor, setShowCodeEditor] = useState(false);

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

  async function saveCustomCode(code: string, description: string) {
    setSaving("CUSTOM_CODE");
    try {
      const res = await fetch(`/api/agents/${agentId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "CUSTOM_CODE",
          enabled: true,
          config: { code, description },
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setActions((prev) => {
          const idx = prev.findIndex((a) => a.type === "CUSTOM_CODE");
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
      setShowCodeEditor(false);
    }
  }

  const modalAction = actionTypes.find((a) => a.type === configModal);

  const customCodeAction = actions.find((a) => a.type === "CUSTOM_CODE");
  const customCodeEnabled = customCodeAction?.enabled ?? false;
  const customCodeConfig = (customCodeAction?.config || {}) as Record<string, string>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Enable actions your agent can perform automatically. Claude decides during the conversation when an action is appropriate.
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
                      Configure
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

      {/* Custom Code Action — nur im Advanced Mode */}
      {advancedMode && (
        <div
          className={cn(
            "flex items-center justify-between rounded-xl border bg-card p-4 transition-colors",
            customCodeEnabled ? "border-purple-500/30" : "border-border"
          )}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
              <Code2 className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">Custom Code</p>
                <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
                  Advanced
                </span>
                {customCodeEnabled && (
                  <button
                    onClick={() => setShowCodeEditor(true)}
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 transition-colors"
                  >
                    Configure
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {customCodeConfig.description || "Run custom JavaScript when Claude triggers this action."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!customCodeEnabled && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowCodeEditor(true)}
                className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
              >
                <Code2 className="mr-1.5 h-3.5 w-3.5" />
                Setup
              </Button>
            )}
            {customCodeEnabled && (
              <button
                onClick={() => toggleAction("CUSTOM_CODE")}
                disabled={saving === "CUSTOM_CODE"}
                className={cn(
                  "relative h-6 w-11 rounded-full transition-colors",
                  "bg-purple-500"
                )}
              >
                {saving === "CUSTOM_CODE" ? (
                  <Loader2 className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 animate-spin text-foreground" />
                ) : (
                  <span className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform translate-x-5" />
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Custom Code Editor Modal */}
      {showCodeEditor && (
        <CustomCodeEditor
          code={customCodeConfig.code || ""}
          description={customCodeConfig.description || ""}
          onSave={saveCustomCode}
          onClose={() => setShowCodeEditor(false)}
          saving={saving === "CUSTOM_CODE"}
        />
      )}

      {/* Config Modal */}
      {configModal && modalAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">
                {modalAction.icon} Configure {modalAction.label}
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
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={saveConfig}
                disabled={saving === configModal}
              >
                {saving === configModal ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
