"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

interface ReportConfig {
  isEnabled: boolean;
  frequency: string;
  recipientEmails: string[];
  includeMetrics: string[];
  customMessage: string | null;
  sendDayOfMonth: number;
  sendHour: number;
  sendOnEmpty: boolean;
}

const FREQUENCIES = ["MONTHLY", "WEEKLY", "NONE"];
const ALL_METRICS = ["CONVERSATIONS", "SLA", "COST_SAVED", "CUSTOMERS", "TOPICS"];

export default function ReportSettingsPage() {
  const [config, setConfig] = useState<ReportConfig>({
    isEnabled: true,
    frequency: "MONTHLY",
    recipientEmails: [],
    includeMetrics: ALL_METRICS,
    customMessage: "",
    sendDayOfMonth: 1,
    sendHour: 8,
    sendOnEmpty: true,
  });
  const [recipientInput, setRecipientInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/reports/config")
      .then(async (res) => (res.ok ? await res.json() : null))
      .then((payload) => {
        if (!cancelled && payload) {
          setConfig({
            isEnabled: payload.isEnabled,
            frequency: payload.frequency,
            recipientEmails: payload.recipientEmails ?? [],
            includeMetrics: payload.includeMetrics ?? ALL_METRICS,
            customMessage: payload.customMessage ?? "",
            sendDayOfMonth: payload.sendDayOfMonth ?? 1,
            sendHour: payload.sendHour ?? 8,
            sendOnEmpty: payload.sendOnEmpty ?? true,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const res = await fetch("/api/reports/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaving(false);
    if (res.ok) setSavedAt(new Date().toLocaleTimeString("de-DE"));
  }, [config]);

  const addRecipient = useCallback(() => {
    const value = recipientInput.trim();
    if (!value || !value.includes("@")) return;
    setConfig((prev) => ({
      ...prev,
      recipientEmails: Array.from(new Set([...prev.recipientEmails, value])),
    }));
    setRecipientInput("");
  }, [recipientInput]);

  const removeRecipient = useCallback((email: string) => {
    setConfig((prev) => ({ ...prev, recipientEmails: prev.recipientEmails.filter((e) => e !== email) }));
  }, []);

  const toggleMetric = useCallback((metric: string) => {
    setConfig((prev) => ({
      ...prev,
      includeMetrics: prev.includeMetrics.includes(metric)
        ? prev.includeMetrics.filter((m) => m !== metric)
        : [...prev.includeMetrics, metric],
    }));
  }, []);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">
      <Link href="/dashboard/reports" className="text-xs text-muted-foreground hover:underline">
        ← Reports
      </Link>
      <h1 className="text-2xl font-semibold text-foreground">Report-Einstellungen</h1>

      <section className="rounded-md border border-border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Reports aktiviert</div>
            <div className="text-xs text-muted-foreground">
              Wenn deaktiviert, werden keine automatischen Reports versendet.
            </div>
          </div>
          <Switch
            checked={config.isEnabled}
            onCheckedChange={(value) => setConfig((prev) => ({ ...prev, isEnabled: value }))}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Auch ohne Aktivitaet senden</div>
            <div className="text-xs text-muted-foreground">
              &quot;0 Conversations&quot;-Reports versenden statt zu ueberspringen.
            </div>
          </div>
          <Switch
            checked={config.sendOnEmpty}
            onCheckedChange={(value) => setConfig((prev) => ({ ...prev, sendOnEmpty: value }))}
          />
        </div>
      </section>

      <section className="rounded-md border border-border p-4 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Frequenz</h2>
        <select
          value={config.frequency}
          onChange={(event) => setConfig((prev) => ({ ...prev, frequency: event.target.value }))}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {FREQUENCIES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs uppercase text-muted-foreground">Tag im Monat (1-28)</label>
            <Input
              type="number"
              min={1}
              max={28}
              value={config.sendDayOfMonth}
              onChange={(event) =>
                setConfig((prev) => ({ ...prev, sendDayOfMonth: Math.min(28, Math.max(1, Number.parseInt(event.target.value, 10) || 1)) }))
              }
            />
          </div>
          <div>
            <label className="text-xs uppercase text-muted-foreground">Stunde (UTC)</label>
            <Input
              type="number"
              min={0}
              max={23}
              value={config.sendHour}
              onChange={(event) =>
                setConfig((prev) => ({ ...prev, sendHour: Math.min(23, Math.max(0, Number.parseInt(event.target.value, 10) || 0)) }))
              }
            />
          </div>
        </div>
      </section>

      <section className="rounded-md border border-border p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Empfaenger</h2>
        <div className="flex gap-2">
          <Input
            value={recipientInput}
            onChange={(event) => setRecipientInput(event.target.value)}
            placeholder="email@example.com"
          />
          <Button onClick={addRecipient} disabled={!recipientInput.includes("@")}>
            Hinzufuegen
          </Button>
        </div>
        {config.recipientEmails.length === 0 ? (
          <p className="text-xs text-muted-foreground">Noch keine Empfaenger.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {config.recipientEmails.map((email) => (
              <li key={email} className="flex items-center justify-between rounded-md border border-border px-3 py-1">
                {email}
                <Button size="sm" variant="ghost" onClick={() => removeRecipient(email)}>
                  Entfernen
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-md border border-border p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Inhalte</h2>
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
          {ALL_METRICS.map((metric) => (
            <label key={metric} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.includeMetrics.includes(metric)}
                onChange={() => toggleMetric(metric)}
              />
              {metric}
            </label>
          ))}
        </div>
        <div>
          <label className="text-xs uppercase text-muted-foreground">Persoenliche Notiz (optional, wird gerendert mit HTML-Escape)</label>
          <Textarea
            value={config.customMessage ?? ""}
            onChange={(event) => setConfig((prev) => ({ ...prev, customMessage: event.target.value }))}
            rows={4}
          />
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" /> Speichern
        </Button>
        {savedAt ? <span className="text-xs text-muted-foreground">Gespeichert um {savedAt}</span> : null}
      </div>
    </div>
  );
}
