"use client";

import { useState, useEffect } from "react";
import { X, Save, Loader2, Check } from "lucide-react";
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
  TransformConfig,
} from "./node-configs/logic-configs";
import {
  HttpRequestConfig,
  SendEmailConfig,
  SendSlackConfig,
  DelayConfig,
  SetVariableConfig,
  A2ACallConfig,
} from "./node-configs/action-configs";
import {
  ApprovalGateConfig,
  WaitWebhookConfig,
  WaitFormConfig,
  SubWorkflowConfig,
  MergeConfig,
} from "./node-configs/control-configs";
import {
  GoogleSheetsReadConfig,
  GoogleSheetsWriteConfig,
  GmailSendConfig,
  SlackSendIntegrationConfig,
  CalendarCreateConfig,
  CalendarCheckConfig,
  NotionCreateConfig,
  AirtableCreateConfig,
  AiSummarizeConfig,
  AiClassifyConfig,
  AiExtractConfig,
  ComputerUseConfig,
  DeepResearchConfig,
} from "./node-configs/integration-configs";
import { AgentNodeConfig } from "./node-configs/agent-node-config";

// Icon mapping
import {
  Globe, Clock, UserPlus, MessageSquare, Play, Bot,
  GitBranch, GitFork, Filter, Mail, Hash, Timer,
  Variable, ShieldCheck, Pause, Layers, Merge, Zap, FileText, Shuffle,
  Table, TableProperties, CalendarPlus, CalendarSearch, Database, Plug,
  Sparkles, Tags, FileSearch, Monitor, Radio, Search,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Globe, Clock, UserPlus, MessageSquare, Play, Bot,
  GitBranch, GitFork, Filter, Mail, Hash, Timer,
  Variable, ShieldCheck, Pause, Layers, Merge, Zap, FileText, Shuffle,
  Table, TableProperties, CalendarPlus, CalendarSearch, Database, Plug,
  Sparkles, Tags, FileSearch, Monitor, Radio, Search,
};

/* ── Tab type ── */
type ConfigTab = "config" | "data" | "notes";

interface NodeConfigPanelProps {
  nodeId: string | null;
  nodeType: WorkflowNodeType | null;
  config: Record<string, unknown>;
  teamId: string;
  onSave: (nodeId: string, config: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
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
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<ConfigTab>("config");
  const [notes, setNotes] = useState("");
  const isOpen = !!nodeId && !!nodeType;

  // Reset when different node is selected
  useEffect(() => {
    setConfig(initialConfig);
    setLabel(nodeLabel || "");
    setActiveTab("config");
    setSaved(false);
    setNotes((initialConfig._notes as string) || "");
  }, [nodeId, initialConfig, nodeLabel]);

  const def = nodeType ? getNodeDefinition(nodeType) : null;
  const catDef = def ? WORKFLOW_CATEGORIES.find((c) => c.id === def.category) : null;
  const IconComp = def ? (iconMap[def.icon] || Zap) : Zap;

  const handleSave = () => {
    if (!nodeId) return;
    setSaving(true);
    const configWithNotes = notes ? { ...config, _notes: notes } : config;
    onSave(nodeId, configWithNotes);
    if (label !== nodeLabel && onLabelChange) {
      onLabelChange(nodeId, label);
    }
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }, 300);
  };

  const handleDelete = () => {
    if (!nodeId) return;
    onDelete(nodeId);
    onClose();
  };

  const tabs: { id: ConfigTab; label: string }[] = [
    { id: "config", label: "Config" },
    { id: "data", label: "Data" },
    { id: "notes", label: "Notes" },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-20 bg-black/30 backdrop-blur-[2px] transition-opacity duration-200",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-[400px] z-30 bg-[#1a1a24] border-l border-[#2a2a3a] shadow-2xl transform transition-transform duration-200 flex flex-col",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2a3a] shrink-0">
          <div className="flex items-center gap-3">
            {def && (
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${def.color}12` }}
              >
                <span style={{ color: def.color }}><IconComp className="h-4.5 w-4.5" /></span>
              </div>
            )}
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">{def?.label || "Configure"}</h3>
              <span
                className="inline-flex items-center text-[9px] font-bold uppercase tracking-wider mt-0.5 px-1.5 py-0.5 rounded"
                style={{ color: catDef?.color || "#F97316", backgroundColor: `${catDef?.color || "#F97316"}12` }}
              >
                {catDef?.label || "Node"}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-[#2a2a3a] hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2a2a3a] shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 py-2.5 text-xs font-medium transition-colors border-b-2",
                activeTab === tab.id
                  ? "text-zinc-200 border-orange-500"
                  : "text-zinc-600 border-transparent hover:text-zinc-400"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {activeTab === "config" && (
            <>
              {/* Node label */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">Name</label>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={def?.label || "Node name"}
                  className="w-full bg-[#141418] border border-[#2a2a3a] rounded-lg text-sm text-zinc-100 px-3 py-2.5 outline-none focus:border-orange-500/60 transition-colors placeholder:text-zinc-700"
                />
              </div>

              {/* Config panel for each node type */}
              {nodeType === "trigger_webhook" && <TriggerWebhookConfig config={config} onChange={setConfig} teamId={teamId} />}
              {nodeType === "trigger_schedule" && <TriggerScheduleConfig config={config} onChange={setConfig} />}
              {nodeType === "trigger_lead" && <TriggerLeadConfig config={config} onChange={setConfig} />}
              {nodeType === "trigger_chat" && <TriggerChatConfig config={config} onChange={setConfig} />}
              {nodeType === "trigger_manual" && <TriggerManualConfig config={config} onChange={setConfig} />}
              {nodeType === "agent" && <AgentNodeConfig config={config} onChange={setConfig} />}
              {nodeType === "if_condition" && <IfConditionConfig config={config} onChange={setConfig} />}
              {nodeType === "switch" && <SwitchConfig config={config} onChange={setConfig} />}
              {nodeType === "filter" && <FilterConfig config={config} onChange={setConfig} />}
              {nodeType === "transform" && <TransformConfig config={config} onChange={setConfig} />}
              {nodeType === "http_request" && <HttpRequestConfig config={config} onChange={setConfig} />}
              {nodeType === "send_email" && <SendEmailConfig config={config} onChange={setConfig} />}
              {nodeType === "send_slack" && <SendSlackConfig config={config} onChange={setConfig} />}
              {nodeType === "delay" && <DelayConfig config={config} onChange={setConfig} />}
              {nodeType === "set_variable" && <SetVariableConfig config={config} onChange={setConfig} />}
              {nodeType === "approval_gate" && <ApprovalGateConfig config={config} onChange={setConfig} />}
              {nodeType === "wait_webhook" && <WaitWebhookConfig config={config} onChange={setConfig} teamId={teamId} />}
              {nodeType === "wait_form" && <WaitFormConfig config={config} onChange={setConfig} />}
              {nodeType === "sub_workflow" && <SubWorkflowConfig config={config} onChange={setConfig} teamId={teamId} />}
              {nodeType === "merge" && <MergeConfig config={config} onChange={setConfig} />}
              {nodeType === "google_sheets_read" && <GoogleSheetsReadConfig config={config} onChange={setConfig} />}
              {nodeType === "google_sheets_write" && <GoogleSheetsWriteConfig config={config} onChange={setConfig} />}
              {nodeType === "gmail_send" && <GmailSendConfig config={config} onChange={setConfig} />}
              {nodeType === "slack_send_integration" && <SlackSendIntegrationConfig config={config} onChange={setConfig} />}
              {nodeType === "calendar_create" && <CalendarCreateConfig config={config} onChange={setConfig} />}
              {nodeType === "calendar_check" && <CalendarCheckConfig config={config} onChange={setConfig} />}
              {nodeType === "notion_create" && <NotionCreateConfig config={config} onChange={setConfig} />}
              {nodeType === "airtable_create" && <AirtableCreateConfig config={config} onChange={setConfig} />}
              {nodeType === "ai_summarize" && <AiSummarizeConfig config={config} onChange={setConfig} />}
              {nodeType === "ai_classify" && <AiClassifyConfig config={config} onChange={setConfig} />}
              {nodeType === "ai_extract" && <AiExtractConfig config={config} onChange={setConfig} />}
              {nodeType === "computer_use" && <ComputerUseConfig config={config} onChange={setConfig} />}
              {nodeType === "deep_research" && <DeepResearchConfig config={config} onChange={setConfig} />}
              {nodeType === "a2a_call" && <A2ACallConfig config={config} onChange={setConfig} />}
            </>
          )}

          {activeTab === "data" && (
            <div className="space-y-3">
              <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">Node Data</p>
              <div className="rounded-lg border border-[#2a2a3a] bg-[#141418] p-3">
                <pre className="text-[11px] font-mono text-zinc-400 whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto">
                  {JSON.stringify(config, null, 2)}
                </pre>
              </div>
              <p className="text-[10px] text-zinc-600">
                Raw configuration data for this node. Edit values in the Config tab.
              </p>
            </div>
          )}

          {activeTab === "notes" && (
            <div className="space-y-3">
              <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">Notes</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this node..."
                rows={8}
                className="w-full bg-[#141418] border border-[#2a2a3a] rounded-lg text-sm text-zinc-300 px-3 py-2.5 outline-none focus:border-orange-500/60 transition-colors placeholder:text-zinc-700 resize-none"
              />
              <p className="text-[10px] text-zinc-600">
                Notes are saved with the node configuration.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#2a2a3a] px-5 py-3 flex items-center justify-between shrink-0">
          <button
            onClick={handleDelete}
            className="text-[11px] text-zinc-600 hover:text-red-400 transition-colors"
          >
            Delete node
          </button>
          <Button
            size="sm"
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
            {saved ? "Saved" : "Save"}
          </Button>
        </div>
      </div>
    </>
  );
}
