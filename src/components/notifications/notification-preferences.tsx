"use client";

import { useState, useEffect } from "react";
import {
  Bell, Mail, MessageSquare, Send, Smartphone, Globe, Save, Loader2, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const EVENT_TYPES = [
  { id: "new_lead", label: "Neuer Lead", description: "Wenn ein neues Gespräch startet" },
  { id: "handoff", label: "Handoff", description: "Wenn ein Nutzer einen Menschen anfordert" },
  { id: "approval_request", label: "Genehmigung", description: "Neue Approval-Anfrage" },
  { id: "workflow_complete", label: "Workflow fertig", description: "Wenn ein Workflow abgeschlossen ist" },
  { id: "error", label: "Fehler", description: "Bei Agent-/Workflow-Fehlern" },
  { id: "weekly_summary", label: "Wochenbericht", description: "Wöchentliche Zusammenfassung" },
] as const;

const CHANNELS = [
  { id: "email", label: "E-Mail", icon: Mail },
  { id: "slack", label: "Slack", icon: MessageSquare },
  { id: "telegram", label: "Telegram", icon: Send },
  { id: "whatsapp", label: "WhatsApp", icon: Smartphone },
  { id: "browserPush", label: "Push", icon: Globe },
] as const;

interface Preference {
  eventType: string;
  email: boolean;
  slack: boolean;
  telegram: boolean;
  whatsapp: boolean;
  browserPush: boolean;
  slackChannel?: string;
  telegramChatId?: string;
  whatsappNumber?: string;
}

interface Props {
  agentId?: string; // null = global
}

export function NotificationPreferences({ agentId }: Props) {
  const [prefs, setPrefs] = useState<Record<string, Preference>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [slackChannel, setSlackChannel] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data) => {
        const map: Record<string, Preference> = {};
        for (const pref of data.preferences || []) {
          // Nur relevante Prefs (global oder agent-spezifisch)
          if (agentId ? pref.agentId === agentId : !pref.agentId) {
            map[pref.eventType] = pref;
            // Globale Channel-Daten extrahieren
            if (pref.slackChannel) setSlackChannel(pref.slackChannel);
            if (pref.telegramChatId) setTelegramChatId(pref.telegramChatId);
            if (pref.whatsappNumber) setWhatsappNumber(pref.whatsappNumber);
          }
        }
        setPrefs(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [agentId]);

  const toggleChannel = (eventType: string, channel: string) => {
    setPrefs((prev) => {
      const existing = prev[eventType] || {
        eventType,
        email: true,
        slack: false,
        telegram: false,
        whatsapp: false,
        browserPush: false,
      };
      return {
        ...prev,
        [eventType]: {
          ...existing,
          [channel]: !existing[channel as keyof Preference],
        },
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const [eventType, pref] of Object.entries(prefs)) {
        await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: agentId || null,
            eventType,
            email: pref.email,
            slack: pref.slack,
            telegram: pref.telegram,
            whatsapp: pref.whatsapp,
            browserPush: pref.browserPush,
            slackChannel: slackChannel || null,
            telegramChatId: telegramChatId || null,
            whatsappNumber: whatsappNumber || null,
          }),
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      // Fehler ignorieren
    }
    setSaving(false);
  };

  const enablePush = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    const reg = await navigator.serviceWorker.register("/sw.js");
    const vapidRes = await fetch("/api/notifications/push");
    const { publicKey } = await vapidRes.json();
    if (!publicKey) return;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: publicKey,
    });

    await fetch("/api/notifications/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent }),
    });
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
        <Bell className="h-5 w-5 text-orange-400" />
        <h3 className="text-sm font-semibold text-foreground">
          {agentId ? "Agent-Benachrichtigungen" : "Globale Benachrichtigungen"}
        </h3>
      </div>

      {/* Channel Settings */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Slack Channel
          </label>
          <input
            value={slackChannel}
            onChange={(e) => setSlackChannel(e.target.value)}
            placeholder="#notifications"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-orange-500/60 placeholder:text-muted-foreground"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Telegram Chat ID
          </label>
          <input
            value={telegramChatId}
            onChange={(e) => setTelegramChatId(e.target.value)}
            placeholder="123456789"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-orange-500/60 placeholder:text-muted-foreground"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            WhatsApp Nummer
          </label>
          <input
            value={whatsappNumber}
            onChange={(e) => setWhatsappNumber(e.target.value)}
            placeholder="+4915..."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-orange-500/60 placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Event
              </th>
              {CHANNELS.map((ch) => (
                <th key={ch.id} className="pb-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <div className="flex flex-col items-center gap-0.5">
                    <ch.icon className="h-3.5 w-3.5" />
                    <span>{ch.label}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EVENT_TYPES.map((evt) => {
              const pref = prefs[evt.id] || {
                eventType: evt.id,
                email: true,
                slack: false,
                telegram: false,
                whatsapp: false,
                browserPush: false,
              };
              return (
                <tr key={evt.id} className="border-b border-border/50">
                  <td className="py-2.5 pr-4">
                    <span className="text-xs font-medium text-foreground">{evt.label}</span>
                    <p className="text-[10px] text-muted-foreground">{evt.description}</p>
                  </td>
                  {CHANNELS.map((ch) => (
                    <td key={ch.id} className="py-2.5 text-center">
                      <button
                        onClick={() => toggleChannel(evt.id, ch.id)}
                        className={`mx-auto flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                          pref[ch.id as keyof Preference]
                            ? "bg-orange-500/20 text-orange-400"
                            : "bg-card text-muted-foreground hover:text-muted-foreground"
                        }`}
                      >
                        {pref[ch.id as keyof Preference] ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <span className="h-3 w-3" />
                        )}
                      </button>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Push + Save */}
      <div className="flex items-center gap-2">
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
        <Button
          size="sm"
          variant="outline"
          onClick={enablePush}
          className="text-xs h-8 border-border"
        >
          <Globe className="mr-1.5 h-3.5 w-3.5" />
          Push aktivieren
        </Button>
      </div>
    </div>
  );
}
