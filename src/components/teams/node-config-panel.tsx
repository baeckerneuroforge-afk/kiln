"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  Trash2,
  Play,
  Plus,
  Copy,
  ChevronDown,
  Bot,
  MessageSquare,
  Monitor,
  Terminal,
  Layers,
  Search,
  Globe,
  Clock,
  Mail,
  Hash,
  Timer,
  Variable,
  ShieldCheck,
  FileText,
  Merge,
  GitBranch,
  GitFork,
  Filter,
  Shuffle,
  Zap,
  Plug,
  Database,
  Table,
  TableProperties,
  CalendarPlus,
  CalendarSearch,
  Radio,
  Target,
  Eye,
  Pause,
  UserPlus,
  Tags,
  FileSearch,
  Sparkles,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ALL_MODELS } from "@/lib/ai";
import type { WorkflowNodeType } from "@/lib/workflow-node-types";

/* ========== Types ========== */

interface NodeConfigPanelProps {
  nodeId: string;
  nodeType: WorkflowNodeType;
  label: string;
  config: Record<string, unknown>;
  onConfigChange: (nodeId: string, config: Record<string, unknown>) => void;
  onLabelChange: (nodeId: string, label: string) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
  onTestNode?: (nodeId: string) => void;
  lastRunResult?: unknown;
  lastRunInput?: unknown;
}

/* ========== Icon Map ========== */
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Bot, MessageSquare, Monitor, Terminal, Layers, Search, Globe, Clock,
  Mail, Hash, Timer, Variable, ShieldCheck, FileText, Merge, GitBranch,
  GitFork, Filter, Shuffle, Zap, Plug, Database, Table, TableProperties,
  CalendarPlus, CalendarSearch, Radio, Target, Eye, Pause, UserPlus,
  Tags, FileSearch, Sparkles, Shield,
};

/* ========== Available Tools for AI Agent ========== */
const AGENT_TOOLS = [
  { id: "web_search", label: "Web Search", icon: "Search" },
  { id: "computer_use", label: "Computer Use (Browser)", icon: "Monitor" },
  { id: "code_execution", label: "Code Execution", icon: "Terminal" },
  { id: "mcp_tools", label: "MCP Tools", icon: "Plug" },
  { id: "send_email", label: "Send Email", icon: "Mail" },
  { id: "knowledge_base", label: "Knowledge Base", icon: "Database" },
] as const;

/* ========== Config Field Components ========== */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1.5">
      {children}
    </label>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (val: string) => void;
  placeholder?: string;
  type?: "text" | "number" | "url";
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[#332f2b] bg-[#1e1d1b] px-3 py-2 text-sm text-zinc-200 outline-none transition-colors focus:border-orange-500/50 placeholder:text-zinc-500"
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-lg border border-[#332f2b] bg-[#1e1d1b] px-3 py-2 text-sm text-zinc-200 outline-none transition-colors focus:border-orange-500/50 placeholder:text-zinc-500 resize-y font-mono"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-lg border border-[#332f2b] bg-[#1e1d1b] px-3 py-2 pr-8 text-sm text-zinc-200 outline-none transition-colors focus:border-orange-500/50"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.1,
}: {
  label: string;
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <FieldLabel>{label}</FieldLabel>
        <span className="text-xs text-zinc-400 font-mono">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-orange-500"
      />
    </div>
  );
}

function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-300">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors",
          value ? "bg-orange-500" : "bg-[#332f2b]"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
            value ? "left-[18px]" : "left-0.5"
          )}
        />
      </button>
    </div>
  );
}

function CheckboxGroup({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { id: string; label: string; icon: string }[];
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="space-y-1">
        {options.map((opt) => {
          const Icon = iconMap[opt.icon] || Zap;
          const checked = selected.includes(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggle(opt.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors",
                checked
                  ? "bg-orange-500/10 border border-orange-500/30 text-zinc-200"
                  : "bg-[#1e1d1b] border border-[#332f2b] text-zinc-400 hover:border-[#3d3935]"
              )}
            >
              <div
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded border transition-colors",
                  checked
                    ? "bg-orange-500 border-orange-500"
                    : "border-zinc-600 bg-transparent"
                )}
              >
                {checked && (
                  <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <Icon className="h-3.5 w-3.5" />
              <span className="text-xs">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ========== Model Options ========== */
const modelOptions = ALL_MODELS.map((m) => ({
  value: m.id,
  label: m.label,
}));

/* ========== Config Forms by Node Type ========== */

function AIAgentConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });

  return (
    <div className="space-y-4">
      <TextInput
        label="Agent Name"
        value={(config.name as string) || "AI Agent"}
        onChange={(v) => update("name", v)}
        placeholder="My AI Agent"
      />
      <SelectField
        label="Model"
        value={(config.model as string) || "claude-sonnet-4-6"}
        onChange={(v) => update("model", v)}
        options={modelOptions}
      />
      <TextArea
        label="System Prompt"
        value={(config.systemPrompt as string) || ""}
        onChange={(v) => update("systemPrompt", v)}
        placeholder="You are a helpful assistant that..."
        rows={6}
      />
      <CheckboxGroup
        label="Available Tools"
        options={[...AGENT_TOOLS]}
        selected={(config.tools as string[]) || []}
        onChange={(v) => update("tools", v)}
      />
      <SliderField
        label="Temperature"
        value={(config.temperature as number) ?? 0.7}
        onChange={(v) => update("temperature", v)}
      />
      <TextInput
        label="Max Tokens"
        value={(config.maxTokens as number) || 4096}
        onChange={(v) => update("maxTokens", parseInt(v) || 4096)}
        type="number"
      />
    </div>
  );
}

function LLMPromptConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });

  return (
    <div className="space-y-4">
      <SelectField
        label="Model"
        value={(config.model as string) || "claude-sonnet-4-6"}
        onChange={(v) => update("model", v)}
        options={modelOptions}
      />
      <TextArea
        label="System Prompt"
        value={(config.systemPrompt as string) || ""}
        onChange={(v) => update("systemPrompt", v)}
        placeholder="You are..."
        rows={3}
      />
      <TextArea
        label="User Prompt"
        value={(config.userPrompt as string) || ""}
        onChange={(v) => update("userPrompt", v)}
        placeholder="Use {{input}} to reference upstream data"
        rows={4}
      />
      <SliderField
        label="Temperature"
        value={(config.temperature as number) ?? 0.7}
        onChange={(v) => update("temperature", v)}
      />
      <TextInput
        label="Max Tokens"
        value={(config.maxTokens as number) || 2048}
        onChange={(v) => update("maxTokens", parseInt(v) || 2048)}
        type="number"
      />
    </div>
  );
}

function ComputerUseConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });

  return (
    <div className="space-y-4">
      <TextInput
        label="Start URL"
        value={(config.startUrl as string) || ""}
        onChange={(v) => update("startUrl", v)}
        placeholder="https://example.com"
        type="url"
      />
      <TextArea
        label="Task Description"
        value={(config.task as string) || ""}
        onChange={(v) => update("task", v)}
        placeholder="Navigate to the pricing page and extract all plan details..."
        rows={4}
      />
      <TextInput
        label="Max Steps"
        value={(config.maxSteps as number) || 10}
        onChange={(v) => update("maxSteps", parseInt(v) || 10)}
        type="number"
      />
      <ToggleField
        label="Enable Screenshots"
        value={(config.captureScreenshots as boolean) ?? true}
        onChange={(v) => update("captureScreenshots", v)}
      />
      <SelectField
        label="Model"
        value={(config.model as string) || "claude-sonnet-4-6"}
        onChange={(v) => update("model", v)}
        options={modelOptions}
      />
    </div>
  );
}

function CodeSandboxConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });

  return (
    <div className="space-y-4">
      <SelectField
        label="Language"
        value={(config.language as string) || "python"}
        onChange={(v) => update("language", v)}
        options={[
          { value: "python", label: "Python" },
          { value: "javascript", label: "JavaScript" },
        ]}
      />
      <TextArea
        label="Task / Code"
        value={(config.goal as string) || ""}
        onChange={(v) => update("goal", v)}
        placeholder="Write code to process the input data..."
        rows={6}
      />
      <TextInput
        label="Timeout (seconds)"
        value={Math.round(((config.timeoutMs as number) || 600000) / 1000)}
        onChange={(v) => update("timeoutMs", (parseInt(v) || 600) * 1000)}
        type="number"
      />
    </div>
  );
}

function AgentSwarmConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });

  return (
    <div className="space-y-4">
      <TextArea
        label="Goal"
        value={(config.goal as string) || ""}
        onChange={(v) => update("goal", v)}
        placeholder="Describe the goal to be split across agents..."
        rows={4}
      />
      <TextInput
        label="Max Agents"
        value={(config.maxAgents as number) || 5}
        onChange={(v) => update("maxAgents", parseInt(v) || 5)}
        type="number"
      />
      <TextInput
        label="Max Parallel"
        value={(config.maxParallel as number) || 3}
        onChange={(v) => update("maxParallel", parseInt(v) || 3)}
        type="number"
      />
      <SelectField
        label="Merge Strategy"
        value={(config.mergeStrategy as string) || "wait_all"}
        onChange={(v) => update("mergeStrategy", v)}
        options={[
          { value: "synthesize", label: "Synthesize" },
          { value: "wait_all", label: "Wait All" },
          { value: "first_success", label: "First Success" },
          { value: "best_quality", label: "Best Quality" },
        ]}
      />
      <TextInput
        label="Budget Limit (credits)"
        value={(config.budgetLimit as number) || 0}
        onChange={(v) => update("budgetLimit", parseInt(v) || 0)}
        type="number"
      />
    </div>
  );
}

function TriggerConfig({
  config,
  onChange,
  nodeType,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  nodeType: WorkflowNodeType;
}) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });

  if (nodeType === "trigger_schedule") {
    return (
      <div className="space-y-4">
        <TextInput
          label="Cron Expression"
          value={(config.cron as string) || "0 9 * * *"}
          onChange={(v) => update("cron", v)}
          placeholder="0 9 * * *"
        />
        <SelectField
          label="Timezone"
          value={(config.timezone as string) || "Europe/Berlin"}
          onChange={(v) => update("timezone", v)}
          options={[
            { value: "Europe/Berlin", label: "Europe/Berlin" },
            { value: "UTC", label: "UTC" },
            { value: "America/New_York", label: "America/New York" },
            { value: "America/Los_Angeles", label: "America/Los Angeles" },
            { value: "Asia/Tokyo", label: "Asia/Tokyo" },
          ]}
        />
      </div>
    );
  }

  if (nodeType === "trigger_webhook") {
    return (
      <div className="space-y-4">
        <SelectField
          label="HTTP Method"
          value={(config.method as string) || "POST"}
          onChange={(v) => update("method", v)}
          options={[
            { value: "POST", label: "POST" },
            { value: "GET", label: "GET" },
            { value: "PUT", label: "PUT" },
          ]}
        />
        <TextInput
          label="Path"
          value={(config.path as string) || ""}
          onChange={(v) => update("path", v)}
          placeholder="/my-webhook"
        />
        <div className="rounded-lg border border-[#332f2b] bg-[#1e1d1b] p-3">
          <p className="text-[10px] text-zinc-500 mb-1">Webhook URL</p>
          <p className="text-xs text-zinc-300 font-mono break-all">
            {`/api/webhooks/workflow/${config.path || "..."}`}
          </p>
        </div>
      </div>
    );
  }

  // Manual / Lead / Chat triggers — minimal config
  return (
    <div className="space-y-4">
      {nodeType === "trigger_lead" || nodeType === "trigger_chat" ? (
        <SelectField
          label="Agent Filter"
          value={(config.agentFilter as string) || "all"}
          onChange={(v) => update("agentFilter", v)}
          options={[
            { value: "all", label: "All Agents" },
            { value: "specific", label: "Specific Agent" },
          ]}
        />
      ) : (
        <div className="rounded-lg border border-[#332f2b] bg-[#1e1d1b] p-3">
          <p className="text-xs text-zinc-400">Click &ldquo;Run Workflow&rdquo; or use the Test button to trigger manually.</p>
        </div>
      )}
    </div>
  );
}

function ConditionConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });

  return (
    <div className="space-y-4">
      <TextInput
        label="Field"
        value={(config.field as string) || ""}
        onChange={(v) => update("field", v)}
        placeholder="result.status"
      />
      <SelectField
        label="Operator"
        value={(config.operator as string) || "equals"}
        onChange={(v) => update("operator", v)}
        options={[
          { value: "equals", label: "Equals" },
          { value: "not_equals", label: "Not Equals" },
          { value: "contains", label: "Contains" },
          { value: "greater_than", label: "Greater Than" },
          { value: "less_than", label: "Less Than" },
          { value: "exists", label: "Exists" },
          { value: "is_empty", label: "Is Empty" },
        ]}
      />
      <TextInput
        label="Value"
        value={(config.value as string) || ""}
        onChange={(v) => update("value", v)}
        placeholder="expected value"
      />
    </div>
  );
}

function HTTPRequestConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });

  return (
    <div className="space-y-4">
      <SelectField
        label="Method"
        value={(config.method as string) || "GET"}
        onChange={(v) => update("method", v)}
        options={[
          { value: "GET", label: "GET" },
          { value: "POST", label: "POST" },
          { value: "PUT", label: "PUT" },
          { value: "PATCH", label: "PATCH" },
          { value: "DELETE", label: "DELETE" },
        ]}
      />
      <TextInput
        label="URL"
        value={(config.url as string) || ""}
        onChange={(v) => update("url", v)}
        placeholder="https://api.example.com/endpoint"
        type="url"
      />
      <TextArea
        label="Headers (JSON)"
        value={typeof config.headers === "object" ? JSON.stringify(config.headers, null, 2) : "{}"}
        onChange={(v) => {
          try { update("headers", JSON.parse(v)); } catch { /* invalid JSON */ }
        }}
        placeholder='{"Authorization": "Bearer ..."}'
        rows={3}
      />
      <TextArea
        label="Body"
        value={(config.body as string) || ""}
        onChange={(v) => update("body", v)}
        placeholder="Request body..."
        rows={4}
      />
    </div>
  );
}

function EmailConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });

  return (
    <div className="space-y-4">
      <TextInput label="To" value={(config.to as string) || ""} onChange={(v) => update("to", v)} placeholder="recipient@example.com" />
      <TextInput label="Subject" value={(config.subject as string) || ""} onChange={(v) => update("subject", v)} placeholder="Subject line" />
      <TextArea label="Body" value={(config.body as string) || ""} onChange={(v) => update("body", v)} placeholder="Email body..." rows={5} />
    </div>
  );
}

function DelayConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });

  return (
    <div className="space-y-4">
      <TextInput
        label="Duration"
        value={(config.duration as number) || 60}
        onChange={(v) => update("duration", parseInt(v) || 60)}
        type="number"
      />
      <SelectField
        label="Unit"
        value={(config.unit as string) || "seconds"}
        onChange={(v) => update("unit", v)}
        options={[
          { value: "seconds", label: "Seconds" },
          { value: "minutes", label: "Minutes" },
          { value: "hours", label: "Hours" },
        ]}
      />
    </div>
  );
}

function LoopConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });

  return (
    <div className="space-y-4">
      <TextInput
        label="Max Iterations"
        value={(config.maxIterations as number) || 10}
        onChange={(v) => update("maxIterations", parseInt(v) || 10)}
        type="number"
      />
      <TextArea
        label="Continue Condition"
        value={(config.condition as string) || ""}
        onChange={(v) => update("condition", v)}
        placeholder="result.hasMore === true"
        rows={2}
      />
      <SelectField
        label="Mode"
        value={(config.mode as string) || "while"}
        onChange={(v) => update("mode", v)}
        options={[
          { value: "while", label: "While (check before)" },
          { value: "do_while", label: "Do-While (check after)" },
          { value: "for_each", label: "For Each (iterate items)" },
        ]}
      />
    </div>
  );
}

function DeepResearchConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });

  return (
    <div className="space-y-4">
      <TextArea
        label="Research Topic"
        value={(config.topic as string) || ""}
        onChange={(v) => update("topic", v)}
        placeholder="Research topic or question..."
        rows={3}
      />
      <SelectField
        label="Depth"
        value={(config.depth as string) || "standard"}
        onChange={(v) => update("depth", v)}
        options={[
          { value: "quick", label: "Quick" },
          { value: "standard", label: "Standard" },
          { value: "deep", label: "Deep" },
        ]}
      />
    </div>
  );
}

function SlackConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });

  return (
    <div className="space-y-4">
      <TextInput label="Channel" value={(config.channel as string) || ""} onChange={(v) => update("channel", v)} placeholder="#general" />
      <TextArea label="Message" value={(config.message as string) || ""} onChange={(v) => update("message", v)} placeholder="Notification text..." rows={3} />
    </div>
  );
}

function MCPToolConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });

  return (
    <div className="space-y-4">
      <TextInput label="MCP Connection" value={(config.mcpConnectionId as string) || ""} onChange={(v) => update("mcpConnectionId", v)} placeholder="Connection ID" />
      <TextInput label="Tool Name" value={(config.toolName as string) || ""} onChange={(v) => update("toolName", v)} placeholder="tool_name" />
      <TextArea
        label="Parameters (JSON)"
        value={typeof config.toolParams === "object" ? JSON.stringify(config.toolParams, null, 2) : "{}"}
        onChange={(v) => {
          try { update("toolParams", JSON.parse(v)); } catch { /* invalid JSON */ }
        }}
        placeholder="{}"
        rows={4}
      />
    </div>
  );
}

/* ========== Shared: HelpText ========== */
function HelpText({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-zinc-500 -mt-2">{children}</p>;
}

/* ========== Shared: DynamicList ========== */
function DynamicList({
  label,
  items,
  onChange,
  placeholder = "Value",
  addLabel = "Add Item",
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  addLabel?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              value={item}
              onChange={(e) => {
                const next = [...items];
                next[i] = e.target.value;
                onChange(next);
              }}
              placeholder={placeholder}
              className="flex-1 rounded-lg border border-[#332f2b] bg-[#1e1d1b] px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-orange-500/50 placeholder:text-zinc-500"
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...items, ""])}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-[#332f2b] px-3 py-1.5 text-xs text-zinc-400 hover:border-orange-500/30 hover:text-orange-400 transition-colors w-full justify-center"
        >
          <Plus className="h-3 w-3" /> {addLabel}
        </button>
      </div>
    </div>
  );
}

/* ========== Shared: KeyValueList ========== */
function KeyValueList({
  label,
  items,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  addLabel = "Add Field",
}: {
  label: string;
  items: { key: string; value: string }[];
  onChange: (items: { key: string; value: string }[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              value={item.key}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...next[i], key: e.target.value };
                onChange(next);
              }}
              placeholder={keyPlaceholder}
              className="w-[40%] rounded-lg border border-[#332f2b] bg-[#1e1d1b] px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-orange-500/50 placeholder:text-zinc-500"
            />
            <input
              value={item.value}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...next[i], value: e.target.value };
                onChange(next);
              }}
              placeholder={valuePlaceholder}
              className="flex-1 rounded-lg border border-[#332f2b] bg-[#1e1d1b] px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-orange-500/50 placeholder:text-zinc-500"
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...items, { key: "", value: "" }])}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-[#332f2b] px-3 py-1.5 text-xs text-zinc-400 hover:border-orange-500/30 hover:text-orange-400 transition-colors w-full justify-center"
        >
          <Plus className="h-3 w-3" /> {addLabel}
        </button>
      </div>
    </div>
  );
}

/* ========== Shared: CopyField ========== */
function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-1.5 rounded-lg border border-[#332f2b] bg-[#1e1d1b] px-3 py-2">
        <p className="flex-1 text-xs text-zinc-300 font-mono break-all">{value}</p>
        <button
          type="button"
          onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        {copied && <span className="text-[10px] text-green-400">Copied</span>}
      </div>
    </div>
  );
}

/* ========== LOGIC: Switch ========== */
function SwitchConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  const cases = (config.cases as { label: string; condition: string }[]) || [{ label: "Case 1", condition: "" }];
  return (
    <div className="space-y-4">
      <TextInput label="Expression" value={(config.expression as string) || ""} onChange={(v) => update("expression", v)} placeholder="input.status" />
      <div>
        <FieldLabel>Cases</FieldLabel>
        <div className="space-y-1.5">
          {cases.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input value={c.label} onChange={(e) => { const next = [...cases]; next[i] = { ...next[i], label: e.target.value }; update("cases", next); }} placeholder="Label" className="w-[35%] rounded-lg border border-[#332f2b] bg-[#1e1d1b] px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-orange-500/50 placeholder:text-zinc-500" />
              <input value={c.condition} onChange={(e) => { const next = [...cases]; next[i] = { ...next[i], condition: e.target.value }; update("cases", next); }} placeholder="Value to match" className="flex-1 rounded-lg border border-[#332f2b] bg-[#1e1d1b] px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-orange-500/50 placeholder:text-zinc-500" />
              <button type="button" onClick={() => update("cases", cases.filter((_, j) => j !== i))} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"><Trash2 className="h-3 w-3" /></button>
            </div>
          ))}
          <button type="button" onClick={() => update("cases", [...cases, { label: `Case ${cases.length + 1}`, condition: "" }])} className="flex items-center gap-1.5 rounded-lg border border-dashed border-[#332f2b] px-3 py-1.5 text-xs text-zinc-400 hover:border-orange-500/30 hover:text-orange-400 transition-colors w-full justify-center"><Plus className="h-3 w-3" /> Add Case</button>
        </div>
      </div>
      <TextInput label="Default Case Label" value={(config.defaultLabel as string) || "default"} onChange={(v) => update("defaultLabel", v)} placeholder="default" />
    </div>
  );
}

/* ========== LOGIC: Transform ========== */
function TransformConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  return (
    <div className="space-y-4">
      <SelectField label="Transform Mode" value={(config.mode as string) || "template"} onChange={(v) => update("mode", v)} options={[{ value: "template", label: "Template" }, { value: "javascript", label: "JavaScript" }, { value: "jq", label: "jq Expression" }]} />
      <TextArea label="Template / Code" value={(config.template as string) || ""} onChange={(v) => update("template", v)} placeholder={(config.mode as string) === "javascript" ? "return { ...input, processed: true };" : "{{ input.data }}"} rows={6} />
      <TextInput label="Input Variable" value={(config.inputVar as string) || "input"} onChange={(v) => update("inputVar", v)} placeholder="input" />
      <TextInput label="Output Variable" value={(config.outputVar as string) || "output"} onChange={(v) => update("outputVar", v)} placeholder="output" />
    </div>
  );
}

/* ========== LOGIC: Set Variable ========== */
function SetVariableConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  return (
    <div className="space-y-4">
      <TextInput label="Variable Name" value={(config.key as string) || ""} onChange={(v) => update("key", v)} placeholder="myVariable" />
      <TextArea label="Value" value={(config.value as string) || ""} onChange={(v) => update("value", v)} placeholder="{{ input.data.result }}" rows={3} />
      <HelpText>Use &#123;&#123; expr &#125;&#125; for dynamic values from upstream nodes.</HelpText>
      <SelectField label="Type Hint" value={(config.typeHint as string) || "string"} onChange={(v) => update("typeHint", v)} options={[{ value: "string", label: "String" }, { value: "number", label: "Number" }, { value: "boolean", label: "Boolean" }, { value: "json", label: "JSON" }]} />
    </div>
  );
}

/* ========== LOGIC: Parallel Split ========== */
function ParallelSplitConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  const labels = (config.branchLabels as string[]) || [];
  const count = (config.branches as number) || 2;
  return (
    <div className="space-y-4">
      <TextInput label="Number of Branches" value={count} onChange={(v) => { const n = parseInt(v) || 2; update("branches", n); }} type="number" />
      <DynamicList label="Branch Labels" items={labels.length >= count ? labels.slice(0, count) : [...labels, ...Array(count - labels.length).fill("")]} onChange={(v) => update("branchLabels", v)} placeholder="Branch name" addLabel="Add Label" />
    </div>
  );
}

/* ========== LOGIC: Parallel Merge ========== */
function ParallelMergeConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  return (
    <div className="space-y-4">
      <SelectField label="Merge Strategy" value={(config.mergeStrategy as string) || "wait_all"} onChange={(v) => update("mergeStrategy", v)} options={[{ value: "wait_all", label: "Wait All" }, { value: "first_success", label: "First Success" }, { value: "majority", label: "Majority" }]} />
      <TextInput label="Timeout (seconds)" value={(config.timeout as number) || 300} onChange={(v) => update("timeout", parseInt(v) || 300)} type="number" />
      <TextInput label="Result Key" value={(config.resultKey as string) || "parallelResult"} onChange={(v) => update("resultKey", v)} placeholder="parallelResult" />
    </div>
  );
}

/* ========== CONTROL: Approval Gate ========== */
function ApprovalGateConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  return (
    <div className="space-y-4">
      <TextInput label="Approver Email" value={(config.approverEmail as string) || ""} onChange={(v) => update("approverEmail", v)} placeholder="approver@company.com" />
      <TextArea label="Message to Approver" value={(config.message as string) || ""} onChange={(v) => update("message", v)} placeholder="Please review and approve this step..." rows={3} />
      <TextInput label="Timeout (hours)" value={(config.timeoutMinutes as number ? Math.round((config.timeoutMinutes as number) / 60) : 24)} onChange={(v) => update("timeoutMinutes", (parseInt(v) || 24) * 60)} type="number" />
      <SelectField label="On Timeout" value={(config.timeoutAction as string) || "reject"} onChange={(v) => update("timeoutAction", v)} options={[{ value: "approve", label: "Auto-Approve" }, { value: "reject", label: "Auto-Reject" }, { value: "skip", label: "Skip" }]} />
    </div>
  );
}

/* ========== CONTROL: Wait Webhook ========== */
function WaitWebhookConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  const path = (config.webhookPath as string) || `/wait/${Date.now().toString(36)}`;
  return (
    <div className="space-y-4">
      <TextInput label="Webhook Path" value={path} onChange={(v) => update("webhookPath", v)} placeholder="/wait/abc123" />
      <CopyField label="Full Webhook URL" value={`/api/webhooks/workflow${path}`} />
      <TextInput label="Timeout (seconds)" value={(config.timeoutMinutes as number ? (config.timeoutMinutes as number) * 60 : 3600)} onChange={(v) => update("timeoutMinutes", Math.round((parseInt(v) || 3600) / 60))} type="number" />
    </div>
  );
}

/* ========== CONTROL: Wait Form ========== */
function WaitFormConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  const fields = (config.fields as { name: string; type: string; required: boolean }[]) || [];
  return (
    <div className="space-y-4">
      <TextInput label="Form Title" value={(config.formTitle as string) || ""} onChange={(v) => update("formTitle", v)} placeholder="Input Required" />
      <TextInput label="Submit Button Label" value={(config.submitLabel as string) || "Submit"} onChange={(v) => update("submitLabel", v)} placeholder="Submit" />
      <div>
        <FieldLabel>Form Fields</FieldLabel>
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input value={f.name} onChange={(e) => { const next = [...fields]; next[i] = { ...next[i], name: e.target.value }; update("fields", next); }} placeholder="Field name" className="w-[30%] rounded-lg border border-[#332f2b] bg-[#1e1d1b] px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-orange-500/50 placeholder:text-zinc-500" />
              <select value={f.type} onChange={(e) => { const next = [...fields]; next[i] = { ...next[i], type: e.target.value }; update("fields", next); }} className="w-[30%] appearance-none rounded-lg border border-[#332f2b] bg-[#1e1d1b] px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-orange-500/50">
                <option value="text">Text</option><option value="email">Email</option><option value="number">Number</option><option value="select">Select</option><option value="textarea">Textarea</option>
              </select>
              <label className="flex items-center gap-1 text-xs text-zinc-400 shrink-0"><input type="checkbox" checked={f.required} onChange={(e) => { const next = [...fields]; next[i] = { ...next[i], required: e.target.checked }; update("fields", next); }} className="accent-orange-500" />Req</label>
              <button type="button" onClick={() => update("fields", fields.filter((_, j) => j !== i))} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"><Trash2 className="h-3 w-3" /></button>
            </div>
          ))}
          <button type="button" onClick={() => update("fields", [...fields, { name: "", type: "text", required: false }])} className="flex items-center gap-1.5 rounded-lg border border-dashed border-[#332f2b] px-3 py-1.5 text-xs text-zinc-400 hover:border-orange-500/30 hover:text-orange-400 transition-colors w-full justify-center"><Plus className="h-3 w-3" /> Add Field</button>
        </div>
      </div>
    </div>
  );
}

/* ========== CONTROL: Sub-Workflow ========== */
function SubWorkflowConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  return (
    <div className="space-y-4">
      <TextInput label="Workflow ID" value={(config.workflowId as string) || ""} onChange={(v) => update("workflowId", v)} placeholder="workflow_abc123" />
      <HelpText>Enter the ID of the workflow to run as a sub-step.</HelpText>
      <TextArea label="Input Mapping (JSON)" value={typeof config.inputMapping === "object" ? JSON.stringify(config.inputMapping, null, 2) : "[]"} onChange={(v) => { try { update("inputMapping", JSON.parse(v)); } catch { /* */ } }} placeholder='[{"from": "input.data", "to": "data"}]' rows={4} />
      <ToggleField label="Wait for Completion" value={(config.mode as string) !== "async"} onChange={(v) => update("mode", v ? "sync" : "async")} />
      <TextInput label="Timeout (minutes)" value={(config.timeoutMinutes as number) || 5} onChange={(v) => update("timeoutMinutes", parseInt(v) || 5)} type="number" />
    </div>
  );
}

/* ========== CONTROL: Merge ========== */
function MergeConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  return (
    <div className="space-y-4">
      <SelectField label="Merge Mode" value={(config.strategy as string) || "wait_all"} onChange={(v) => update("strategy", v)} options={[{ value: "wait_all", label: "Combine All" }, { value: "first", label: "First Result" }, { value: "latest", label: "Latest Result" }]} />
      <TextInput label="Expected Inputs" value={(config.inputCount as number) || 2} onChange={(v) => update("inputCount", parseInt(v) || 2)} type="number" />
      <HelpText>How many incoming connections to wait for before continuing.</HelpText>
    </div>
  );
}

/* ========== INTEGRATION: Google Sheets Read ========== */
function GoogleSheetsReadConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  return (
    <div className="space-y-4">
      <TextInput label="Spreadsheet ID" value={(config.spreadsheetId as string) || ""} onChange={(v) => update("spreadsheetId", v)} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" />
      <HelpText>Find the ID in the Google Sheets URL between /d/ and /edit.</HelpText>
      <TextInput label="Sheet Name" value={(config.sheetName as string) || "Sheet1"} onChange={(v) => update("sheetName", v)} placeholder="Sheet1" />
      <TextInput label="Range" value={(config.range as string) || "A:Z"} onChange={(v) => update("range", v)} placeholder="A1:D100" />
    </div>
  );
}

/* ========== INTEGRATION: Google Sheets Write ========== */
function GoogleSheetsWriteConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  return (
    <div className="space-y-4">
      <TextInput label="Spreadsheet ID" value={(config.spreadsheetId as string) || ""} onChange={(v) => update("spreadsheetId", v)} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" />
      <TextInput label="Sheet Name" value={(config.sheetName as string) || "Sheet1"} onChange={(v) => update("sheetName", v)} placeholder="Sheet1" />
      <TextInput label="Range" value={(config.range as string) || "A1"} onChange={(v) => update("range", v)} placeholder="A1" />
      <SelectField label="Data Source" value={(config.dataSource as string) || "previous_node"} onChange={(v) => update("dataSource", v)} options={[{ value: "previous_node", label: "Previous Node Output" }, { value: "manual", label: "Manual Data" }]} />
      {(config.dataSource as string) === "manual" && (
        <TextArea label="Data (JSON Array)" value={typeof config.values === "object" ? JSON.stringify(config.values, null, 2) : "[]"} onChange={(v) => { try { update("values", JSON.parse(v)); } catch { /* */ } }} placeholder='[["Name", "Email"], ["John", "john@example.com"]]' rows={5} />
      )}
    </div>
  );
}

/* ========== INTEGRATION: Gmail Send (enhanced) ========== */
function GmailSendConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  return (
    <div className="space-y-4">
      <TextInput label="To" value={(config.to as string) || ""} onChange={(v) => update("to", v)} placeholder="recipient@example.com" />
      <TextInput label="CC" value={(config.cc as string) || ""} onChange={(v) => update("cc", v)} placeholder="cc@example.com (optional)" />
      <TextInput label="BCC" value={(config.bcc as string) || ""} onChange={(v) => update("bcc", v)} placeholder="bcc@example.com (optional)" />
      <TextInput label="Subject" value={(config.subject as string) || ""} onChange={(v) => update("subject", v)} placeholder="Subject line" />
      <TextArea label="Body" value={(config.body as string) || ""} onChange={(v) => update("body", v)} placeholder="Email body..." rows={5} />
    </div>
  );
}

/* ========== INTEGRATION: Calendar Create ========== */
function CalendarCreateConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  return (
    <div className="space-y-4">
      <TextInput label="Event Title" value={(config.title as string) || ""} onChange={(v) => update("title", v)} placeholder="Meeting with team" />
      <TextInput label="Start Date/Time" value={(config.start as string) || ""} onChange={(v) => update("start", v)} placeholder="2026-03-25T10:00:00" />
      <TextInput label="Duration (minutes)" value={(config.durationMinutes as number) || 60} onChange={(v) => update("durationMinutes", parseInt(v) || 60)} type="number" />
      <TextArea label="Description" value={(config.description as string) || ""} onChange={(v) => update("description", v)} placeholder="Event description..." rows={3} />
      <TextInput label="Attendees" value={(config.attendeeEmail as string) || ""} onChange={(v) => update("attendeeEmail", v)} placeholder="user1@example.com, user2@example.com" />
      <HelpText>Comma-separated email addresses.</HelpText>
      <SelectField label="Timezone" value={(config.timezone as string) || "Europe/Berlin"} onChange={(v) => update("timezone", v)} options={[{ value: "Europe/Berlin", label: "Europe/Berlin" }, { value: "UTC", label: "UTC" }, { value: "America/New_York", label: "America/New York" }]} />
    </div>
  );
}

/* ========== INTEGRATION: Calendar Check ========== */
function CalendarCheckConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  return (
    <div className="space-y-4">
      <TextInput label="Start Date" value={(config.startDate as string) || ""} onChange={(v) => update("startDate", v)} placeholder="2026-03-25" />
      <TextInput label="End Date" value={(config.endDate as string) || ""} onChange={(v) => update("endDate", v)} placeholder="2026-03-30" />
      <TextInput label="Calendar ID" value={(config.calendarId as string) || "primary"} onChange={(v) => update("calendarId", v)} placeholder="primary" />
      <TextInput label="Slot Duration (minutes)" value={(config.slotMinutes as number) || 30} onChange={(v) => update("slotMinutes", parseInt(v) || 30)} type="number" />
      <TextInput label="Day Start Hour" value={(config.dayStartHour as number) || 9} onChange={(v) => update("dayStartHour", parseInt(v) || 9)} type="number" />
      <TextInput label="Day End Hour" value={(config.dayEndHour as number) || 17} onChange={(v) => update("dayEndHour", parseInt(v) || 17)} type="number" />
    </div>
  );
}

/* ========== INTEGRATION: Notion Create ========== */
function NotionCreateConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  const props = config.propertiesList as { key: string; value: string }[] || [];
  return (
    <div className="space-y-4">
      <TextInput label="Database ID" value={(config.databaseId as string) || ""} onChange={(v) => update("databaseId", v)} placeholder="abc123def456..." />
      <HelpText>Find the database ID in the Notion URL.</HelpText>
      <TextInput label="Page Title" value={(config.pageTitle as string) || ""} onChange={(v) => update("pageTitle", v)} placeholder="New Entry" />
      <KeyValueList label="Properties" items={props} onChange={(v) => update("propertiesList", v)} keyPlaceholder="Property name" valuePlaceholder="Value" addLabel="Add Property" />
      <TextArea label="Content" value={(config.content as string) || ""} onChange={(v) => update("content", v)} placeholder="Page body content..." rows={3} />
    </div>
  );
}

/* ========== INTEGRATION: Airtable Create ========== */
function AirtableCreateConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  const fieldsList = config.fieldsList as { key: string; value: string }[] || [];
  return (
    <div className="space-y-4">
      <TextInput label="Base ID" value={(config.baseId as string) || ""} onChange={(v) => update("baseId", v)} placeholder="appXYZ123..." />
      <TextInput label="Table Name" value={(config.tableName as string) || ""} onChange={(v) => update("tableName", v)} placeholder="Contacts" />
      <KeyValueList label="Fields" items={fieldsList} onChange={(v) => update("fieldsList", v)} keyPlaceholder="Field name" valuePlaceholder="Value" addLabel="Add Field" />
    </div>
  );
}

/* ========== INTEGRATION: Data Query ========== */
function DataQueryConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  return (
    <div className="space-y-4">
      <TextInput label="Connection ID" value={(config.connectionId as string) || ""} onChange={(v) => update("connectionId", v)} placeholder="connection_abc123" />
      <SelectField label="Query Mode" value={(config.queryMode as string) || "natural_language"} onChange={(v) => update("queryMode", v)} options={[{ value: "sql", label: "SQL" }, { value: "natural_language", label: "Natural Language" }]} />
      <TextArea label="Query" value={(config.query as string) || ""} onChange={(v) => update("query", v)} placeholder={(config.queryMode as string) === "sql" ? "SELECT * FROM users WHERE active = true LIMIT 100" : "Show me all active users from the last 30 days"} rows={5} />
      <TextInput label="Max Rows" value={(config.maxRows as number) || 100} onChange={(v) => update("maxRows", parseInt(v) || 100)} type="number" />
      <TextInput label="Result Key" value={(config.resultKey as string) || "queryResult"} onChange={(v) => update("resultKey", v)} placeholder="queryResult" />
    </div>
  );
}

/* ========== AI TOOLS: AI Summarize ========== */
function AISummarizeConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  return (
    <div className="space-y-4">
      <SelectField label="Input Source" value={(config.inputSource as string) || "previous_node"} onChange={(v) => update("inputSource", v)} options={[{ value: "previous_node", label: "Previous Node Output" }, { value: "manual", label: "Manual Text" }]} />
      {(config.inputSource as string) === "manual" && (
        <TextArea label="Text to Summarize" value={(config.input as string) || ""} onChange={(v) => update("input", v)} placeholder="Paste text here..." rows={5} />
      )}
      <SelectField label="Summary Length" value={(config.maxLength as string) || "kurz"} onChange={(v) => update("maxLength", v)} options={[{ value: "kurz", label: "Short" }, { value: "mittel", label: "Medium" }, { value: "detailliert", label: "Detailed" }]} />
      <SelectField label="Model" value={(config.model as string) || "claude-sonnet-4-6"} onChange={(v) => update("model", v)} options={modelOptions} />
    </div>
  );
}

/* ========== AI TOOLS: AI Classify ========== */
function AIClassifyConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  const categories = typeof config.categories === "string" ? (config.categories as string).split(",").map(s => s.trim()).filter(Boolean) : (config.categoriesList as string[]) || [];
  return (
    <div className="space-y-4">
      <SelectField label="Input Source" value={(config.inputSource as string) || "previous_node"} onChange={(v) => update("inputSource", v)} options={[{ value: "previous_node", label: "Previous Node Output" }, { value: "manual", label: "Manual Text" }]} />
      {(config.inputSource as string) === "manual" && (
        <TextArea label="Text to Classify" value={(config.input as string) || ""} onChange={(v) => update("input", v)} placeholder="Text to classify..." rows={3} />
      )}
      <DynamicList label="Categories" items={categories} onChange={(v) => { update("categoriesList", v); update("categories", v.join(", ")); }} placeholder="Category name" addLabel="Add Category" />
      <SelectField label="Return Format" value={(config.returnFormat as string) || "single_label"} onChange={(v) => update("returnFormat", v)} options={[{ value: "single_label", label: "Single Label" }, { value: "confidence_scores", label: "Confidence Scores" }]} />
      <SelectField label="Model" value={(config.model as string) || "claude-sonnet-4-6"} onChange={(v) => update("model", v)} options={modelOptions} />
    </div>
  );
}

/* ========== AI TOOLS: AI Extract ========== */
function AIExtractConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  const fields = (config.fieldsList as { key: string; value: string }[]) || [];
  return (
    <div className="space-y-4">
      <SelectField label="Input Source" value={(config.inputSource as string) || "previous_node"} onChange={(v) => update("inputSource", v)} options={[{ value: "previous_node", label: "Previous Node Output" }, { value: "manual", label: "Manual Text" }]} />
      {(config.inputSource as string) === "manual" && (
        <TextArea label="Text to Extract From" value={(config.input as string) || ""} onChange={(v) => update("input", v)} placeholder="Source text..." rows={3} />
      )}
      <div>
        <FieldLabel>Fields to Extract</FieldLabel>
        <div className="space-y-1.5">
          {fields.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input value={f.key} onChange={(e) => { const next = [...fields]; next[i] = { ...next[i], key: e.target.value }; update("fieldsList", next); }} placeholder="Field name" className="flex-1 rounded-lg border border-[#332f2b] bg-[#1e1d1b] px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-orange-500/50 placeholder:text-zinc-500" />
              <select value={f.value} onChange={(e) => { const next = [...fields]; next[i] = { ...next[i], value: e.target.value }; update("fieldsList", next); }} className="w-[35%] appearance-none rounded-lg border border-[#332f2b] bg-[#1e1d1b] px-2 py-1.5 text-sm text-zinc-200 outline-none focus:border-orange-500/50">
                <option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="email">Email</option><option value="phone">Phone</option><option value="url">URL</option>
              </select>
              <button type="button" onClick={() => update("fieldsList", fields.filter((_, j) => j !== i))} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"><Trash2 className="h-3 w-3" /></button>
            </div>
          ))}
          <button type="button" onClick={() => update("fieldsList", [...fields, { key: "", value: "text" }])} className="flex items-center gap-1.5 rounded-lg border border-dashed border-[#332f2b] px-3 py-1.5 text-xs text-zinc-400 hover:border-orange-500/30 hover:text-orange-400 transition-colors w-full justify-center"><Plus className="h-3 w-3" /> Add Field</button>
        </div>
      </div>
      <SelectField label="Output Format" value={(config.outputFormat as string) || "json"} onChange={(v) => update("outputFormat", v)} options={[{ value: "json", label: "JSON" }, { value: "table", label: "Table" }]} />
      <SelectField label="Model" value={(config.model as string) || "claude-sonnet-4-6"} onChange={(v) => update("model", v)} options={modelOptions} />
    </div>
  );
}

/* ========== AI TOOLS: Diff Detection ========== */
function DiffDetectionConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  const urls = (config.urls as string[]) || [];
  return (
    <div className="space-y-4">
      <DynamicList label="URLs to Monitor" items={urls} onChange={(v) => update("urls", v)} placeholder="https://example.com/pricing" addLabel="Add URL" />
      <SelectField label="Check Interval" value={(config.interval as string) || "daily"} onChange={(v) => update("interval", v)} options={[{ value: "hourly", label: "Hourly" }, { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }]} />
      <SelectField label="Sensitivity" value={(config.sensitivity as string) || "important_only"} onChange={(v) => update("sensitivity", v)} options={[{ value: "any_change", label: "Any Change" }, { value: "important_only", label: "Important Only" }, { value: "structural", label: "Structural Only" }]} />
      <SelectField label="Diff Method" value={(config.diffMethod as string) || "auto"} onChange={(v) => update("diffMethod", v)} options={[{ value: "auto", label: "Auto" }, { value: "dom_only", label: "DOM Only" }, { value: "vision_only", label: "Vision (Screenshot)" }]} />
      <ToggleField label="Notify on Change" value={(config.notifyOnChange as boolean) ?? true} onChange={(v) => update("notifyOnChange", v)} />
      <ToggleField label="Continue if No Changes" value={(config.continueIfNoChanges as boolean) ?? true} onChange={(v) => update("continueIfNoChanges", v)} />
    </div>
  );
}

/* ========== AI TOOLS: Multi-Site ========== */
function MultiSiteConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  const urls = (config.urls as string[]) || [];
  return (
    <div className="space-y-4">
      <DynamicList label="URLs" items={urls} onChange={(v) => update("urls", v)} placeholder="https://example.com" addLabel="Add URL" />
      <TextArea label="Task per Site" value={(config.taskPerSite as string) || ""} onChange={(v) => update("taskPerSite", v)} placeholder="Extract the main heading and first paragraph from each page" rows={3} />
      <TextInput label="Max Parallel" value={(config.maxParallel as number) || 3} onChange={(v) => update("maxParallel", parseInt(v) || 3)} type="number" />
      <SelectField label="Merge Strategy" value={(config.mergeStrategy as string) || "aggregate"} onChange={(v) => update("mergeStrategy", v)} options={[{ value: "aggregate", label: "Aggregate All" }, { value: "compare", label: "Compare" }, { value: "summarize", label: "Summarize" }]} />
      <ToggleField label="Merge Results" value={(config.mergeResults as boolean) ?? true} onChange={(v) => update("mergeResults", v)} />
      <TextInput label="Timeout per Site (seconds)" value={(config.timeoutPerSite as number) || 60} onChange={(v) => update("timeoutPerSite", parseInt(v) || 60)} type="number" />
    </div>
  );
}

/* ========== ADVANCED: Goal Trigger ========== */
function GoalTriggerConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  return (
    <div className="space-y-4">
      <TextArea label="Goal Description" value={(config.goal as string) || ""} onChange={(v) => update("goal", v)} placeholder="Research competitor pricing and create a comparison table..." rows={4} />
      <TextInput label="Max Iterations" value={(config.maxSteps as number) || 10} onChange={(v) => update("maxSteps", parseInt(v) || 10)} type="number" />
      <SelectField label="Model" value={(config.model as string) || "claude-sonnet-4-6"} onChange={(v) => update("model", v)} options={modelOptions} />
      <ToggleField label="Auto-Approve Steps" value={(config.autoApprove as boolean) ?? true} onChange={(v) => update("autoApprove", v)} />
    </div>
  );
}

/* ========== ADVANCED: Spawn Helper ========== */
function SpawnHelperConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  return (
    <div className="space-y-4">
      <TextArea label="Task Description" value={(config.task as string) || ""} onChange={(v) => update("task", v)} placeholder="Summarize the research findings and extract key metrics..." rows={4} />
      <CheckboxGroup label="Available Tools" options={[...AGENT_TOOLS]} selected={(config.tools as string[]) || []} onChange={(v) => update("tools", v)} />
      <TextInput label="Max Sub-Agents" value={(config.maxAgents as number) || 3} onChange={(v) => update("maxAgents", parseInt(v) || 3)} type="number" />
      <SelectField label="Model" value={(config.model as string) || "claude-sonnet-4-6"} onChange={(v) => update("model", v)} options={modelOptions} />
      <TextInput label="Max Tokens" value={(config.maxTokens as number) || 1024} onChange={(v) => update("maxTokens", parseInt(v) || 1024)} type="number" />
    </div>
  );
}

/* ========== ADVANCED: A2A Call ========== */
function A2ACallConfig({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const update = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  const headers = (config.headersList as { key: string; value: string }[]) || [];
  return (
    <div className="space-y-4">
      <TextInput label="Agent URL" value={(config.targetUrl as string) || ""} onChange={(v) => update("targetUrl", v)} placeholder="https://agent.example.com/a2a" type="url" />
      <SelectField label="Method" value={(config.method as string) || "POST"} onChange={(v) => update("method", v)} options={[{ value: "GET", label: "GET" }, { value: "POST", label: "POST" }]} />
      <TextArea label="Payload Template" value={(config.messageTemplate as string) || ""} onChange={(v) => update("messageTemplate", v)} placeholder='{"task": "{{ input.task }}", "context": "{{ input.context }}"}' rows={4} />
      <KeyValueList label="Headers" items={headers} onChange={(v) => update("headersList", v)} keyPlaceholder="Header name" valuePlaceholder="Value" addLabel="Add Header" />
      <TextInput label="Timeout (seconds)" value={Math.round(((config.timeout as number) || 30000) / 1000)} onChange={(v) => update("timeout", (parseInt(v) || 30) * 1000)} type="number" />
      <TextInput label="API Key" value={(config.apiKey as string) || ""} onChange={(v) => update("apiKey", v)} placeholder="Optional API key" />
    </div>
  );
}

/* ========== Generic/Fallback Config ========== */
function GenericConfig({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4">
      <TextArea
        label="Configuration (JSON)"
        value={JSON.stringify(config, null, 2)}
        onChange={(v) => {
          try { onChange(JSON.parse(v)); } catch { /* invalid JSON */ }
        }}
        rows={10}
      />
    </div>
  );
}

/* ========== Config Router ========== */
function getConfigComponent(
  nodeType: WorkflowNodeType,
  config: Record<string, unknown>,
  onChange: (config: Record<string, unknown>) => void
) {
  switch (nodeType) {
    case "agent":
      return <AIAgentConfig config={config} onChange={onChange} />;
    case "llm_prompt":
      return <LLMPromptConfig config={config} onChange={onChange} />;
    case "computer_use":
      return <ComputerUseConfig config={config} onChange={onChange} />;
    case "code_sandbox":
      return <CodeSandboxConfig config={config} onChange={onChange} />;
    case "agent_swarm":
      return <AgentSwarmConfig config={config} onChange={onChange} />;
    case "trigger_webhook":
    case "trigger_schedule":
    case "trigger_lead":
    case "trigger_chat":
    case "trigger_manual":
      return <TriggerConfig config={config} onChange={onChange} nodeType={nodeType} />;
    case "if_condition":
    case "filter":
      return <ConditionConfig config={config} onChange={onChange} />;
    case "http_request":
      return <HTTPRequestConfig config={config} onChange={onChange} />;
    case "send_email":
    case "gmail_send":
      return <EmailConfig config={config} onChange={onChange} />;
    case "send_slack":
    case "slack_send_integration":
      return <SlackConfig config={config} onChange={onChange} />;
    case "delay":
      return <DelayConfig config={config} onChange={onChange} />;
    case "loop":
      return <LoopConfig config={config} onChange={onChange} />;
    case "deep_research":
      return <DeepResearchConfig config={config} onChange={onChange} />;
    case "mcp_tool":
      return <MCPToolConfig config={config} onChange={onChange} />;
    case "switch":
      return <SwitchConfig config={config} onChange={onChange} />;
    case "transform":
      return <TransformConfig config={config} onChange={onChange} />;
    case "set_variable":
      return <SetVariableConfig config={config} onChange={onChange} />;
    case "parallel_split":
      return <ParallelSplitConfig config={config} onChange={onChange} />;
    case "parallel_merge":
      return <ParallelMergeConfig config={config} onChange={onChange} />;
    case "approval_gate":
      return <ApprovalGateConfig config={config} onChange={onChange} />;
    case "wait_webhook":
      return <WaitWebhookConfig config={config} onChange={onChange} />;
    case "wait_form":
      return <WaitFormConfig config={config} onChange={onChange} />;
    case "sub_workflow":
      return <SubWorkflowConfig config={config} onChange={onChange} />;
    case "merge":
      return <MergeConfig config={config} onChange={onChange} />;
    case "google_sheets_read":
      return <GoogleSheetsReadConfig config={config} onChange={onChange} />;
    case "google_sheets_write":
      return <GoogleSheetsWriteConfig config={config} onChange={onChange} />;
    case "gmail_send":
      return <GmailSendConfig config={config} onChange={onChange} />;
    case "calendar_create":
      return <CalendarCreateConfig config={config} onChange={onChange} />;
    case "calendar_check":
      return <CalendarCheckConfig config={config} onChange={onChange} />;
    case "notion_create":
      return <NotionCreateConfig config={config} onChange={onChange} />;
    case "airtable_create":
      return <AirtableCreateConfig config={config} onChange={onChange} />;
    case "data_query":
      return <DataQueryConfig config={config} onChange={onChange} />;
    case "ai_summarize":
      return <AISummarizeConfig config={config} onChange={onChange} />;
    case "ai_classify":
      return <AIClassifyConfig config={config} onChange={onChange} />;
    case "ai_extract":
      return <AIExtractConfig config={config} onChange={onChange} />;
    case "diff_detection":
      return <DiffDetectionConfig config={config} onChange={onChange} />;
    case "multi_site":
      return <MultiSiteConfig config={config} onChange={onChange} />;
    case "goal_trigger":
      return <GoalTriggerConfig config={config} onChange={onChange} />;
    case "spawn_helper":
      return <SpawnHelperConfig config={config} onChange={onChange} />;
    case "a2a_call":
      return <A2ACallConfig config={config} onChange={onChange} />;
    default:
      return <GenericConfig config={config} onChange={onChange} />;
  }
}

/* ========== Node Type Labels ========== */
const nodeTypeLabels: Partial<Record<WorkflowNodeType, { icon: string; color: string }>> = {
  agent: { icon: "Bot", color: "#F97316" },
  llm_prompt: { icon: "MessageSquare", color: "#F97316" },
  trigger_webhook: { icon: "Globe", color: "#F59E0B" },
  trigger_schedule: { icon: "Clock", color: "#F59E0B" },
  trigger_manual: { icon: "Zap", color: "#F59E0B" },
  trigger_lead: { icon: "UserPlus", color: "#F59E0B" },
  trigger_chat: { icon: "MessageSquare", color: "#F59E0B" },
  if_condition: { icon: "GitBranch", color: "#8B5CF6" },
  switch: { icon: "GitFork", color: "#8B5CF6" },
  filter: { icon: "Filter", color: "#8B5CF6" },
  transform: { icon: "Shuffle", color: "#8B5CF6" },
  loop: { icon: "GitBranch", color: "#8B5CF6" },
  http_request: { icon: "Globe", color: "#3B82F6" },
  send_email: { icon: "Mail", color: "#3B82F6" },
  send_slack: { icon: "Hash", color: "#3B82F6" },
  delay: { icon: "Timer", color: "#3B82F6" },
  computer_use: { icon: "Monitor", color: "#EC4899" },
  deep_research: { icon: "Search", color: "#EC4899" },
  code_sandbox: { icon: "Terminal", color: "#22C55E" },
  agent_swarm: { icon: "Layers", color: "#A855F7" },
  mcp_tool: { icon: "Plug", color: "#3B82F6" },
  set_variable: { icon: "Variable", color: "#8B5CF6" },
  parallel_split: { icon: "GitFork", color: "#8B5CF6" },
  parallel_merge: { icon: "GitMerge", color: "#8B5CF6" },
  approval_gate: { icon: "ShieldCheck", color: "#F59E0B" },
  wait_webhook: { icon: "Globe", color: "#F59E0B" },
  wait_form: { icon: "FileText", color: "#F59E0B" },
  sub_workflow: { icon: "Workflow", color: "#8B5CF6" },
  merge: { icon: "GitMerge", color: "#8B5CF6" },
  google_sheets_read: { icon: "Sheet", color: "#22C55E" },
  google_sheets_write: { icon: "Sheet", color: "#22C55E" },
  gmail_send: { icon: "Mail", color: "#3B82F6" },
  calendar_create: { icon: "Calendar", color: "#3B82F6" },
  calendar_check: { icon: "Calendar", color: "#3B82F6" },
  notion_create: { icon: "FileText", color: "#3B82F6" },
  airtable_create: { icon: "Database", color: "#3B82F6" },
  data_query: { icon: "Database", color: "#3B82F6" },
  ai_summarize: { icon: "FileText", color: "#F97316" },
  ai_classify: { icon: "Tags", color: "#F97316" },
  ai_extract: { icon: "Scissors", color: "#F97316" },
  diff_detection: { icon: "Eye", color: "#EC4899" },
  multi_site: { icon: "Globe", color: "#EC4899" },
  goal_trigger: { icon: "Target", color: "#22C55E" },
  spawn_helper: { icon: "Plus", color: "#A855F7" },
  a2a_call: { icon: "Radio", color: "#A855F7" },
};

/* ========== Main Panel Component ========== */
export function NodeConfigPanel({
  nodeId,
  nodeType,
  label,
  config,
  onConfigChange,
  onLabelChange,
  onDelete,
  onClose,
  onTestNode,
  lastRunResult,
  lastRunInput,
}: NodeConfigPanelProps) {
  const [activeTab, setActiveTab] = useState<"config" | "input" | "output">("config");
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleConfigChange = useCallback(
    (newConfig: Record<string, unknown>) => {
      onConfigChange(nodeId, newConfig);
    },
    [nodeId, onConfigChange]
  );

  const typeMeta = nodeTypeLabels[nodeType];
  const TypeIcon = typeMeta ? iconMap[typeMeta.icon] || Zap : Zap;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-0 z-30 flex h-full w-[400px] flex-col border-l border-[#332f2b] bg-[#1a1918] shadow-2xl animate-in slide-in-from-right duration-200"
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[#332f2b] px-4 py-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${typeMeta?.color || "#F97316"}15` }}
        >
          <TypeIcon className="h-4 w-4" style={{ color: typeMeta?.color || "#F97316" }} />
        </div>
        <div className="min-w-0 flex-1">
          <input
            value={label}
            onChange={(e) => onLabelChange(nodeId, e.target.value)}
            className="w-full bg-transparent text-sm font-semibold text-zinc-100 outline-none border-none focus:ring-0 truncate"
            spellCheck={false}
          />
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{nodeType.replace(/_/g, " ")}</p>
        </div>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-[#332f2b] hover:text-zinc-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#332f2b]">
        {(["config", "input", "output"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 py-2 text-xs font-medium transition-colors",
              activeTab === tab
                ? "text-orange-400 border-b-2 border-orange-500"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            {tab === "config" ? "Configuration" : tab === "input" ? "Input" : "Output"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin">
        {activeTab === "config" && (
          <div className="space-y-4">
            {getConfigComponent(nodeType, config, handleConfigChange)}
          </div>
        )}

        {activeTab === "input" && (
          <div className="space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Data from connected upstream nodes
            </p>
            {lastRunInput ? (
              <pre className="rounded-lg border border-[#332f2b] bg-[#1e1d1b] p-3 text-xs text-zinc-300 font-mono overflow-auto max-h-[400px]">
                {typeof lastRunInput === "string"
                  ? lastRunInput
                  : JSON.stringify(lastRunInput, null, 2)}
              </pre>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1e1d1b] border border-[#332f2b] mb-3">
                  <Zap className="h-5 w-5 text-zinc-500" />
                </div>
                <p className="text-xs text-zinc-500">No input data yet.</p>
                <p className="text-[10px] text-zinc-500 mt-1">Run the workflow to see input data.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "output" && (
          <div className="space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Last execution result
            </p>
            {lastRunResult ? (
              <pre className="rounded-lg border border-[#332f2b] bg-[#1e1d1b] p-3 text-xs text-zinc-300 font-mono overflow-auto max-h-[400px]">
                {typeof lastRunResult === "string"
                  ? lastRunResult
                  : JSON.stringify(lastRunResult, null, 2)}
              </pre>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1e1d1b] border border-[#332f2b] mb-3">
                  <Play className="h-5 w-5 text-zinc-500" />
                </div>
                <p className="text-xs text-zinc-500">No output data yet.</p>
                <p className="text-[10px] text-zinc-500 mt-1">Test this node or run the workflow.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex items-center gap-2 border-t border-[#332f2b] px-4 py-3">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onTestNode?.(nodeId)}
          className="flex-1 bg-[#1e1d1b] border-[#3d3935] text-zinc-300 hover:text-zinc-100 hover:bg-[#2a2826] text-xs"
        >
          <Play className="h-3.5 w-3.5 mr-1.5" />
          Test Node
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (confirm("Delete this node?")) onDelete(nodeId);
          }}
          className="bg-[#1e1d1b] border-[#3d3935] text-red-400 hover:text-red-300 hover:bg-red-500/10 hover:border-red-500/30 text-xs"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
