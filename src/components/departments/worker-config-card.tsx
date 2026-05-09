"use client";

import { Bot, Check, Loader2 } from "lucide-react";
import { useState } from "react";
import type { DepartmentWorkerView } from "./types";

export function WorkerConfigCard({ worker }: { worker: DepartmentWorkerView }) {
  const [tier, setTier] = useState(worker.preferredModelTier ?? "AUTO");
  const [provider, setProvider] = useState(worker.preferredProvider ?? "AUTO");
  const [citationCheck, setCitationCheck] = useState(Boolean(worker.enableCitationCheck));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function saveSettings(next?: { tier?: string; provider?: string; citationCheck?: boolean }) {
    if (!worker.departmentId) return;
    const nextTier = next?.tier ?? tier;
    const nextProvider = next?.provider ?? provider;
    const nextCitation = next?.citationCheck ?? citationCheck;
    setSaving(true);
    setSaved(false);
    try {
      const response = await fetch(`/api/departments/${worker.departmentId}/workers/${worker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferredModelTier: nextTier === "AUTO" ? null : nextTier,
          preferredProvider: nextProvider === "AUTO" ? null : nextProvider,
          enableCitationCheck: nextCitation,
        }),
      });
      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1600);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card/70 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-orange-500/20 bg-orange-500/10">
          <Bot className="h-4 w-4 text-orange-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-foreground">{worker.role}</h3>
            <span className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
              priority {worker.priority}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{worker.description}</p>
          <div className="mt-3 rounded border border-border/70 bg-black/20 p-3">
            <p className="text-sm font-medium text-foreground">{worker.agent.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{worker.agent.llmModel}</p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Model-Tier</span>
              <select
                value={tier}
                onChange={(event) => {
                  setTier(event.target.value);
                  void saveSettings({ tier: event.target.value });
                }}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="AUTO">Auto</option>
                <option value="FAST">Fast</option>
                <option value="BALANCED">Balanced</option>
                <option value="SMART">Smart</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Provider</span>
              <select
                value={provider}
                onChange={(event) => {
                  setProvider(event.target.value);
                  void saveSettings({ provider: event.target.value });
                }}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="AUTO">Auto</option>
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="google">Google</option>
                <option value="mistral">Mistral</option>
                <option value="groq">Groq</option>
              </select>
            </label>
            <label className="flex items-end gap-2 pb-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={citationCheck}
                onChange={(event) => {
                  setCitationCheck(event.target.checked);
                  void saveSettings({ citationCheck: event.target.checked });
                }}
                className="h-4 w-4 rounded border-border"
              />
              <span>Citation-Check</span>
            </label>
          </div>
          <div className="mt-2 h-4 text-xs text-muted-foreground">
            {saving ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Saving</span> : null}
            {saved ? <span className="inline-flex items-center gap-1 text-green-600"><Check className="h-3 w-3" /> Saved</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
