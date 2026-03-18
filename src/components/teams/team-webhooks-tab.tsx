"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Globe,
  Loader2,
  Plus,
  Send,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TEAM_EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/event-types";
import type { EventType } from "@/lib/event-types";

interface WebhookDelivery {
  id: string;
  event: string;
  statusCode: number | null;
  responseTime: number | null;
  success: boolean;
  error: string | null;
  createdAt: string;
}

interface TeamWebhook {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  createdAt: string;
  deliveries: WebhookDelivery[];
}

interface TeamWebhooksTabProps {
  teamId: string;
}

export function TeamWebhooksTab({ teamId }: TeamWebhooksTabProps) {
  const [webhooks, setWebhooks] = useState<TeamWebhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Create form
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Test state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ webhookId: string; success: boolean; error?: string } | null>(null);

  const fetchWebhooks = useCallback(async () => {
    try {
      const res = await fetch(`/api/teams/${teamId}/webhooks`);
      if (res.ok) {
        setWebhooks(await res.json());
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const createWebhook = async () => {
    if (!newUrl.trim() || newEvents.size === 0) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch(`/api/teams/${teamId}/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newUrl, events: Array.from(newEvents) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create webhook");
      }
      setNewUrl("");
      setNewEvents(new Set());
      setShowCreate(false);
      await fetchWebhooks();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Error");
    } finally {
      setCreating(false);
    }
  };

  const toggleWebhook = async (webhookId: string, active: boolean) => {
    await fetch(`/api/teams/${teamId}/webhooks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhookId, active }),
    });
    await fetchWebhooks();
  };

  const deleteWebhook = async (webhookId: string) => {
    await fetch(`/api/teams/${teamId}/webhooks`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhookId }),
    });
    await fetchWebhooks();
  };

  const testWebhook = async (webhookId: string) => {
    setTestingId(webhookId);
    setTestResult(null);
    try {
      const res = await fetch(`/api/teams/${teamId}/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", webhookId }),
      });
      const data = await res.json();
      setTestResult({ webhookId, success: data.success, error: data.error || undefined });
      await fetchWebhooks();
    } catch {
      setTestResult({ webhookId, success: false, error: "Test failed" });
    } finally {
      setTestingId(null);
    }
  };

  const copySecret = (secret: string) => {
    navigator.clipboard.writeText(secret);
  };

  const toggleEvent = (event: string) => {
    setNewEvents((prev) => {
      const next = new Set(prev);
      if (next.has(event)) next.delete(event);
      else next.add(event);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Team Webhooks</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Receive HTTP notifications after each agent step, approval gate, or execution completion.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreate(!showCreate)}
          className="bg-orange-600 hover:bg-orange-700 text-white"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Add Webhook
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Endpoint URL</label>
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://your-server.com/webhook"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Events</label>
            <div className="grid grid-cols-1 gap-2">
              {TEAM_EVENT_TYPES.map((event) => (
                <button
                  key={event}
                  type="button"
                  onClick={() => toggleEvent(event)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-all",
                    newEvents.has(event)
                      ? "border-orange-500/40 bg-orange-500/10 text-orange-300"
                      : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600"
                  )}
                >
                  <div className={cn(
                    "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                    newEvents.has(event)
                      ? "border-orange-500 bg-orange-500"
                      : "border-zinc-600"
                  )}>
                    {newEvents.has(event) && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <div>
                    <span className="font-medium">{EVENT_TYPE_LABELS[event as EventType]}</span>
                    <span className="ml-2 text-zinc-500 font-mono text-[10px]">{event}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {createError && (
            <div className="flex items-center gap-2 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5" />
              {createError}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              onClick={createWebhook}
              disabled={creating || !newUrl.trim() || newEvents.size === 0}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Globe className="h-4 w-4 mr-1.5" />}
              Create Webhook
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowCreate(false)}
              className="text-zinc-400"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Webhook list */}
      {webhooks.length === 0 && !showCreate ? (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 p-8 text-center">
          <Globe className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-400">No webhooks configured</p>
          <p className="text-xs text-zinc-500 mt-1">
            Add a webhook to receive real-time notifications when your team executes tasks.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh) => {
            const isExpanded = expandedId === wh.id;
            const recentDeliveries = wh.deliveries.slice(0, 10);
            const successRate = wh.deliveries.length > 0
              ? Math.round((wh.deliveries.filter((d) => d.success).length / wh.deliveries.length) * 100)
              : null;

            return (
              <div
                key={wh.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden"
              >
                {/* Webhook header */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className={cn(
                    "h-2 w-2 rounded-full shrink-0",
                    wh.active ? "bg-green-500" : "bg-zinc-600"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 font-medium truncate font-mono">
                      {wh.url}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-zinc-500">
                        {wh.events.length} event{wh.events.length !== 1 ? "s" : ""}
                      </span>
                      {successRate !== null && (
                        <span className={cn(
                          "text-[10px]",
                          successRate >= 80 ? "text-green-400" : successRate >= 50 ? "text-amber-400" : "text-red-400"
                        )}>
                          {successRate}% delivery rate
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => testWebhook(wh.id)}
                      disabled={testingId === wh.id}
                      className="text-zinc-400 hover:text-zinc-200 h-8 px-2"
                    >
                      {testingId === wh.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleWebhook(wh.id, !wh.active)}
                      className={cn(
                        "h-8 px-2",
                        wh.active ? "text-green-400 hover:text-green-300" : "text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      {wh.active ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteWebhook(wh.id)}
                      className="text-zinc-500 hover:text-red-400 h-8 px-2"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpandedId(isExpanded ? null : wh.id)}
                      className="text-zinc-400 hover:text-zinc-200 h-8 px-2"
                    >
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>

                {/* Test result banner */}
                {testResult && testResult.webhookId === wh.id && (
                  <div className={cn(
                    "px-4 py-2 text-xs flex items-center gap-2 border-t border-zinc-800",
                    testResult.success ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                  )}>
                    {testResult.success ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    {testResult.success ? "Test webhook delivered successfully" : `Test failed: ${testResult.error}`}
                    <button onClick={() => setTestResult(null)} className="ml-auto">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-zinc-800 px-4 py-3 space-y-3">
                    {/* Secret */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Signing Secret</span>
                      <code className="text-[11px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded font-mono">
                        {wh.secret.slice(0, 12)}...
                      </code>
                      <button
                        onClick={() => copySecret(wh.secret)}
                        className="text-zinc-500 hover:text-zinc-300"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Subscribed events */}
                    <div>
                      <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Subscribed Events</span>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {wh.events.map((event) => (
                          <span
                            key={event}
                            className="rounded-full bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 font-mono"
                          >
                            {event}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Recent deliveries */}
                    {recentDeliveries.length > 0 && (
                      <div>
                        <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Recent Deliveries</span>
                        <div className="mt-1.5 space-y-1">
                          {recentDeliveries.map((d) => (
                            <div
                              key={d.id}
                              className="flex items-center gap-2 text-[11px] py-1 px-2 rounded-lg bg-zinc-800/50"
                            >
                              {d.success ? (
                                <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
                              ) : (
                                <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                              )}
                              <span className="text-zinc-400 font-mono">{d.event}</span>
                              {d.statusCode && (
                                <span className={cn(
                                  "font-mono",
                                  d.success ? "text-green-400" : "text-red-400"
                                )}>
                                  {d.statusCode}
                                </span>
                              )}
                              {d.responseTime && (
                                <span className="text-zinc-500">{d.responseTime}ms</span>
                              )}
                              <span className="ml-auto text-zinc-600 text-[10px]">
                                {new Date(d.createdAt).toLocaleString("de-DE", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  day: "2-digit",
                                  month: "2-digit",
                                })}
                              </span>
                              {d.error && (
                                <span className="text-red-400 truncate max-w-[200px]" title={d.error}>
                                  {d.error}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Integration hint */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h4 className="text-xs font-semibold text-zinc-300 mb-2">Integration Examples</h4>
        <div className="space-y-1.5 text-[11px] text-zinc-500">
          <p><span className="text-orange-400 font-medium">step_completed</span> → Update CRM after qualifier, send Slack after closer</p>
          <p><span className="text-orange-400 font-medium">approval_needed</span> → Create Jira ticket, notify on Slack</p>
          <p><span className="text-orange-400 font-medium">completed</span> → Trigger downstream workflows, update dashboards</p>
          <p><span className="text-orange-400 font-medium">failed</span> → Alert on PagerDuty, create incident</p>
        </div>
        <div className="mt-3 rounded-lg bg-zinc-800 p-3">
          <p className="text-[10px] text-zinc-500 mb-1">Verify webhook signatures with:</p>
          <code className="text-[10px] text-zinc-400 font-mono">
            HMAC-SHA256(request_body, signing_secret) === X-KILN-Signature header
          </code>
        </div>
      </div>
    </div>
  );
}
