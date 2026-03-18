"use client";

import { useState, useEffect } from "react";
import { X, Save, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  getNodeDefinition,
  type WorkflowNodeType,
  WORKFLOW_CATEGORIES,
} from "@/lib/workflow-node-types";

// Config panels
import {
  TriggerWebhookConfig,
  TriggerScheduleConfig,
  TriggerLeadConfig,
  TriggerChatConfig,
  TriggerManualConfig,
} from "./node-configs/trigger-configs";
import {
  IfConditionConfig,
  SwitchConfig,
  FilterConfig,
} from "./node-configs/logic-configs";
import {
  HttpRequestConfig,
  SendEmailConfig,
  SendSlackConfig,
  DelayConfig,
  SetVariableConfig,
} from "./node-configs/action-configs";
import {
  ApprovalGateConfig,
  WaitWebhookConfig,
  SubWorkflowConfig,
  MergeConfig,
} from "./node-configs/control-configs";
import { AgentNodeConfig } from "./node-configs/agent-node-config";

// Icon mapping
import {
  Globe, Clock, UserPlus, MessageSquare, Play, Bot,
  GitBranch, GitFork, Filter, Mail, Hash, Timer,
  Variable, ShieldCheck, Pause, Layers, Merge, Zap,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Globe, Clock, UserPlus, MessageSquare, Play, Bot,
  GitBranch, GitFork, Filter, Mail, Hash, Timer,
  Variable, ShieldCheck, Pause, Layers, Merge, Zap,
};

interface NodeConfigPanelProps {
  nodeId: string | null;
  nodeType: WorkflowNodeType | null;
  config: Record<string, unknown>;
  teamId: string;
  onSave: (nodeId: string, config: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
  /** Label/name of the node (editable) */
  nodeLabel?: string;
  onLabelChange?: (nodeId: string, label: string) => void;
}

export function NodeConfigPanel({
  nodeId,
  nodeType,
  config: initialConfig,
  teamId,
  onSave,
  onDelete,
  onClose,
  nodeLabel,
  onLabelChange,
}: NodeConfigPanelProps) {
  const [config, setConfig] = useState<Record<string, unknown>>(initialConfig);
  const [label, setLabel] = useState(nodeLabel || "");
  const [saving, setSaving] = useState(false);
  const isOpen = !!nodeId && !!nodeType;

  // Reset config when a different node is selected
  useEffect(() => {
    setConfig(initialConfig);
    setLabel(nodeLabel || "");
  }, [nodeId, initialConfig, nodeLabel]);

  const def = nodeType ? getNodeDefinition(nodeType) : null;
  const catDef = def ? WORKFLOW_CATEGORIES.find((c) => c.id === def.category) : null;
  const IconComp = def ? (iconMap[def.icon] || Zap) : Zap;

  const handleSave = () => {
    if (!nodeId) return;
    setSaving(true);
    onSave(nodeId, config);
    if (label !== nodeLabel && onLabelChange) {
      onLabelChange(nodeId, label);
    }
    setTimeout(() => setSaving(false), 300);
  };

  const handleDelete = () => {
    if (!nodeId) return;
    onDelete(nodeId);
    onClose();
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

      {/* Slide-in panel */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-[400px] z-30 bg-zinc-900 border-l border-border shadow-2xl transform transition-transform duration-200 flex flex-col",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            {def && (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${def.color}15` }}
              >
                <span style={{ color: def.color }}>
                  <IconComp className="h-4 w-4" />
                </span>
              </div>
            )}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: catDef?.color || "#F97316" }}>
                {catDef?.label || "Node"}
              </p>
              <h3 className="text-sm font-semibold text-zinc-100">{def?.label || "Configure"}</h3>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Node label */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Node Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={def?.label || "Node name"}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors placeholder:text-zinc-600"
            />
          </div>

          {/* Config panel for each node type */}
          {nodeType === "trigger_webhook" && (
            <TriggerWebhookConfig config={config} onChange={setConfig} teamId={teamId} />
          )}
          {nodeType === "trigger_schedule" && (
            <TriggerScheduleConfig config={config} onChange={setConfig} />
          )}
          {nodeType === "trigger_lead" && (
            <TriggerLeadConfig config={config} onChange={setConfig} />
          )}
          {nodeType === "trigger_chat" && (
            <TriggerChatConfig config={config} onChange={setConfig} />
          )}
          {nodeType === "trigger_manual" && (
            <TriggerManualConfig config={config} onChange={setConfig} />
          )}
          {nodeType === "agent" && (
            <AgentNodeConfig config={config} onChange={setConfig} />
          )}
          {nodeType === "if_condition" && (
            <IfConditionConfig config={config} onChange={setConfig} />
          )}
          {nodeType === "switch" && (
            <SwitchConfig config={config} onChange={setConfig} />
          )}
          {nodeType === "filter" && (
            <FilterConfig config={config} onChange={setConfig} />
          )}
          {nodeType === "http_request" && (
            <HttpRequestConfig config={config} onChange={setConfig} />
          )}
          {nodeType === "send_email" && (
            <SendEmailConfig config={config} onChange={setConfig} />
          )}
          {nodeType === "send_slack" && (
            <SendSlackConfig config={config} onChange={setConfig} />
          )}
          {nodeType === "delay" && (
            <DelayConfig config={config} onChange={setConfig} />
          )}
          {nodeType === "set_variable" && (
            <SetVariableConfig config={config} onChange={setConfig} />
          )}
          {nodeType === "approval_gate" && (
            <ApprovalGateConfig config={config} onChange={setConfig} />
          )}
          {nodeType === "wait_webhook" && (
            <WaitWebhookConfig config={config} onChange={setConfig} teamId={teamId} />
          )}
          {nodeType === "sub_workflow" && (
            <SubWorkflowConfig config={config} onChange={setConfig} />
          )}
          {nodeType === "merge" && (
            <MergeConfig config={config} onChange={setConfig} />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3 flex items-center justify-between shrink-0">
          <button
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            <Trash2 className="h-3 w-3" />
            Delete Node
          </button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </div>
      </div>
    </>
  );
}
