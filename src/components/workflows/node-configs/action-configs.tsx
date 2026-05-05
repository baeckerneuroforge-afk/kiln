"use client";

import { useState, useCallback } from "react";
import { Globe, Mail, Hash, Timer, Variable, Send, Trash2 } from "lucide-react";
import { ExpressionInput, KeyValueEditor } from "../expression-input";
import { cn } from "@/lib/utils";

/* ========== HTTP Request ========== */
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export function HttpRequestConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const method = (config.method as string) || "GET";
  const url = (config.url as string) || "";
  const headers = (config.headers as { key: string; value: string }[]) || [];
  const body = (config.body as string) || "";
  const authType = (config.authType as string) || "none";
  const responseFields = (config.responseFields as string[]) || [];

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const testRequest = useCallback(async () => {
    if (!url) return;
    setTesting(true);
    setTestResult(null);
    const currentHeaders = (config.headers as { key: string; value: string }[]) || [];
    const currentBody = (config.body as string) || "";
    try {
      const res = await fetch("/api/workflows/test-http", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, url, headers: Object.fromEntries(currentHeaders.map(h => [h.key, h.value])), body: currentBody }),
      });
      const data = await res.json();
      setTestResult(res.ok ? `✓ ${data.status || 200}` : `✗ ${data.error || "Failed"}`);
    } catch {
      setTestResult("✗ Failed");
    } finally {
      setTesting(false);
    }
  }, [method, url, config.headers, config.body]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
        <Globe className="h-4 w-4 text-blue-400" />
        <p className="text-xs text-foreground">Make an HTTP request to any URL</p>
      </div>

      {/* Method + URL */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Request</label>
        <div className="flex gap-1.5">
          <select
            value={method}
            onChange={(e) => onChange({ ...config, method: e.target.value })}
            className="w-24 bg-muted border border-border rounded-lg text-xs font-medium text-foreground px-2 py-2 outline-none focus:border-orange-500/60"
          >
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <input
            value={url}
            onChange={(e) => onChange({ ...config, url: e.target.value })}
            placeholder="https://api.example.com/endpoint"
            className="flex-1 bg-muted border border-border rounded-lg text-sm text-foreground px-3 py-2 outline-none focus:border-orange-500/60 placeholder:text-muted-foreground"
          />
        </div>
        <p className="text-[10px] text-muted-foreground">Supports {`{{ expressions }}`} in the URL</p>
      </div>

      {/* Auth */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Authentication</label>
        <select
          value={authType}
          onChange={(e) => onChange({ ...config, authType: e.target.value })}
          className="w-full bg-muted border border-border rounded-lg text-sm text-foreground px-3 py-2 outline-none focus:border-orange-500/60"
        >
          <option value="none">None</option>
          <option value="bearer">Bearer Token</option>
          <option value="basic">Basic Auth</option>
          <option value="api_key">API Key (Header)</option>
        </select>
      </div>

      {authType === "bearer" && (
        <ExpressionInput
          label="Bearer Token"
          value={(config.bearerToken as string) || ""}
          onChange={(v) => onChange({ ...config, bearerToken: v })}
          placeholder="your-token-here"
        />
      )}

      {authType === "basic" && (
        <div className="grid grid-cols-2 gap-2">
          <ExpressionInput
            label="Username"
            value={(config.basicUser as string) || ""}
            onChange={(v) => onChange({ ...config, basicUser: v })}
          />
          <ExpressionInput
            label="Password"
            value={(config.basicPass as string) || ""}
            onChange={(v) => onChange({ ...config, basicPass: v })}
          />
        </div>
      )}

      {authType === "api_key" && (
        <div className="grid grid-cols-2 gap-2">
          <ExpressionInput
            label="Header Name"
            value={(config.apiKeyHeader as string) || "X-API-Key"}
            onChange={(v) => onChange({ ...config, apiKeyHeader: v })}
          />
          <ExpressionInput
            label="API Key"
            value={(config.apiKeyValue as string) || ""}
            onChange={(v) => onChange({ ...config, apiKeyValue: v })}
          />
        </div>
      )}

      {/* Headers */}
      <KeyValueEditor
        label="Headers"
        pairs={headers}
        onChange={(p) => onChange({ ...config, headers: p })}
        keyPlaceholder="Header name"
        valuePlaceholder="Value"
      />

      {/* Body */}
      {method !== "GET" && (
        <ExpressionInput
          label="Request Body"
          value={body}
          onChange={(v) => onChange({ ...config, body: v })}
          placeholder='{"key": "{{ value }}"}'
          multiline
          hint="JSON body with {{ expression }} support"
        />
      )}

      {/* Response field extraction */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Extract Response Fields</label>
        <div className="flex flex-wrap gap-1.5">
          {responseFields.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[10px] font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded border border-border/50">
              {f}
              <button onClick={() => onChange({ ...config, responseFields: responseFields.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-red-400">×</button>
            </span>
          ))}
        </div>
        <input
          placeholder="Add field path (e.g. data.id)"
          className="w-full bg-muted border border-border rounded-lg text-[11px] font-mono text-foreground px-2.5 py-1.5 outline-none focus:border-orange-500/60 placeholder:text-muted-foreground"
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.currentTarget.value.trim()) {
              onChange({ ...config, responseFields: [...responseFields, e.currentTarget.value.trim()] });
              e.currentTarget.value = "";
            }
          }}
        />
      </div>

      {/* Test */}
      <div className="flex items-center gap-2">
        <button
          onClick={testRequest}
          disabled={testing || !url}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Send className="h-3 w-3" />
          {testing ? "Testing..." : "Test Request"}
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

/* ========== Send Email ========== */
export function SendEmailConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
        <Mail className="h-4 w-4 text-blue-400" />
        <p className="text-xs text-foreground">Send an email via Resend</p>
      </div>

      <ExpressionInput
        label="To"
        value={(config.to as string) || ""}
        onChange={(v) => onChange({ ...config, to: v })}
        placeholder="{{ lead.email }}"
        hint="Email address or {{ expression }}"
      />

      <ExpressionInput
        label="Subject"
        value={(config.subject as string) || ""}
        onChange={(v) => onChange({ ...config, subject: v })}
        placeholder="Follow-up: {{ lead.name }}"
      />

      <ExpressionInput
        label="Body"
        value={(config.body as string) || ""}
        onChange={(v) => onChange({ ...config, body: v })}
        placeholder="Hi {{ lead.name }},&#10;&#10;Thank you for your interest..."
        multiline
        hint="Supports {{ expressions }} and basic HTML"
      />

      <ExpressionInput
        label="From Name (optional)"
        value={(config.fromName as string) || ""}
        onChange={(v) => onChange({ ...config, fromName: v })}
        placeholder="Defaults to configured sender"
      />

      <div className="rounded-lg border border-border/60 bg-muted/50 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Output Fields</p>
        <div className="flex flex-wrap gap-1">
          {["email.success", "email.messageId"].map((f) => (
            <span key={f} className="text-[10px] font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded border border-border/50">{f}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ========== Send Slack Message ========== */
export function SendSlackConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const mode = (config.mode as string) || "webhook";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
        <Hash className="h-4 w-4 text-blue-400" />
        <p className="text-xs text-foreground">Post a message to a Slack channel</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Connection Mode</label>
        <div className="flex gap-1.5">
          {(["webhook", "integration"] as const).map((m) => (
            <button
              key={m}
              onClick={() => onChange({ ...config, mode: m })}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                mode === m
                  ? "border-orange-500/40 bg-orange-500/10 text-orange-400"
                  : "border-border bg-muted text-muted-foreground hover:border-foreground/20"
              )}
            >
              {m === "webhook" ? "Webhook URL" : "Slack Integration"}
            </button>
          ))}
        </div>
      </div>

      {mode === "webhook" ? (
        <ExpressionInput
          label="Webhook URL"
          value={(config.webhookUrl as string) || ""}
          onChange={(v) => onChange({ ...config, webhookUrl: v })}
          placeholder="https://hooks.slack.com/services/..."
          hint="Create an Incoming Webhook in your Slack workspace"
        />
      ) : (
        <ExpressionInput
          label="Channel"
          value={(config.channel as string) || ""}
          onChange={(v) => onChange({ ...config, channel: v })}
          placeholder="#general"
          hint="Requires Slack integration to be connected"
        />
      )}

      <ExpressionInput
        label="Message"
        value={(config.message as string) || ""}
        onChange={(v) => onChange({ ...config, message: v })}
        placeholder="New lead from {{ lead.name }}: {{ lead.email }}"
        multiline
        hint="Supports {{ expressions }} and Slack markdown"
      />

      <div className="flex items-center gap-2">
        <button
          disabled
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Send className="h-3 w-3" />
          Test Message
        </button>
      </div>
    </div>
  );
}

/* ========== Delay ========== */
export function DelayConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const mode = (config.delayMode as string) || "duration";
  const duration = (config.duration as number) || 60;
  const unit = (config.unit as string) || "seconds";
  const waitUntil = (config.waitUntil as string) || "";
  const waitUntilType = (config.waitUntilType as string) || "datetime";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
        <Timer className="h-4 w-4 text-blue-400" />
        <p className="text-xs text-foreground">Pause execution for a specified duration</p>
      </div>

      {/* Mode selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Delay Mode</label>
        <div className="flex gap-2">
          {(["duration", "wait_until"] as const).map((m) => (
            <button
              key={m}
              onClick={() => onChange({ ...config, delayMode: m })}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                mode === m
                  ? "border-orange-500/40 bg-orange-500/10 text-orange-400"
                  : "border-border bg-muted text-muted-foreground hover:border-foreground/20"
              )}
            >
              {m === "duration" ? "Duration" : "Wait Until"}
            </button>
          ))}
        </div>
      </div>

      {mode === "duration" ? (
        <>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Duration</label>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={duration}
                onChange={(e) => onChange({ ...config, duration: Math.max(1, parseInt(e.target.value) || 60) })}
                className="flex-1 bg-muted border border-border rounded-lg text-sm text-foreground px-3 py-2 outline-none focus:border-orange-500/60"
              />
              <select
                value={unit}
                onChange={(e) => onChange({ ...config, unit: e.target.value })}
                className="w-28 bg-muted border border-border rounded-lg text-sm text-foreground px-3 py-2 outline-none focus:border-orange-500/60"
              >
                <option value="seconds">Seconds</option>
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
              </select>
            </div>
            <p className="text-[10px] text-muted-foreground">Max 1 hour for in-process delays. Longer delays are stored and resumed.</p>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Wait Until Type</label>
            <select
              value={waitUntilType}
              onChange={(e) => onChange({ ...config, waitUntilType: e.target.value })}
              className="w-full bg-muted border border-border rounded-lg text-sm text-foreground px-3 py-2 outline-none focus:border-orange-500/60"
            >
              <option value="datetime">Specific Date/Time</option>
              <option value="expression">Expression</option>
            </select>
          </div>

          {waitUntilType === "datetime" ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Date & Time</label>
              <input
                type="datetime-local"
                value={waitUntil}
                onChange={(e) => onChange({ ...config, waitUntil: e.target.value })}
                className="w-full bg-muted border border-border rounded-lg text-sm text-foreground px-3 py-2 outline-none focus:border-orange-500/60"
              />
            </div>
          ) : (
            <ExpressionInput
              label="Wait Until Expression"
              value={waitUntil}
              onChange={(v) => onChange({ ...config, waitUntil: v })}
              placeholder="{{ next_monday_9am }}"
              hint="Expression that resolves to an ISO date string"
            />
          )}

          <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
            <p className="text-[10px] text-muted-foreground">
              Long waits are stored in the database and resumed via background job.
              The workflow will pause and resume automatically at the specified time.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/* ========== Set Variable ========== */
interface VariableEntry {
  key: string;
  value: string;
}

export function SetVariableConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const variables = (config.variables as VariableEntry[]) || [
    { key: (config.key as string) || "", value: (config.value as string) || "" },
  ];

  const updateVar = (i: number, patch: Partial<VariableEntry>) => {
    const next = [...variables];
    next[i] = { ...next[i], ...patch };
    onChange({ ...config, variables: next });
  };

  const addVar = () => onChange({ ...config, variables: [...variables, { key: "", value: "" }] });
  const removeVar = (i: number) => {
    const next = variables.filter((_, j) => j !== i);
    onChange({ ...config, variables: next.length ? next : [{ key: "", value: "" }] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
        <Variable className="h-4 w-4 text-blue-400" />
        <p className="text-xs text-foreground">Store values in the execution context</p>
      </div>

      <div className="space-y-2">
        {variables.map((v, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <input
              value={v.key}
              onChange={(e) => updateVar(i, { key: e.target.value })}
              placeholder="variable_name"
              className="w-[35%] bg-muted border border-border rounded-lg text-[11px] font-mono text-foreground px-2.5 py-2 outline-none focus:border-orange-500/60 placeholder:text-muted-foreground"
            />
            <span className="text-muted-foreground py-2">=</span>
            <input
              value={v.value}
              onChange={(e) => updateVar(i, { value: e.target.value })}
              placeholder="{{ expression }}"
              className="flex-1 bg-muted border border-border rounded-lg text-[11px] font-mono text-foreground px-2.5 py-2 outline-none focus:border-orange-500/60 placeholder:text-muted-foreground"
            />
            {variables.length > 1 && (
              <button onClick={() => removeVar(i)} className="text-muted-foreground hover:text-red-400 transition-colors py-2">
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      <button onClick={addVar} className="text-[10px] text-orange-400 hover:text-orange-300 transition-colors">
        + Add variable
      </button>
    </div>
  );
}

/* ========== A2A Call ========== */

export function A2ACallConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const targetUrl = (config.targetUrl as string) || "";
  const messageTemplate = (config.messageTemplate as string) || "";
  const timeout = (config.timeout as number) || 30000;
  const apiKey = (config.apiKey as string) || "";
  const resultKey = (config.resultKey as string) || "a2aResponse";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Target Agent URL</label>
        <ExpressionInput
          value={targetUrl}
          onChange={(v) => onChange({ ...config, targetUrl: v })}
          placeholder="https://example.com/api/a2a/agents/.../message"
        />
        <p className="text-[10px] text-muted-foreground">A2A message endpoint of the target agent</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Message Template</label>
        <textarea
          value={messageTemplate}
          onChange={(e) => onChange({ ...config, messageTemplate: e.target.value })}
          placeholder="Analyse den folgenden Lead: {{ lead.email }}..."
          rows={4}
          className="w-full bg-muted border border-border rounded-lg text-[11px] font-mono text-foreground px-3 py-2.5 outline-none focus:border-orange-500/60 placeholder:text-muted-foreground resize-none"
        />
        <p className="text-[10px] text-muted-foreground">Supports {"{{ }}"} expressions for dynamic content</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">API Key (optional)</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => onChange({ ...config, apiKey: e.target.value })}
          placeholder="Bearer token for authentication"
          className="w-full bg-muted border border-border rounded-lg text-[11px] font-mono text-foreground px-3 py-2.5 outline-none focus:border-orange-500/60 placeholder:text-muted-foreground"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Timeout (ms)</label>
          <input
            type="number"
            value={timeout}
            onChange={(e) => onChange({ ...config, timeout: Number(e.target.value) || 30000 })}
            className="w-full bg-muted border border-border rounded-lg text-[11px] font-mono text-foreground px-3 py-2.5 outline-none focus:border-orange-500/60"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Result Key</label>
          <input
            value={resultKey}
            onChange={(e) => onChange({ ...config, resultKey: e.target.value || "a2aResponse" })}
            className="w-full bg-muted border border-border rounded-lg text-[11px] font-mono text-foreground px-3 py-2.5 outline-none focus:border-orange-500/60"
          />
        </div>
      </div>
    </div>
  );
}
