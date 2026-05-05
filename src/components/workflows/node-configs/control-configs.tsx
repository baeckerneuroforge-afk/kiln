"use client";

import { ShieldCheck, Pause, Layers, Merge, Copy, Check, Globe, ExternalLink, FileText, Plus, Trash2 } from "lucide-react";
import { ExpressionInput, KeyValueEditor } from "../expression-input";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

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
        <p className="text-xs text-foreground">Pause execution until a human approves</p>
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
        <label className="text-xs font-medium text-muted-foreground">Timeout (minutes)</label>
        <input
          type="number"
          min={1}
          value={timeoutMinutes}
          onChange={(e) => onChange({ ...config, timeoutMinutes: Math.max(1, parseInt(e.target.value) || 60) })}
          className="w-full bg-muted border border-border rounded-lg text-sm text-foreground px-3 py-2 outline-none focus:border-orange-500/60"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">On Timeout</label>
        <select
          value={timeoutAction}
          onChange={(e) => onChange({ ...config, timeoutAction: e.target.value })}
          className="w-full bg-muted border border-border rounded-lg text-sm text-foreground px-3 py-2 outline-none focus:border-orange-500/60"
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
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  teamId?: string;
}) {
  const timeoutMinutes = (config.timeoutMinutes as number) || 1440;
  const timeoutAction = (config.timeoutAction as string) || "fail";
  const expectedSchema = (config.expectedSchema as string) || "";
  const [copied, setCopied] = useState(false);

  const callbackUrlTemplate = `${typeof window !== "undefined" ? window.location.origin : "https://kilnbase.com"}/api/workflows/callback/{executionId}/{nodeId}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
        <Pause className="h-4 w-4 text-cyan-400" />
        <p className="text-xs text-foreground">Pause until an external system sends a webhook</p>
      </div>

      {/* Callback URL template */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Callback URL</label>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
          <Globe className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
          <code className="flex-1 text-[10px] text-foreground font-mono break-all">{callbackUrlTemplate}</code>
          <button
            onClick={() => { navigator.clipboard.writeText(callbackUrlTemplate); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          The actual URL with executionId and nodeId will be available at runtime.
          External systems should POST JSON to this URL to resume the workflow.
        </p>
      </div>

      {/* Expected payload */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Expected Payload (optional)</label>
        <textarea
          value={expectedSchema}
          onChange={(e) => onChange({ ...config, expectedSchema: e.target.value })}
          placeholder={'{\n  "status": "approved",\n  "comment": "Looks good"\n}'}
          rows={4}
          className="w-full bg-muted border border-border rounded-lg text-[11px] font-mono text-foreground px-3 py-2 outline-none focus:border-orange-500/60 placeholder:text-muted-foreground resize-none"
        />
        <p className="text-[10px] text-muted-foreground">Document the expected JSON payload for reference</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Timeout (minutes)</label>
        <input
          type="number"
          min={1}
          value={timeoutMinutes}
          onChange={(e) => onChange({ ...config, timeoutMinutes: Math.max(1, parseInt(e.target.value) || 1440) })}
          className="w-full bg-muted border border-border rounded-lg text-sm text-foreground px-3 py-2 outline-none focus:border-orange-500/60"
        />
        <p className="text-[10px] text-muted-foreground">Default: 1440 min (24h). Max: 10080 min (7 days).</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">On Timeout</label>
        <select
          value={timeoutAction}
          onChange={(e) => onChange({ ...config, timeoutAction: e.target.value })}
          className="w-full bg-muted border border-border rounded-lg text-sm text-foreground px-3 py-2 outline-none focus:border-orange-500/60"
        >
          <option value="fail">Fail workflow</option>
          <option value="skip">Skip and continue</option>
        </select>
      </div>
    </div>
  );
}

/* ========== Wait for Form ========== */

interface FormFieldDef {
  name: string;
  type: "text" | "email" | "number" | "textarea" | "select" | "checkbox";
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export function WaitFormConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const formTitle = (config.formTitle as string) || "";
  const formDescription = (config.formDescription as string) || "";
  const fields = (config.fields as FormFieldDef[]) || [];
  const timeoutMinutes = (config.timeoutMinutes as number) || 10080;
  const timeoutAction = (config.timeoutAction as string) || "fail";

  const updateField = (index: number, patch: Partial<FormFieldDef>) => {
    const updated = [...fields];
    updated[index] = { ...updated[index], ...patch };
    onChange({ ...config, fields: updated });
  };

  const addField = () => {
    onChange({
      ...config,
      fields: [...fields, { name: "", type: "text", label: "", required: false }],
    });
  };

  const removeField = (index: number) => {
    onChange({ ...config, fields: fields.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
        <FileText className="h-4 w-4 text-cyan-400" />
        <p className="text-xs text-foreground">Create a form that pauses the workflow until submitted</p>
      </div>

      <ExpressionInput
        label="Form Title"
        value={formTitle}
        onChange={(v) => onChange({ ...config, formTitle: v })}
        placeholder="Customer Feedback"
        hint="Title shown at the top of the form"
      />

      <ExpressionInput
        label="Form Description"
        value={formDescription}
        onChange={(v) => onChange({ ...config, formDescription: v })}
        placeholder="Please fill out the following information..."
        multiline
        hint="Optional description shown below the title"
      />

      {/* Form Fields */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Form Fields</label>

        {fields.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 py-4 text-center">
            <p className="text-xs text-muted-foreground">No fields yet. Add fields to build your form.</p>
          </div>
        )}

        {fields.map((field, i) => (
          <div key={i} className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Field {i + 1}</span>
              <button
                onClick={() => removeField(i)}
                className="text-muted-foreground hover:text-red-400 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <input
                  value={field.name}
                  onChange={(e) => updateField(i, { name: e.target.value })}
                  placeholder="field_name"
                  className="w-full bg-muted border border-border rounded-lg text-[11px] font-mono text-foreground px-2 py-1.5 outline-none focus:border-orange-500/60 placeholder:text-muted-foreground"
                />
              </div>
              <div>
                <input
                  value={field.label}
                  onChange={(e) => updateField(i, { label: e.target.value })}
                  placeholder="Display Label"
                  className="w-full bg-muted border border-border rounded-lg text-[11px] text-foreground px-2 py-1.5 outline-none focus:border-orange-500/60 placeholder:text-muted-foreground"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={field.type}
                onChange={(e) => updateField(i, { type: e.target.value as FormFieldDef["type"] })}
                className="flex-1 bg-muted border border-border rounded-lg text-[11px] text-foreground px-2 py-1.5 outline-none focus:border-orange-500/60"
              >
                <option value="text">Text</option>
                <option value="email">Email</option>
                <option value="number">Number</option>
                <option value="textarea">Text Area</option>
                <option value="select">Select / Dropdown</option>
                <option value="checkbox">Checkbox</option>
              </select>

              <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => updateField(i, { required: e.target.checked })}
                  className="h-3 w-3 rounded border-border bg-muted"
                />
                Required
              </label>
            </div>

            <input
              value={field.placeholder || ""}
              onChange={(e) => updateField(i, { placeholder: e.target.value })}
              placeholder="Placeholder text (optional)"
              className="w-full bg-muted border border-border rounded-lg text-[11px] text-foreground px-2 py-1.5 outline-none focus:border-orange-500/60 placeholder:text-muted-foreground"
            />

            {field.type === "select" && (
              <input
                value={(field.options || []).join(", ")}
                onChange={(e) => updateField(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                placeholder="Option 1, Option 2, Option 3"
                className="w-full bg-muted border border-border rounded-lg text-[11px] text-foreground px-2 py-1.5 outline-none focus:border-orange-500/60 placeholder:text-muted-foreground"
              />
            )}
          </div>
        ))}

        <button
          onClick={addField}
          className="inline-flex items-center gap-1.5 text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add Field
        </button>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Timeout (minutes)</label>
        <input
          type="number"
          min={1}
          value={timeoutMinutes}
          onChange={(e) => onChange({ ...config, timeoutMinutes: Math.max(1, parseInt(e.target.value) || 10080) })}
          className="w-full bg-muted border border-border rounded-lg text-sm text-foreground px-3 py-2 outline-none focus:border-orange-500/60"
        />
        <p className="text-[10px] text-muted-foreground">Default: 10080 min (7 days)</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">On Timeout</label>
        <select
          value={timeoutAction}
          onChange={(e) => onChange({ ...config, timeoutAction: e.target.value })}
          className="w-full bg-muted border border-border rounded-lg text-sm text-foreground px-3 py-2 outline-none focus:border-orange-500/60"
        >
          <option value="fail">Fail workflow</option>
          <option value="skip">Skip and continue</option>
          <option value="default">Use default values</option>
        </select>
      </div>

      <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
        <p className="text-[10px] text-muted-foreground">
          A unique form URL will be generated when the workflow reaches this node.
          The form can be shared with external users who don&apos;t need a KILN account.
        </p>
      </div>
    </div>
  );
}

/* ========== Sub-Workflow ========== */
interface WorkflowOption {
  id: string;
  name: string;
  teamName: string;
}

export function SubWorkflowConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  teamId?: string;
}) {
  const workflowId = (config.workflowId as string) || "";
  const mode = (config.mode as string) || "sync";
  const timeoutMinutes = (config.timeoutMinutes as number) || 5;
  const inputMapping = (config.inputMapping as { key: string; value: string }[]) || [];
  const outputMapping = (config.outputMapping as { key: string; value: string }[]) || [];

  const [workflows, setWorkflows] = useState<WorkflowOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchWorkflows() {
      try {
        const res = await fetch("/api/teams");
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        const options: WorkflowOption[] = [];
        for (const team of data.teams || []) {
          for (const wf of team.workflows || []) {
            options.push({
              id: wf.id,
              name: wf.name || "Unnamed Workflow",
              teamName: team.name || "Unknown Team",
            });
          }
        }
        setWorkflows(options);
      } catch {
        // Silently fail — user can still paste ID manually
      } finally {
        setLoading(false);
      }
    }
    fetchWorkflows();
  }, []);

  const selectedWorkflow = workflows.find((w) => w.id === workflowId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
        <Layers className="h-4 w-4 text-cyan-400" />
        <p className="text-xs text-foreground">Run another workflow as a step in this one</p>
      </div>

      {/* Workflow Selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Target Workflow</label>
        <select
          value={workflowId}
          onChange={(e) => onChange({ ...config, workflowId: e.target.value })}
          className="w-full bg-muted border border-border rounded-lg text-sm text-foreground px-3 py-2 outline-none focus:border-orange-500/60"
        >
          <option value="">{loading ? "Loading workflows..." : "Select a workflow"}</option>
          {workflows.map((wf) => (
            <option key={wf.id} value={wf.id}>
              {wf.teamName} — {wf.name}
            </option>
          ))}
        </select>
        {workflowId && !selectedWorkflow && !loading && (
          <p className="text-[10px] text-muted-foreground">
            Using workflow ID: <code className="text-muted-foreground font-mono">{workflowId}</code>
          </p>
        )}
      </div>

      {/* Open Sub-Workflow button */}
      {workflowId && (
        <a
          href={`/dashboard/teams/${workflowId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Open Sub-Workflow
        </a>
      )}

      {/* Execution Mode */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Execution Mode</label>
        <div className="flex gap-2">
          {(["sync", "async"] as const).map((m) => (
            <button
              key={m}
              onClick={() => onChange({ ...config, mode: m })}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                mode === m
                  ? "border-orange-500/40 bg-orange-500/10 text-orange-400"
                  : "border-border bg-muted text-muted-foreground hover:border-foreground/20"
              )}
            >
              <span className="block font-semibold">{m === "sync" ? "Synchronous" : "Asynchronous"}</span>
              <span className="block text-[10px] mt-0.5 text-muted-foreground">
                {m === "sync" ? "Wait for result" : "Fire and forget"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Timeout (sync only) */}
      {mode === "sync" && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Timeout (minutes)</label>
          <input
            type="number"
            min={1}
            value={timeoutMinutes}
            onChange={(e) => onChange({ ...config, timeoutMinutes: Math.max(1, parseInt(e.target.value) || 5) })}
            className="w-full bg-muted border border-border rounded-lg text-sm text-foreground px-3 py-2 outline-none focus:border-orange-500/60"
          />
          <p className="text-[10px] text-muted-foreground">Execution fails if the sub-workflow does not complete in time.</p>
        </div>
      )}

      {/* Input Mapping */}
      <KeyValueEditor
        label="Input Mapping"
        pairs={inputMapping}
        onChange={(pairs) => onChange({ ...config, inputMapping: pairs })}
        keyPlaceholder="Sub-workflow field"
        valuePlaceholder="{{ source.field }}"
      />

      {/* Output Mapping */}
      <KeyValueEditor
        label="Output Mapping"
        pairs={outputMapping}
        onChange={(pairs) => onChange({ ...config, outputMapping: pairs })}
        keyPlaceholder="Context field"
        valuePlaceholder="sub_workflow.result.field"
      />

      {/* Max depth info */}
      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/50 px-3 py-2">
        <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <p className="text-[10px] text-muted-foreground">Sub-workflows can be nested up to 5 levels deep</p>
      </div>
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
        <p className="text-xs text-foreground">Wait for multiple parallel branches to complete</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Merge Strategy</label>
        <select
          value={strategy}
          onChange={(e) => onChange({ ...config, strategy: e.target.value })}
          className="w-full bg-muted border border-border rounded-lg text-sm text-foreground px-3 py-2 outline-none focus:border-orange-500/60"
        >
          <option value="wait_all">Wait for all branches</option>
          <option value="wait_any">Continue on first completion</option>
          <option value="wait_majority">Wait for majority</option>
        </select>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/50 p-3">
        <p className="text-[10px] text-muted-foreground">
          {strategy === "wait_all" && "All incoming branches must complete before continuing."}
          {strategy === "wait_any" && "Continues as soon as any branch completes. Other branches are cancelled."}
          {strategy === "wait_majority" && "Continues when more than half of branches complete."}
        </p>
      </div>
    </div>
  );
}
