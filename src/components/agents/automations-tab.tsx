"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Loader2,
  Trash2,
  Clock,
  Play,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AutomationRule {
  id: string;
  name: string;
  cronExpression: string;
  taskDescription: string;
  notificationMethod: string;
  notificationTarget: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  lastRunResult: string | null;
  createdAt: string;
}

const SCHEDULE_PRESETS = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every day at 9am", value: "0 9 * * *" },
  { label: "Every Monday at 9am", value: "0 9 * * 1" },
  { label: "Every 1st of month", value: "0 9 1 * *" },
  { label: "Custom cron", value: "custom" },
];

function formatCron(cron: string): string {
  const preset = SCHEDULE_PRESETS.find((p) => p.value === cron);
  if (preset) return preset.label;
  return cron;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  agentId: string;
}

export function AutomationsTab({ agentId }: Props) {
  const [automations, setAutomations] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Modal state
  const [formName, setFormName] = useState("");
  const [formSchedule, setFormSchedule] = useState("0 * * * *");
  const [formCustomCron, setFormCustomCron] = useState("");
  const [formTask, setFormTask] = useState("");
  const [formNotification, setFormNotification] = useState("NONE");
  const [formNotificationTarget, setFormNotificationTarget] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchAutomations();
  }, [agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAutomations() {
    try {
      const res = await fetch(`/api/agents/${agentId}/automations`);
      if (res.ok) {
        const data = await res.json();
        setAutomations(data);
      }
    } catch {
      // Fehler — leer lassen
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!formName.trim() || !formTask.trim()) return;
    setCreating(true);

    const cronExpression = formSchedule === "custom" ? formCustomCron : formSchedule;

    try {
      const res = await fetch(`/api/agents/${agentId}/automations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          cronExpression,
          taskDescription: formTask.trim(),
          notificationMethod: formNotification,
          notificationTarget:
            formNotification !== "NONE" ? formNotificationTarget.trim() : null,
        }),
      });

      if (res.ok) {
        const newRule = await res.json();
        setAutomations((prev) => [newRule, ...prev]);
        resetForm();
        setShowModal(false);
      }
    } catch {
      // Fehler
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    setToggling(id);
    try {
      const res = await fetch(`/api/agents/${agentId}/automations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automationId: id, enabled: !enabled }),
      });
      if (res.ok) {
        setAutomations((prev) =>
          prev.map((a) => (a.id === id ? { ...a, enabled: !enabled } : a))
        );
      }
    } catch {
      // Fehler
    } finally {
      setToggling(null);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(
        `/api/agents/${agentId}/automations?automationId=${id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setAutomations((prev) => prev.filter((a) => a.id !== id));
      }
    } catch {
      // Fehler
    } finally {
      setDeleting(null);
    }
  }

  function resetForm() {
    setFormName("");
    setFormSchedule("0 * * * *");
    setFormCustomCron("");
    setFormTask("");
    setFormNotification("NONE");
    setFormNotificationTarget("");
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Automations</h2>
          <p className="text-sm text-muted-foreground">
            Schedule proactive tasks for your agent to run automatically.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Automation
        </Button>
      </div>

      {/* Liste */}
      {automations.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
          <Clock className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No automations yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create your first automation to run tasks on a schedule.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {automations.map((automation) => (
            <div
              key={automation.id}
              className="rounded-xl border border-border bg-card/50 overflow-hidden"
            >
              {/* Hauptzeile */}
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Status-Indikator */}
                <div
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    automation.enabled ? "bg-kiln-green" : "bg-muted-foreground/30"
                  )}
                />

                {/* Name & Schedule */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {automation.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatCron(automation.cronExpression)} · Last run: {formatDate(automation.lastRunAt)}
                  </p>
                </div>

                {/* Toggle */}
                <button
                  onClick={() => handleToggle(automation.id, automation.enabled)}
                  disabled={toggling === automation.id}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                    automation.enabled ? "bg-kiln-green" : "bg-muted"
                  )}
                >
                  {toggling === automation.id ? (
                    <Loader2 className="absolute inset-0 m-auto h-3 w-3 animate-spin text-white" />
                  ) : (
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform",
                        automation.enabled ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  )}
                </button>

                {/* Expand */}
                <button
                  onClick={() =>
                    setExpandedId(expandedId === automation.id ? null : automation.id)
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  {expandedId === automation.id ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(automation.id)}
                  disabled={deleting === automation.id}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors"
                >
                  {deleting === automation.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>

              {/* Expanded Details */}
              {expandedId === automation.id && (
                <div className="border-t border-border px-4 py-3 space-y-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Task Description
                    </p>
                    <p className="text-xs text-foreground whitespace-pre-wrap">
                      {automation.taskDescription}
                    </p>
                  </div>

                  <div className="flex gap-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                        Notification
                      </p>
                      <p className="text-xs text-foreground">
                        {automation.notificationMethod === "NONE" && "None"}
                        {automation.notificationMethod === "EMAIL" &&
                          `Email → ${automation.notificationTarget}`}
                        {automation.notificationMethod === "WEBHOOK" &&
                          `Webhook → ${automation.notificationTarget}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                        Cron
                      </p>
                      <p className="text-xs font-mono text-foreground">
                        {automation.cronExpression}
                      </p>
                    </div>
                  </div>

                  {automation.lastRunResult && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                        Last Result
                      </p>
                      <div
                        className={cn(
                          "rounded-lg border px-3 py-2 text-xs whitespace-pre-wrap max-h-40 overflow-y-auto",
                          automation.lastRunResult.startsWith("ERROR")
                            ? "border-red-500/20 bg-red-500/5 text-red-400"
                            : "border-border bg-card text-foreground"
                        )}
                      >
                        {automation.lastRunResult.slice(0, 1000)}
                        {automation.lastRunResult.length > 1000 && "..."}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />

          {/* Modal Content */}
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-foreground">
                Add Automation
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Daily Lead Follow-ups"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Schedule */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Schedule
                </label>
                <select
                  value={
                    SCHEDULE_PRESETS.some((p) => p.value === formSchedule)
                      ? formSchedule
                      : "custom"
                  }
                  onChange={(e) => setFormSchedule(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                >
                  {SCHEDULE_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                </select>
                {formSchedule === "custom" && (
                  <input
                    type="text"
                    value={formCustomCron}
                    onChange={(e) => setFormCustomCron(e.target.value)}
                    placeholder="0 */6 * * * (every 6 hours)"
                    className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                )}
              </div>

              {/* Task Description */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Task Description
                </label>
                <textarea
                  value={formTask}
                  onChange={(e) => setFormTask(e.target.value)}
                  rows={4}
                  placeholder="e.g. Check all leads from last 24h and send follow-up emails to anyone with score > 6"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              {/* Notification */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Notification
                </label>
                <select
                  value={formNotification}
                  onChange={(e) => setFormNotification(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                >
                  <option value="NONE">None</option>
                  <option value="EMAIL">Email me results</option>
                  <option value="WEBHOOK">Webhook URL</option>
                </select>
                {formNotification === "EMAIL" && (
                  <input
                    type="email"
                    value={formNotificationTarget}
                    onChange={(e) => setFormNotificationTarget(e.target.value)}
                    placeholder="your@email.com"
                    className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                )}
                {formNotification === "WEBHOOK" && (
                  <input
                    type="url"
                    value={formNotificationTarget}
                    onChange={(e) => setFormNotificationTarget(e.target.value)}
                    placeholder="https://your-app.com/webhook"
                    className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={
                  creating ||
                  !formName.trim() ||
                  !formTask.trim() ||
                  (formSchedule === "custom" && !formCustomCron.trim())
                }
              >
                {creating ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                )}
                Create Automation
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
