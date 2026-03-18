"use client";

import { ShieldCheck, Pause, Layers, Merge, Copy, Check, Globe } from "lucide-react";
import { ExpressionInput } from "../expression-input";
import { cn } from "@/lib/utils";
import { useState } from "react";

/* ========== Approval Gate ========== */
export function ApprovalGateConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const approverEmail = (config.approverEmail as string) || "";
  const approvalMessage = (config.approvalMessage as string) || "";
  const timeoutMinutes = (config.timeoutMinutes as number) || 60;
  const timeoutAction = (config.timeoutAction as string) || "auto_reject";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
        <ShieldCheck className="h-4 w-4 text-cyan-400" />
        <p className="text-xs text-zinc-300">Pause execution until a human approves</p>
      </div>

      <ExpressionInput
        label="Approver Email"
        value={approverEmail}
        onChange={(v) => onChange({ ...config, approverEmail: v })}
        placeholder="approver@company.com"
        hint="Email of the person who should approve. Supports {{ expressions }}"
      />

      <ExpressionInput
        label="Approval Message"
        value={approvalMessage}
        onChange={(v) => onChange({ ...config, approvalMessage: v })}
        placeholder="Please review this lead: {{ lead.name }}"
        multiline
        hint="Message shown to the approver"
      />

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400">Timeout (minutes)</label>
        <input
          type="number"
          min={1}
          value={timeoutMinutes}
          onChange={(e) => onChange({ ...config, timeoutMinutes: Math.max(1, parseInt(e.target.value) || 60) })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400">On Timeout</label>
        <select
          value={timeoutAction}
          onChange={(e) => onChange({ ...config, timeoutAction: e.target.value })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60"
        >
          <option value="auto_approve">Auto-approve</option>
          <option value="auto_reject">Auto-reject</option>
          <option value="skip">Skip step</option>
        </select>
      </div>
    </div>
  );
}

/* ========== Wait for Webhook ========== */
export function WaitWebhookConfig({
  config,
  onChange,
  teamId,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  teamId: string;
}) {
  const timeoutMinutes = (config.timeoutMinutes as number) || 1440;
  const callbackToken = (config.callbackToken as string) || "";
  const callbackUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/workflows/callback?teamId=${teamId}&token=${callbackToken || "TOKEN"}`;
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
        <Pause className="h-4 w-4 text-cyan-400" />
        <p className="text-xs text-zinc-300">Pause until an external system sends a webhook</p>
      </div>

      {/* Callback URL */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400">Callback URL</label>
        <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2">
          <Globe className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
          <code className="flex-1 text-[11px] text-zinc-300 truncate font-mono">{callbackUrl}</code>
          <button
            onClick={() => { navigator.clipboard.writeText(callbackUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
        <p className="text-[10px] text-zinc-600">External systems should POST to this URL to resume the workflow</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400">Timeout (minutes)</label>
        <input
          type="number"
          min={1}
          value={timeoutMinutes}
          onChange={(e) => onChange({ ...config, timeoutMinutes: Math.max(1, parseInt(e.target.value) || 1440) })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60"
        />
        <p className="text-[10px] text-zinc-600">Max: 1440 min (24h). Execution fails if not resumed in time.</p>
      </div>
    </div>
  );
}

/* ========== Sub-Workflow ========== */
export function SubWorkflowConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const workflowId = (config.workflowId as string) || "";
  const mode = (config.mode as string) || "sync";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
        <Layers className="h-4 w-4 text-cyan-400" />
        <p className="text-xs text-zinc-300">Run another workflow as a step in this one</p>
      </div>

      <ExpressionInput
        label="Workflow ID"
        value={workflowId}
        onChange={(v) => onChange({ ...config, workflowId: v })}
        placeholder="Select or paste workflow ID"
        hint="The target workflow to execute"
      />

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400">Execution Mode</label>
        <div className="flex gap-2">
          {(["sync", "async"] as const).map((m) => (
            <button
              key={m}
              onClick={() => onChange({ ...config, mode: m })}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                mode === m
                  ? "border-orange-500/40 bg-orange-500/10 text-orange-400"
                  : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600"
              )}
            >
              <span className="block font-semibold">{m === "sync" ? "Synchronous" : "Asynchronous"}</span>
              <span className="block text-[10px] mt-0.5 text-zinc-500">
                {m === "sync" ? "Wait for result" : "Fire and forget"}
              </span>
            </button>
          ))}
        </div>
      </div>

      <ExpressionInput
        label="Input Data"
        value={(config.inputData as string) || ""}
        onChange={(v) => onChange({ ...config, inputData: v })}
        placeholder='{{ steps.previous.output }}'
        multiline
        hint="Data to pass to the sub-workflow"
      />
    </div>
  );
}

/* ========== Merge ========== */
export function MergeConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const strategy = (config.strategy as string) || "wait_all";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
        <Merge className="h-4 w-4 text-cyan-400" />
        <p className="text-xs text-zinc-300">Wait for multiple parallel branches to complete</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400">Merge Strategy</label>
        <select
          value={strategy}
          onChange={(e) => onChange({ ...config, strategy: e.target.value })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60"
        >
          <option value="wait_all">Wait for all branches</option>
          <option value="wait_any">Continue on first completion</option>
          <option value="wait_majority">Wait for majority</option>
        </select>
      </div>

      <div className="rounded-lg border border-zinc-700/60 bg-zinc-800/50 p-3">
        <p className="text-[10px] text-zinc-500">
          {strategy === "wait_all" && "All incoming branches must complete before continuing."}
          {strategy === "wait_any" && "Continues as soon as any branch completes. Other branches are cancelled."}
          {strategy === "wait_majority" && "Continues when more than half of branches complete."}
        </p>
      </div>
    </div>
  );
}
