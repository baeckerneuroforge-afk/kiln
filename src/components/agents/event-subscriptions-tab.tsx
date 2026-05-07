"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Copy, Check, ChevronDown, ChevronRight, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TabEmptyState } from "./tab-empty-state";

const ALL_EVENT_TYPES = [
  { value: "conversation.started", label: "Conversation Started" },
  { value: "conversation.completed", label: "Conversation Completed" },
  { value: "lead.captured", label: "Lead Captured" },
  { value: "appointment.booked", label: "Appointment Booked" },
  { value: "task.completed", label: "Task Completed" },
  { value: "task.failed", label: "Task Failed" },
  { value: "team.completed", label: "Team Execution Completed" },
  { value: "credits.low", label: "Credits Running Low" },
  { value: "agent.updated", label: "Agent Updated" },
] as const;

interface Delivery {
  id: string;
  event: string;
  statusCode: number | null;
  responseTime: number | null;
  success: boolean;
  error: string | null;
  createdAt: string;
}

interface Subscription {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  createdAt: string;
  deliveries: Delivery[];
}

interface EventSubscriptionsTabProps {
  agentId: string;
}

export function EventSubscriptionsTab({ agentId }: EventSubscriptionsTabProps) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formUrl, setFormUrl] = useState("");
  const [formEvents, setFormEvents] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    loadSubscriptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  async function loadSubscriptions() {
    try {
      const res = await fetch(`/api/agents/${agentId}/event-subscriptions`);
      if (res.ok) setSubscriptions(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function createSubscription() {
    setFormError(null);
    if (!formUrl.trim()) {
      setFormError("URL is required");
      return;
    }
    if (formEvents.size === 0) {
      setFormError("Select at least one event");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/event-subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: formUrl.trim(), events: Array.from(formEvents) }),
      });
      if (res.ok) {
        setShowForm(false);
        setFormUrl("");
        setFormEvents(new Set());
        await loadSubscriptions();
      } else {
        const data = await res.json();
        setFormError(data.error || "Failed to create subscription");
      }
    } finally {
      setCreating(false);
    }
  }

  async function deleteSubscription(id: string) {
    await fetch(`/api/agents/${agentId}/event-subscriptions?id=${id}`, { method: "DELETE" });
    await loadSubscriptions();
  }

  function copySecret(secret: string) {
    navigator.clipboard.writeText(secret);
    setCopiedSecret(secret);
    setTimeout(() => setCopiedSecret(null), 2000);
  }

  function toggleEvent(eventType: string) {
    setFormEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventType)) next.delete(eventType);
      else next.add(eventType);
      return next;
    });
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">Event Subscriptions</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Get notified via webhook when events occur (conversations, leads, task completions, etc.)
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowForm(!showForm)}
          className="bg-kiln-orange text-white hover:bg-kiln-orange/90"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Subscription
        </Button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="rounded-lg border border-border bg-muted p-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Webhook URL</label>
            <input
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder="https://your-server.com/webhook"
              className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-kiln-orange focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-muted-foreground">Events</label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_EVENT_TYPES.map((evt) => (
                <button
                  key={evt.value}
                  onClick={() => toggleEvent(evt.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors text-left",
                    formEvents.has(evt.value)
                      ? "bg-kiln-orange/10 text-kiln-orange border border-kiln-orange/30"
                      : "bg-muted text-muted-foreground border border-border hover:bg-muted"
                  )}
                >
                  <span className={cn(
                    "h-3 w-3 rounded border flex-shrink-0 flex items-center justify-center",
                    formEvents.has(evt.value) ? "border-kiln-orange bg-kiln-orange" : "border-border"
                  )}>
                    {formEvents.has(evt.value) && <Check className="h-2 w-2 text-white" />}
                  </span>
                  {evt.label}
                </button>
              ))}
            </div>
          </div>

          {formError && (
            <p className="text-xs text-red-400">{formError}</p>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={createSubscription} disabled={creating} className="bg-kiln-orange text-white hover:bg-kiln-orange/90">
              {creating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setFormError(null); }} className="text-muted-foreground">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Subscription List */}
      {subscriptions.length === 0 && !showForm && (
        <TabEmptyState
          icon={Webhook}
          tone="violet"
          title="No event subscriptions"
          description="Subscribe to webhooks or platform events. Each delivery is signed with a per-subscription secret you can verify on the receiving end."
          action={{
            label: "Add subscription",
            onClick: () => setShowForm(true),
          }}
        />
      )}

      {subscriptions.map((sub) => (
        <div key={sub.id} className="rounded-lg border border-border bg-muted overflow-hidden">
          <div className="flex items-center gap-3 p-4">
            <span className={cn("h-3 w-3 rounded-full flex-shrink-0", sub.active ? "bg-green-500" : "bg-neutral-600")} />
            <div className="flex-1 min-w-0">
              <code className="block truncate text-xs text-foreground">{sub.url}</code>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {sub.events.map((evt) => (
                  <span key={evt} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {evt}
                  </span>
                ))}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Secret:</span>
                <code className="text-[11px] text-muted-foreground">{sub.secret.slice(0, 12)}...</code>
                <button onClick={() => copySecret(sub.secret)} className="text-muted-foreground hover:text-foreground">
                  {copiedSecret === sub.secret ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Button size="sm" variant="ghost" onClick={() => setExpanded(expanded === sub.id ? null : sub.id)} className="h-7 px-2 text-muted-foreground hover:text-foreground">
                {expanded === sub.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => deleteSubscription(sub.id)} className="h-7 px-2 text-muted-foreground hover:text-red-400">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Delivery Log */}
          {expanded === sub.id && (
            <div className="border-t border-border">
              {sub.deliveries.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">No deliveries yet</p>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {sub.deliveries.map((del) => (
                    <div key={del.id} className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "inline-block h-1.5 w-1.5 rounded-full",
                            del.success ? "bg-green-500" : "bg-red-500"
                          )} />
                          <span className="text-xs text-muted-foreground">
                            {del.statusCode ?? "—"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {del.responseTime != null ? `${del.responseTime}ms` : "—"}
                          </span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-kiln-orange">
                            {del.event}
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(del.createdAt).toLocaleString()}
                        </span>
                      </div>
                      {del.error && (
                        <p className="mt-1 text-xs text-red-400">{del.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
