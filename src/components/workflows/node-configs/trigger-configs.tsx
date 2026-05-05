"use client";

import { useState, useEffect, useCallback } from "react";
import { Copy, Check, Globe, Clock, UserPlus, MessageSquare, Play, Send } from "lucide-react";
import { ExpressionInput, KeyValueEditor } from "../expression-input";
import { cn } from "@/lib/utils";

/* ========== Shared ========== */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/* ========== Webhook Trigger ========== */
export function TriggerWebhookConfig({
  config,
  onChange,
  teamId,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  teamId: string;
}) {
  const token = (config.token as string) || "";
  const authMethod = (config.authMethod as string) || "none";
  const expectedFields = (config.expectedFields as { key: string; value: string }[]) || [];
  const webhookUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/workflows/trigger?teamId=${teamId}&token=${token || "YOUR_TOKEN"}`;

  // Auto-generate token on first render
  useEffect(() => {
    if (!token) {
      onChange({ ...config, token: crypto.randomUUID().replace(/-/g, "").slice(0, 24) });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const testWebhook = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true, timestamp: new Date().toISOString() }),
      });
      setTestResult(res.ok ? `✓ ${res.status} OK` : `✗ ${res.status} ${res.statusText}`);
    } catch {
      setTestResult("✗ Connection failed");
    } finally {
      setTesting(false);
    }
  }, [webhookUrl]);

  return (
    <div className="space-y-4">
      {/* Webhook URL */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Webhook URL</label>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
          <Globe className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <code className="flex-1 text-[11px] text-foreground truncate font-mono">{webhookUrl}</code>
          <CopyButton text={webhookUrl} />
        </div>
        <p className="text-[10px] text-muted-foreground">Send HTTP POST requests to this URL to trigger the workflow</p>
      </div>

      {/* Auth Method */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Authentication</label>
        <select
          value={authMethod}
          onChange={(e) => onChange({ ...config, authMethod: e.target.value })}
          className="w-full bg-muted border border-border rounded-lg text-sm text-foreground px-3 py-2 outline-none focus:border-orange-500/60"
        >
          <option value="none">None</option>
          <option value="api_key">API Key</option>
          <option value="hmac">HMAC Signature</option>
        </select>
      </div>

      {authMethod === "api_key" && (
        <ExpressionInput
          label="API Key"
          value={(config.apiKey as string) || ""}
          onChange={(v) => onChange({ ...config, apiKey: v })}
          placeholder="sk-..."
        />
      )}

      {authMethod === "hmac" && (
        <ExpressionInput
          label="HMAC Secret"
          value={(config.hmacSecret as string) || ""}
          onChange={(v) => onChange({ ...config, hmacSecret: v })}
          placeholder="your-hmac-secret"
        />
      )}

      {/* Expected Fields */}
      <KeyValueEditor
        label="Expected Body Fields"
        pairs={expectedFields}
        onChange={(p) => onChange({ ...config, expectedFields: p })}
        keyPlaceholder="field name"
        valuePlaceholder="type (string, number...)"
      />

      {/* Test */}
      <div className="flex items-center gap-2">
        <button
          onClick={testWebhook}
          disabled={testing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Send className="h-3 w-3" />
          {testing ? "Testing..." : "Send Test"}
        </button>
        {testResult && (
          <span className={cn("text-xs", testResult.startsWith("✓") ? "text-green-400" : "text-red-400")}>
            {testResult}
          </span>
        )}
      </div>
    </div>
  );
}

/* ========== Schedule Trigger ========== */
const CRON_PRESETS = [
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Daily 9am", cron: "0 9 * * *" },
  { label: "Daily 6pm", cron: "0 18 * * *" },
  { label: "Mon–Fri 9am", cron: "0 9 * * 1-5" },
  { label: "Weekly Mon", cron: "0 9 * * 1" },
  { label: "Monthly 1st", cron: "0 9 1 * *" },
];

const TIMEZONES = [
  "Europe/Berlin",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "UTC",
];

export function TriggerScheduleConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const cron = (config.cron as string) || "0 9 * * *";
  const timezone = (config.timezone as string) || "Europe/Berlin";
  const input = (config.input as string) || "";

  return (
    <div className="space-y-4">
      {/* Cron presets */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Schedule</label>
        <div className="flex flex-wrap gap-1.5">
          {CRON_PRESETS.map((p) => (
            <button
              key={p.cron}
              onClick={() => onChange({ ...config, cron: p.cron })}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all",
                cron === p.cron
                  ? "border-orange-500/40 bg-orange-500/10 text-orange-400"
                  : "border-border bg-muted text-muted-foreground hover:border-foreground/20"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom cron */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Cron Expression</label>
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            value={cron}
            onChange={(e) => onChange({ ...config, cron: e.target.value })}
            placeholder="0 9 * * *"
            className="flex-1 bg-muted border border-border rounded-lg text-sm font-mono text-foreground px-3 py-2 outline-none focus:border-orange-500/60"
          />
        </div>
      </div>

      {/* Timezone */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Timezone</label>
        <select
          value={timezone}
          onChange={(e) => onChange({ ...config, timezone: e.target.value })}
          className="w-full bg-muted border border-border rounded-lg text-sm text-foreground px-3 py-2 outline-none focus:border-orange-500/60"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>

      {/* Input data */}
      <ExpressionInput
        label="Input Data (passed to first node)"
        value={input}
        onChange={(v) => onChange({ ...config, input: v })}
        placeholder='{"task": "daily report"}'
        multiline
        hint="JSON or {{ expression }} that provides initial data for the workflow"
      />
    </div>
  );
}

/* ========== Lead Captured Trigger ========== */
export function TriggerLeadConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const agentFilter = (config.agentFilter as string) || "all";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
        <UserPlus className="h-4 w-4 text-amber-400" />
        <p className="text-xs text-foreground">Fires when any of your agents captures a new lead</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Agent Filter</label>
        <select
          value={agentFilter}
          onChange={(e) => onChange({ ...config, agentFilter: e.target.value })}
          className="w-full bg-muted border border-border rounded-lg text-sm text-foreground px-3 py-2 outline-none focus:border-orange-500/60"
        >
          <option value="all">Any agent</option>
        </select>
        <p className="text-[10px] text-muted-foreground">Select which agents should trigger this workflow</p>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/50 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Available Fields</p>
        <div className="flex flex-wrap gap-1">
          {["lead.name", "lead.email", "lead.phone", "lead.source", "lead.score", "lead.agentId"].map((f) => (
            <span key={f} className="text-[10px] font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded border border-border/50">{f}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ========== Chat Started Trigger ========== */
export function TriggerChatConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const agentFilter = (config.agentFilter as string) || "all";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
        <MessageSquare className="h-4 w-4 text-amber-400" />
        <p className="text-xs text-foreground">Fires when an embed widget chat session starts</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Agent Filter</label>
        <select
          value={agentFilter}
          onChange={(e) => onChange({ ...config, agentFilter: e.target.value })}
          className="w-full bg-muted border border-border rounded-lg text-sm text-foreground px-3 py-2 outline-none focus:border-orange-500/60"
        >
          <option value="all">Any agent</option>
        </select>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/50 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Available Fields</p>
        <div className="flex flex-wrap gap-1">
          {["chat.agentId", "chat.visitorId", "chat.url", "chat.timestamp"].map((f) => (
            <span key={f} className="text-[10px] font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded border border-border/50">{f}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ========== Manual Trigger ========== */
export function TriggerManualConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
        <Play className="h-4 w-4 text-amber-400" />
        <p className="text-xs text-foreground">Run this workflow manually from the dashboard</p>
      </div>

      <ExpressionInput
        label="Default Input"
        value={(config.defaultInput as string) || ""}
        onChange={(v) => onChange({ ...config, defaultInput: v })}
        placeholder='{"task": "process new leads"}'
        multiline
        hint="Default JSON input shown when manually running the workflow"
      />
    </div>
  );
}
