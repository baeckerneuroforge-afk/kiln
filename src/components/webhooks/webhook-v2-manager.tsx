"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Webhook,
  Plus,
  Trash2,
  Send,
  Check,
  X,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Globe,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WEBHOOK_V2_EVENT_CATEGORIES } from "@/lib/webhooks/webhook-v2-engine";

// ── Types ────────────────────────────────────────────────────

interface WebhookItem {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  deliveries?: DeliveryLog[];
}

interface DeliveryLog {
  id: string;
  event: string;
  statusCode: number | null;
  responseTime: number | null;
  success: boolean;
  error: string | null;
  createdAt: string;
}

// ── Main Component ───────────────────────────────────────────

export function WebhookV2Manager() {
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const fetchWebhooks = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/webhooks");
      if (res.ok) {
        const data = await res.json();
        setWebhooks(data.webhooks || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const handleTest = async (webhookId: string) => {
    setTestingId(webhookId);
    try {
      await fetch(`/api/v1/webhooks/${webhookId}/test`, { method: "POST" });
      await fetchWebhooks();
    } catch {
      // ignore
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (webhookId: string) => {
    if (!confirm("Webhook wirklich löschen?")) return;
    try {
      await fetch(`/api/v1/webhooks/${webhookId}`, { method: "DELETE" });
      setWebhooks((prev) => prev.filter((w) => w.id !== webhookId));
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Webhook className="w-5 h-5 text-kiln-orange" />
          <h2 className="text-lg font-serif text-foreground">Webhooks</h2>
          <span className="text-sm text-muted-foreground">{webhooks.length} konfiguriert</span>
        </div>
        <Button
          onClick={() => setShowCreateForm(true)}
          className="bg-kiln-orange hover:bg-kiln-orange/90 text-white"
          size="sm"
        >
          <Plus className="w-4 h-4 mr-1" />
          Webhook hinzufügen
        </Button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <CreateWebhookForm
          onCreated={() => {
            setShowCreateForm(false);
            fetchWebhooks();
          }}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {/* Webhook List */}
      {webhooks.length === 0 && !showCreateForm && (
        <div className="text-center py-12 text-muted-foreground">
          <Webhook className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Keine Webhooks konfiguriert.</p>
          <p className="text-sm mt-1">Erstelle einen Webhook um Events zu empfangen.</p>
        </div>
      )}

      <div className="space-y-3">
        {webhooks.map((webhook) => (
          <div
            key={webhook.id}
            className={cn(
              "rounded-lg border bg-card/30 overflow-hidden transition-colors",
              !webhook.active ? "border-red-900/50 opacity-60" : "border-border"
            )}
          >
            {/* Webhook Row */}
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    "w-2 h-2 rounded-full flex-shrink-0",
                    webhook.active ? "bg-kiln-green" : "bg-red-500"
                  )}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm text-foreground font-mono truncate">{webhook.url}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {(webhook.events || []).length} Events
                    </span>
                    <span className="text-xs text-muted-foreground">|</span>
                    <span className="text-xs text-muted-foreground">
                      Erstellt {new Date(webhook.createdAt).toLocaleDateString("de-DE")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleTest(webhook.id)}
                  disabled={testingId === webhook.id}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {testingId === webhook.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpandedId(expandedId === webhook.id ? null : webhook.id)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {expandedId === webhook.id ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(webhook.id)}
                  className="text-muted-foreground hover:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Expanded: Delivery Logs */}
            {expandedId === webhook.id && (
              <div className="border-t border-border p-4">
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Zustellungsprotokoll</h4>
                {!webhook.deliveries || webhook.deliveries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Noch keine Zustellungen.</p>
                ) : (
                  <div className="space-y-2">
                    {webhook.deliveries.slice(0, 10).map((delivery) => (
                      <div
                        key={delivery.id}
                        className="flex items-center justify-between text-xs py-2 px-3 rounded bg-card/50"
                      >
                        <div className="flex items-center gap-3">
                          {delivery.success ? (
                            <Check className="w-3.5 h-3.5 text-kiln-green" />
                          ) : (
                            <X className="w-3.5 h-3.5 text-red-400" />
                          )}
                          <span className="text-foreground font-mono">{delivery.event}</span>
                          {delivery.statusCode && (
                            <span
                              className={cn(
                                "px-1.5 py-0.5 rounded text-xs",
                                delivery.statusCode < 300
                                  ? "bg-kiln-green/10 text-kiln-green"
                                  : "bg-red-500/10 text-red-400"
                              )}
                            >
                              {delivery.statusCode}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-muted-foreground">
                          {delivery.responseTime && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {delivery.responseTime}ms
                            </span>
                          )}
                          <span>{new Date(delivery.createdAt).toLocaleString("de-DE")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Create Form ──────────────────────────────────────────────

function CreateWebhookForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const toggleCategory = (events: string[]) => {
    const allSelected = events.every((e) => selectedEvents.includes(e));
    if (allSelected) {
      setSelectedEvents((prev) => prev.filter((e) => !events.includes(e)));
    } else {
      setSelectedEvents((prev) => [...new Set([...prev, ...events])]);
    }
  };

  const handleSubmit = async () => {
    if (!url) {
      setError("URL ist erforderlich");
      return;
    }
    if (selectedEvents.length === 0) {
      setError("Mindestens ein Event auswählen");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          events: selectedEvents,
          secret: secret || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Fehler beim Erstellen");
        return;
      }

      onCreated();
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-kiln-orange/30 bg-card/50 p-6 space-y-4">
      <h3 className="text-lg font-serif text-foreground">Neuen Webhook erstellen</h3>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 p-3 rounded">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* URL */}
      <div>
        <label className="block text-sm text-muted-foreground mb-1">Endpoint URL</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/webhook"
          className="w-full px-3 py-2 rounded-md bg-card border border-border text-foreground placeholder:text-muted-foreground focus:border-kiln-orange focus:outline-none text-sm font-mono"
        />
      </div>

      {/* Secret */}
      <div>
        <label className="block text-sm text-muted-foreground mb-1">
          <Shield className="w-3.5 h-3.5 inline mr-1" />
          Signing Secret (optional — wird automatisch generiert)
        </label>
        <input
          type="text"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Leer lassen für Auto-Generierung"
          className="w-full px-3 py-2 rounded-md bg-card border border-border text-foreground placeholder:text-muted-foreground focus:border-kiln-orange focus:outline-none text-sm font-mono"
        />
      </div>

      {/* Events */}
      <div>
        <label className="block text-sm text-muted-foreground mb-3">Events</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(WEBHOOK_V2_EVENT_CATEGORIES).map(([category, events]) => (
            <div key={category} className="space-y-2">
              <button
                onClick={() => toggleCategory(events)}
                className="text-xs font-medium text-foreground hover:text-kiln-orange transition-colors"
              >
                {category}
                {events.every((e) => selectedEvents.includes(e)) && (
                  <Check className="w-3 h-3 inline ml-1 text-kiln-green" />
                )}
              </button>
              <div className="space-y-1">
                {events.map((event) => (
                  <label
                    key={event}
                    className="flex items-center gap-2 text-xs cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={selectedEvents.includes(event)}
                      onChange={() => toggleEvent(event)}
                      className="rounded border-border bg-muted text-kiln-orange focus:ring-kiln-orange"
                    />
                    <span className="text-muted-foreground group-hover:text-foreground font-mono">
                      {event}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button
          onClick={handleSubmit}
          disabled={saving}
          className="bg-kiln-orange hover:bg-kiln-orange/90 text-white"
        >
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Webhook erstellen
        </Button>
        <Button variant="ghost" onClick={onCancel} className="text-muted-foreground">
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
