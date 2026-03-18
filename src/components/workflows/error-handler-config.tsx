"use client";

import { AlertTriangle, Mail, Globe, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface ErrorHandlerConfig {
  onUnhandledError: "stop" | "email" | "webhook";
  errorEmail?: string;
  errorWebhookUrl?: string;
}

interface ErrorHandlerConfigPanelProps {
  config: ErrorHandlerConfig;
  onChange: (config: ErrorHandlerConfig) => void;
}

export function ErrorHandlerConfigPanel({
  config,
  onChange,
}: ErrorHandlerConfigPanelProps) {
  const { onUnhandledError, errorEmail, errorWebhookUrl } = config;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-400" />
        <h4 className="text-sm font-semibold text-zinc-200">Error Handling</h4>
      </div>

      <p className="text-xs text-zinc-500">
        Configure what happens when a node fails and has no error output path connected.
      </p>

      <div className="space-y-2">
        <label className="text-xs font-medium text-zinc-400">On Unhandled Error</label>
        <div className="grid grid-cols-3 gap-2">
          {([
            { key: "stop", label: "Stop Workflow", icon: Square, desc: "Mark as failed" },
            { key: "email", label: "Send Email", icon: Mail, desc: "Alert via email" },
            { key: "webhook", label: "Call Webhook", icon: Globe, desc: "POST to URL" },
          ] as const).map(({ key, label, icon: Icon, desc }) => (
            <button
              key={key}
              onClick={() => onChange({ ...config, onUnhandledError: key })}
              className={cn(
                "rounded-lg border p-2.5 text-left transition-all",
                onUnhandledError === key
                  ? "border-orange-500/40 bg-orange-500/10"
                  : "border-zinc-700 bg-zinc-800 hover:border-zinc-600"
              )}
            >
              <Icon className={cn(
                "h-4 w-4 mb-1",
                onUnhandledError === key ? "text-orange-400" : "text-zinc-500"
              )} />
              <p className={cn(
                "text-xs font-medium",
                onUnhandledError === key ? "text-orange-400" : "text-zinc-300"
              )}>{label}</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      {onUnhandledError === "email" && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-400">Error Notification Email</label>
          <input
            type="email"
            value={errorEmail || ""}
            onChange={(e) => onChange({ ...config, errorEmail: e.target.value })}
            placeholder="ops@company.com"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 placeholder:text-zinc-600"
          />
          <p className="text-[10px] text-zinc-600">
            Receives error details including node ID, error message, and execution context.
          </p>
        </div>
      )}

      {onUnhandledError === "webhook" && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-400">Error Webhook URL</label>
          <input
            type="url"
            value={errorWebhookUrl || ""}
            onChange={(e) => onChange({ ...config, errorWebhookUrl: e.target.value })}
            placeholder="https://hooks.slack.com/services/..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 placeholder:text-zinc-600"
          />
          <p className="text-[10px] text-zinc-600">
            Receives a POST with JSON body: {"{"} executionId, nodeId, nodeType, error, context {"}"}
          </p>
        </div>
      )}
    </div>
  );
}

export type { ErrorHandlerConfig };
