"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-neutral-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-white">Event Subscriptions</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Get notified via webhook when events occur (conversations, leads, task completions, etc.)
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowForm(!showForm)}
          className="bg-[#F97316] text-white hover:bg-[#EA580C]"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Subscription
        </Button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-400">Webhook URL</label>
            <input
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder="https://your-server.com/webhook"
              className="w-full rounded-md border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-[#F97316] focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-neutral-400">Events</label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_EVENT_TYPES.map((evt) => (
                <button
                  key={evt.value}
                  onClick={() => toggleEvent(evt.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors text-left",
                    formEvents.has(evt.value)
                      ? "bg-[#F97316]/10 text-[#F97316] border border-[#F97316]/30"
                      : "bg-white/[0.03] text-neutral-400 border border-white/[0.06] hover:bg-white/[0.06]"
                  )}
                >
                  <span className={cn(
                    "h-3 w-3 rounded border flex-shrink-0 flex items-center justify-center",
                    formEvents.has(evt.value) ? "border-[#F97316] bg-[#F97316]" : "border-neutral-600"
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
            <Button size="sm" onClick={createSubscription} disabled={creating} className="bg-[#F97316] text-white hover:bg-[#EA580C]">
              {creating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setFormError(null); }} className="text-neutral-500">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Subscription List */}
      {subscriptions.length === 0 && !showForm && (
        <div className="rounded-lg border border-dashed border-white/10 py-10 text-center text-sm text-neutral-500">
          No event subscriptions configured. Add one to receive webhook notifications.
        </div>
      )}

      {subscriptions.map((sub) => (
        <div key={sub.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <div className="flex items-center gap-3 p-4">
            <span className={cn("h-3 w-3 rounded-full flex-shrink-0", sub.active ? "bg-green-500" : "bg-neutral-600")} />
            <div className="flex-1 min-w-0">
              <code className="block truncate text-xs text-neutral-300">{sub.url}</code>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {sub.events.map((evt) => (
                  <span key={evt} className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-neutral-400">
                    {evt}
                  </span>
                ))}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[11px] text-neutral-600">Secret:</span>
                <code className="text-[11px] text-neutral-500">{sub.secret.slice(0, 12)}...</code>
                <button onClick={() => copySecret(sub.secret)} className="text-neutral-500 hover:text-white">
                  {copiedSecret === sub.secret ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Button size="sm" variant="ghost" onClick={() => setExpanded(expanded === sub.id ? null : sub.id)} className="h-7 px-2 text-neutral-500 hover:text-white">
                {expanded === sub.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => deleteSubscription(sub.id)} className="h-7 px-2 text-neutral-500 hover:text-red-400">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Delivery Log */}
          {expanded === sub.id && (
            <div className="border-t border-white/[0.04]">
              {sub.deliveries.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-neutral-600">No deliveries yet</p>
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
                          <span className="text-xs text-neutral-400">
                            {del.statusCode ?? "—"}
                          </span>
                          <span className="text-xs text-neutral-600">
                            {del.responseTime != null ? `${del.responseTime}ms` : "—"}
                          </span>
                          <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-[#F97316]">
                            {del.event}
                          </span>
                        </div>
                        <span className="text-[11px] text-neutral-600">
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
