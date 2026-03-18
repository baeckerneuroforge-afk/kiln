"use client";

import { useState, useMemo } from "react";
import { X, ArrowRight, Code2, Link2, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { type WorkflowNodeType, getNodeDefinition } from "@/lib/workflow-node-types";

/* ========== Field definitions per node type ========== */

/** Known output fields for each node type */
const OUTPUT_FIELDS: Partial<Record<WorkflowNodeType, string[]>> = {
  agent: ["output", "summary", "structuredData", "tokensUsed", "cost"],
  trigger_webhook: ["body", "headers", "method", "url", "timestamp"],
  trigger_schedule: ["input", "scheduledAt", "timezone"],
  trigger_lead: ["lead.name", "lead.email", "lead.phone", "lead.source", "lead.score", "lead.agentId"],
  trigger_chat: ["chat.agentId", "chat.visitorId", "chat.url", "chat.timestamp"],
  trigger_manual: ["input"],
  if_condition: ["result", "matched"],
  switch: ["result", "matchedCase"],
  filter: ["data"],
  http_request: ["statusCode", "body", "headers", "duration"],
  send_email: ["success", "messageId"],
  send_slack: ["success", "timestamp"],
  delay: ["resumedAt"],
  set_variable: ["variables"],
  approval_gate: ["approved", "approverEmail", "approvedAt"],
  wait_form: ["form", "submittedAt", "formTitle"],
  wait_webhook: ["webhook", "receivedAt", "payload"],
  sub_workflow: ["result", "status", "executionId"],
  merge: ["branches", "completedCount"],
};

/** Known input fields (based on config shape) */
const INPUT_FIELDS: Partial<Record<WorkflowNodeType, string[]>> = {
  agent: ["goal", "context", "input"],
  if_condition: ["data"],
  switch: ["data"],
  filter: ["data"],
  http_request: ["url", "body", "headers"],
  send_email: ["to", "subject", "body"],
  send_slack: ["channel", "message"],
  delay: ["duration"],
  set_variable: ["key", "value"],
  approval_gate: ["message", "approverEmail"],
  sub_workflow: ["input", "workflowId"],
  merge: ["data"],
};

export interface FieldMapping {
  source: string;  // e.g. "output.score"
  target: string;  // e.g. "input.leadScore"
  expression?: string; // optional expression override
}

interface DataMapperProps {
  /** The edge being configured */
  edgeId: string | null;
  sourceNodeId: string;
  targetNodeId: string;
  sourceNodeType: WorkflowNodeType;
  targetNodeType: WorkflowNodeType;
  sourceLabel: string;
  targetLabel: string;
  /** Current field mappings on this edge */
  mappings: FieldMapping[];
  /** Custom output fields from source's outputSchema */
  sourceSchemaFields?: string[];
  onSave: (edgeId: string, mappings: FieldMapping[]) => void;
  onClose: () => void;
}

export function DataMapper({
  edgeId,
  sourceNodeType,
  targetNodeType,
  sourceLabel,
  targetLabel,
  mappings: initialMappings,
  sourceSchemaFields,
  onSave,
  onClose,
}: DataMapperProps) {
  const [mappings, setMappings] = useState<FieldMapping[]>(initialMappings);
  const [expressionMode, setExpressionMode] = useState<Set<number>>(new Set());
  const isOpen = !!edgeId;

  const sourceFields = useMemo(() => {
    const base = OUTPUT_FIELDS[sourceNodeType] || ["output"];
    if (sourceSchemaFields?.length) {
      return [...base, ...sourceSchemaFields.map((f) => `structuredData.${f}`)];
    }
    return base;
  }, [sourceNodeType, sourceSchemaFields]);

  const targetFields = useMemo(() => {
    return INPUT_FIELDS[targetNodeType] || ["input"];
  }, [targetNodeType]);

  const sourceDef = getNodeDefinition(sourceNodeType);
  const targetDef = getNodeDefinition(targetNodeType);

  const addMapping = () => {
    setMappings([...mappings, { source: sourceFields[0] || "", target: targetFields[0] || "" }]);
  };

  const updateMapping = (i: number, patch: Partial<FieldMapping>) => {
    const next = [...mappings];
    next[i] = { ...next[i], ...patch };
    setMappings(next);
  };

  const removeMapping = (i: number) => {
    setMappings(mappings.filter((_, j) => j !== i));
    setExpressionMode((prev) => {
      const next = new Set(prev);
      next.delete(i);
      return next;
    });
  };

  const toggleExpressionMode = (i: number) => {
    setExpressionMode((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const handleSave = () => {
    if (!edgeId) return;
    // Filter out empty mappings
    const clean = mappings.filter((m) => (m.source && m.target) || m.expression);
    onSave(edgeId, clean);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-20 bg-black/40 transition-opacity duration-200",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-[480px] z-30 bg-zinc-900 border-l border-border shadow-2xl transform transition-transform duration-200 flex flex-col",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-orange-400" />
            <h3 className="text-sm font-semibold text-zinc-100">Data Mapping</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Source → Target header */}
        <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center gap-3">
            <div className="flex-1 rounded-lg border border-zinc-700/60 bg-zinc-800/50 px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: sourceDef?.color || "#F97316" }}>
                Source
              </p>
              <p className="text-xs font-medium text-zinc-200 truncate">{sourceLabel}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-zinc-600 shrink-0" />
            <div className="flex-1 rounded-lg border border-zinc-700/60 bg-zinc-800/50 px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: targetDef?.color || "#F97316" }}>
                Target
              </p>
              <p className="text-xs font-medium text-zinc-200 truncate">{targetLabel}</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Available fields reference */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-zinc-700/40 bg-zinc-800/30 p-2.5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Output Fields</p>
              <div className="flex flex-wrap gap-1">
                {sourceFields.map((f) => (
                  <span key={f} className="text-[9px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700/50">{f}</span>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-zinc-700/40 bg-zinc-800/30 p-2.5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Input Fields</p>
              <div className="flex flex-wrap gap-1">
                {targetFields.map((f) => (
                  <span key={f} className="text-[9px] font-mono bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700/50">{f}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Mappings */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-400">Field Mappings</label>
              <span className="text-[10px] text-zinc-600">{mappings.length} mapping{mappings.length !== 1 ? "s" : ""}</span>
            </div>

            {mappings.length === 0 && (
              <div className="rounded-lg border border-dashed border-zinc-700/60 bg-zinc-800/20 py-6 text-center">
                <Link2 className="h-5 w-5 text-zinc-600 mx-auto mb-2" />
                <p className="text-xs text-zinc-500">No mappings yet</p>
                <p className="text-[10px] text-zinc-600 mt-1">Add a mapping to connect output fields to input fields</p>
              </div>
            )}

            {mappings.map((mapping, i) => (
              <div key={i} className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-2.5 space-y-2">
                {expressionMode.has(i) ? (
                  // Expression mode
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-violet-400 flex items-center gap-1">
                        <Code2 className="h-2.5 w-2.5" />
                        Expression Mode
                      </span>
                      <button
                        onClick={() => toggleExpressionMode(i)}
                        className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        Switch to direct
                      </button>
                    </div>
                    <input
                      value={mapping.expression || ""}
                      onChange={(e) => updateMapping(i, { expression: e.target.value })}
                      placeholder='{{ source.output | upper }}'
                      className="w-full bg-zinc-800 border border-violet-500/30 rounded-lg text-[11px] font-mono text-zinc-100 px-2.5 py-1.5 outline-none focus:border-violet-500/60 placeholder:text-zinc-600"
                    />
                    <div className="flex items-center gap-1.5">
                      <ArrowRight className="h-3 w-3 text-zinc-600" />
                      <select
                        value={mapping.target}
                        onChange={(e) => updateMapping(i, { target: e.target.value })}
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg text-[11px] font-mono text-zinc-100 px-2 py-1.5 outline-none focus:border-orange-500/60"
                      >
                        <option value="">Select target...</option>
                        {targetFields.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  // Direct mapping mode
                  <div className="flex items-center gap-1.5">
                    <select
                      value={mapping.source}
                      onChange={(e) => updateMapping(i, { source: e.target.value })}
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg text-[11px] font-mono text-zinc-100 px-2 py-1.5 outline-none focus:border-orange-500/60"
                    >
                      <option value="">Source field...</option>
                      {sourceFields.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                    <ArrowRight className="h-3 w-3 text-orange-400 shrink-0" />
                    <select
                      value={mapping.target}
                      onChange={(e) => updateMapping(i, { target: e.target.value })}
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg text-[11px] font-mono text-zinc-100 px-2 py-1.5 outline-none focus:border-orange-500/60"
                    >
                      <option value="">Target field...</option>
                      {targetFields.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Row actions */}
                <div className="flex items-center justify-between">
                  {!expressionMode.has(i) && (
                    <button
                      onClick={() => toggleExpressionMode(i)}
                      className="inline-flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
                    >
                      <Code2 className="h-2.5 w-2.5" />
                      Use expression
                    </button>
                  )}
                  {expressionMode.has(i) && <div />}
                  <button
                    onClick={() => removeMapping(i)}
                    className="text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}

            <button
              onClick={addMapping}
              className="inline-flex items-center gap-1.5 text-[11px] text-orange-400 hover:text-orange-300 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add mapping
            </button>
          </div>

          {/* Info */}
          <div className="rounded-lg border border-zinc-700/40 bg-zinc-800/20 p-3">
            <p className="text-[10px] text-zinc-500">
              Field mappings define how data flows between nodes. Use direct mapping for simple field-to-field connections,
              or switch to expression mode for transformations using {`{{ }}`} syntax.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3 flex items-center justify-end gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save Mappings
          </Button>
        </div>
      </div>
    </>
  );
}
