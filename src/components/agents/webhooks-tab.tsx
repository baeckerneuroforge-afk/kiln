"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Copy, Check, Send, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WebhookExecution {
  id: string;
  incomingPayload: unknown;
  agentResponse: string | null;
  actionsExecuted: string[] | null;
  duration: number | null;
  statusCode: number;
  createdAt: string;
}

interface Webhook {
  id: string;
  path: string;
  secret: string;
  httpMethods: string[];
  authType: "NONE" | "HEADER_AUTH" | "HMAC";
  authValue: string | null;
  responseMode: "IMMEDIATE" | "AFTER_PROCESSING";
  isActive: boolean;
  createdAt: string;
  executions: WebhookExecution[];
}

interface WebhooksTabProps {
  agentId: string;
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";

export function WebhooksTab({ agentId }: WebhooksTabProps) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [formAuth, setFormAuth] = useState<"NONE" | "HEADER_AUTH" | "HMAC">("NONE");
  const [formAuthValue, setFormAuthValue] = useState("");
  const [formResponse, setFormResponse] = useState<"IMMEDIATE" | "AFTER_PROCESSING">("IMMEDIATE");

  useEffect(() => {
    loadWebhooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  async function loadWebhooks() {
    try {
      const res = await fetch(`/api/agents/${agentId}/webhooks`);
      if (res.ok) setWebhooks(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function createWebhook() {
    setCreating(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authType: formAuth,
          authValue: formAuth !== "NONE" ? formAuthValue : null,
          responseMode: formResponse,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setFormAuth("NONE");
        setFormAuthValue("");
        setFormResponse("IMMEDIATE");
        await loadWebhooks();
      }
    } finally {
      setCreating(false);
    }
  }

  async function deleteWebhook(webhookId: string) {
    await fetch(`/api/agents/${agentId}/webhooks`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhookId }),
    });
    await loadWebhooks();
  }

  async function toggleWebhook(webhook: Webhook) {
    await fetch(`/api/agents/${agentId}/webhooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhookId: webhook.id, isActive: !webhook.isActive }),
    });
    await loadWebhooks();
  }

  async function testWebhook(webhook: Webhook) {
    setTesting(webhook.id);
    try {
      const url = `${BASE_URL}/api/webhooks/agent/${webhook.path}`;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (webhook.authType === "HEADER_AUTH" && webhook.authValue) {
        headers["Authorization"] = `Bearer ${webhook.authValue}`;
      }
      await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          event: "test",
          message: "This is a test webhook payload",
          timestamp: new Date().toISOString(),
        }),
      });
      await loadWebhooks();
    } finally {
      setTesting(null);
    }
  }

  function copyUrl(path: string) {
    navigator.clipboard.writeText(`${BASE_URL}/api/webhooks/agent/${path}`);
    setCopied(path);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-neutral-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-white">Inbound Webhooks</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Receive HTTP requests from external services to trigger agent processing.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowForm(!showForm)}
          className="bg-[#F97316] text-white hover:bg-[#EA580C]"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Webhook
        </Button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-400">Authentication</label>
            <div className="flex gap-2">
              {(["NONE", "HEADER_AUTH", "HMAC"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFormAuth(t)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs transition-colors",
                    formAuth === t ? "bg-[#F97316] text-white" : "bg-white/[0.04] text-neutral-400 hover:bg-white/[0.08]"
                  )}
                >
                  {t === "NONE" ? "None" : t === "HEADER_AUTH" ? "Bearer Token" : "HMAC"}
                </button>
              ))}
            </div>
          </div>

          {formAuth !== "NONE" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-400">
                {formAuth === "HEADER_AUTH" ? "Bearer Token" : "HMAC Secret"}
              </label>
              <input
                value={formAuthValue}
                onChange={(e) => setFormAuthValue(e.target.value)}
                placeholder={formAuth === "HEADER_AUTH" ? "your-secret-token" : "hmac-signing-secret"}
                className="w-full rounded-md border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-[#F97316] focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-400">Response Mode</label>
            <div className="flex gap-2">
              {(["IMMEDIATE", "AFTER_PROCESSING"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setFormResponse(m)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs transition-colors",
                    formResponse === m ? "bg-[#F97316] text-white" : "bg-white/[0.04] text-neutral-400 hover:bg-white/[0.08]"
                  )}
                >
                  {m === "IMMEDIATE" ? "Immediate (async)" : "Wait for response"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={createWebhook} disabled={creating} className="bg-[#F97316] text-white hover:bg-[#EA580C]">
              {creating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)} className="text-neutral-500">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Webhook List */}
      {webhooks.length === 0 && !showForm && (
        <div className="rounded-lg border border-dashed border-white/10 py-10 text-center text-sm text-neutral-500">
          No webhooks configured. Create one to receive external events.
        </div>
      )}

      {webhooks.map((wh) => (
        <div key={wh.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 p-4">
            <button
              onClick={() => toggleWebhook(wh)}
              className={cn(
                "h-3 w-3 rounded-full transition-colors",
                wh.isActive ? "bg-green-500" : "bg-neutral-600"
              )}
              title={wh.isActive ? "Active" : "Inactive"}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <code className="truncate text-xs text-neutral-300">
                  /api/webhooks/agent/{wh.path}
                </code>
                <button onClick={() => copyUrl(wh.path)} className="text-neutral-500 hover:text-white">
                  {copied === wh.path ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="mt-1 flex items-center gap-3 text-[11px] text-neutral-500">
                <span>{wh.authType === "NONE" ? "No auth" : wh.authType === "HEADER_AUTH" ? "Bearer token" : "HMAC"}</span>
                <span>{wh.responseMode === "IMMEDIATE" ? "Async" : "Sync"}</span>
                <span>{wh.executions.length} executions</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => testWebhook(wh)} disabled={testing === wh.id} className="h-7 px-2 text-neutral-500 hover:text-white">
                {testing === wh.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setExpanded(expanded === wh.id ? null : wh.id)} className="h-7 px-2 text-neutral-500 hover:text-white">
                {expanded === wh.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => deleteWebhook(wh.id)} className="h-7 px-2 text-neutral-500 hover:text-red-400">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Execution Log */}
          {expanded === wh.id && (
            <div className="border-t border-white/[0.04]">
              {wh.executions.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-neutral-600">No executions yet</p>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {wh.executions.map((ex) => (
                    <div key={ex.id} className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "inline-block h-1.5 w-1.5 rounded-full",
                            ex.statusCode < 400 ? "bg-green-500" : "bg-red-500"
                          )} />
                          <span className="text-xs text-neutral-400">{ex.statusCode}</span>
                          <span className="text-xs text-neutral-600">{ex.duration}ms</span>
                          {ex.actionsExecuted && (ex.actionsExecuted as string[]).length > 0 && (
                            <span className="text-xs text-[#F97316]">
                              {(ex.actionsExecuted as string[]).join(", ")}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-neutral-600">
                          {new Date(ex.createdAt).toLocaleString()}
                        </span>
                      </div>
                      {ex.agentResponse && (
                        <p className="mt-1.5 truncate text-xs text-neutral-500">
                          {ex.agentResponse.slice(0, 200)}
                        </p>
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
