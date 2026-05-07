"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  Handle,
  Position,
  NodeProps,
  EdgeProps,
  Node,
  Edge,
  Connection,
  useReactFlow,
  getBezierPath,
  BaseEdge,
  EdgeLabelRenderer,
  MarkerType,
  useNodesState,
  useEdgesState,
  addEdge,
  Panel,
  SelectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  BookOpen,
  Database,
  Loader2,
  MessageSquare,
  X,
  Zap,
  Check,
  GitBranch,
  Sparkles,
  LayoutGrid,
  ChevronRight,
  ChevronDown,
  Globe,
  Clock,
  UserPlus,
  Play,
  GitFork,
  Filter,
  Mail,
  Hash,
  Timer,
  Variable,
  ShieldCheck,
  Pause,
  Layers,
  Merge,
  Bot,
  PanelLeftClose,
  PanelLeft,
  Shield,
  Shuffle,
  FileText,
  Table,
  TableProperties,
  CalendarPlus,
  CalendarSearch,
  Plug,
  Tags,
  FileSearch,
  Search,
  Monitor,
  Radio,
  Target,
  Eye,
  Terminal,
  Undo2,
  Redo2,
  Plus,
  Copy,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Trash2,
  StickyNote,
  Power,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getModelDef } from "@/lib/ai";
import { Button } from "@/components/ui/button";
import {
  WORKFLOW_CATEGORIES,
  WORKFLOW_NODE_DEFINITIONS,
  type WorkflowNodeType,
  type WorkflowNodeCategory,
  type WorkflowNodeDefinition,
  createWorkflowNode,
} from "@/lib/workflow-node-types";
import { NodeConfigPanel } from "./node-config-panel";
import { CanvasErrorBoundary, NodeErrorBoundary } from "./canvas-error-boundary";
import { getNodeIcon } from "@/components/workflows/node-icons";
import { NodeSearch } from "@/components/workflows/node-search";
import { CanvasContextMenu, type CanvasContextMenuItem } from "@/components/workflows/canvas-context-menu";
import {
  boundingTopLeft,
  pickInternalEdges,
  shouldConfirmBulkDelete,
  PASTE_OFFSET_PX,
} from "@/lib/canvas-clipboard";
import { ExecutionTimelinePanel, type ExecutionTimelineData, type TimelineNodeEntry } from "@/components/workflows/execution-timeline";

/* ========== Types ========== */
interface OutputSchemaField {
  field: string;
  type: "string" | "number" | "boolean";
  description: string;
}

interface TeamAgent {
  id: string;
  name: string;
  slug: string;
  description?: string;
  llmModel?: string;
  modelProvider?: string;
  mode?: "CHAT" | "TASK";
}

interface TeamMember {
  id: string;
  agentId?: string | null;
  agent: TeamAgent | null;
  fallbackAgentId?: string | null;
  fallbackAgent?: TeamAgent | null;
  fallbackModel?: string | null;
  fallbackEnabled?: boolean;
  maxRetries?: number;
  role: "HEAD" | "COORDINATOR" | "EXECUTOR" | "REPORTER" | "APPROVAL_GATE";
  level: number;
  responsibilities?: string;
  config?: Record<string, unknown> | null;
  reportsToMemberId?: string | null;
  reportsTo?: { id: string; agent: { id: string; name: string } | null } | null;
  subordinates?: { id: string; agent: { id: string; name: string } | null }[];
  outputSchema?: OutputSchemaField[] | null;
  enabledActions?: string[];
  feedbackLoop?: { targetMemberId: string; maxIterations: number; qualityField: string; qualityThreshold: number } | null;
  executionMode?: string;
  createdAt: string;
}

interface ExecutionStep {
  memberId: string;
  status:
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "skipped"
    | "awaiting_approval";
}

interface VisualTeamEditorProps {
  teamId: string;
  members: TeamMember[];
  onNodeClick: (memberId: string) => void;
  onConnectionCreate?: (sourceMemberId: string, targetMemberId: string) => void;
  onConnectionDelete?: (sourceMemberId: string, targetMemberId: string) => void;
  executionSteps?: ExecutionStep[];
  savedPositions?: Record<string, { x: number; y: number }>;
  onPositionsChange?: (positions: Record<string, { x: number; y: number }>) => void;
  teamKnowledgeCount?: number;
  workflowNodes?: { id: string; type: WorkflowNodeType; label: string; position: { x: number; y: number }; config: Record<string, unknown> }[];
  workflowEdges?: { sourceId: string; targetId: string; condition?: string; sourceHandle?: string; mappings?: { source: string; target: string; expression?: string }[] }[];
  onWorkflowNodesChange?: (nodes: { id: string; type: WorkflowNodeType; label: string; position: { x: number; y: number }; config: Record<string, unknown> }[]) => void;
  onWorkflowEdgesChange?: (edges: { sourceId: string; targetId: string; condition?: string; sourceHandle?: string; mappings?: { source: string; target: string; expression?: string }[] }[]) => void;
  onWorkflowNodeClick?: (nodeId: string, nodeType: WorkflowNodeType, config: Record<string, unknown>) => void;
  onEdgeClick?: (edgeId: string, sourceNodeId: string, targetNodeId: string) => void;
  onVariablesClick?: () => void;
  onRunWorkflow?: () => void;
  executionStatus?: "idle" | "running" | "completed" | "failed";
  executionDuration?: number;
  executionCredits?: number;
  nodeResults?: Record<string, { input?: unknown; output?: unknown; status?: "completed" | "failed" | "running"; durationMs?: number; credits?: number; error?: string; nodeLabel?: string; nodeType?: string; meta?: Record<string, unknown> }>;
  executionLogs?: Array<{ timestamp: string; level: "info" | "warn" | "error" | "success"; message: string; nodeId?: string }>;
}

/* ========== Constants ========== */
const roleColors: Record<string, { bg: string; text: string; border: string; hex: string }> = {
  HEAD: { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/40", hex: "#F97316" },
  COORDINATOR: { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/40", hex: "#3B82F6" },
  EXECUTOR: { bg: "bg-green-500/15", text: "text-green-400", border: "border-green-500/40", hex: "#22C55E" },
  REPORTER: { bg: "bg-purple-500/15", text: "text-purple-400", border: "border-purple-500/40", hex: "#A855F7" },
  APPROVAL_GATE: { bg: "bg-amber-500/15", text: "text-amber-300", border: "border-amber-500/40", hex: "#F59E0B" },
};

const workflowNodeColors: Record<WorkflowNodeCategory, { hex: string }> = {
  triggers: { hex: "#F59E0B" },
  agents: { hex: "#F97316" },
  logic: { hex: "#8B5CF6" },
  actions: { hex: "#3B82F6" },
  control: { hex: "#06B6D4" },
  integrations: { hex: "#22C55E" },
  ai_tools: { hex: "#EC4899" },
  advanced: { hex: "#A855F7" },
};

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Globe, Clock, UserPlus, MessageSquare, Play, Bot, GitBranch, GitFork,
  Filter, Mail, Hash, Timer, Variable, ShieldCheck, Pause, Layers, Merge,
  Zap, Shield, Shuffle, FileText,
  Table, TableProperties, CalendarPlus, CalendarSearch, Database, Plug,
  Sparkles, Tags, FileSearch, Monitor, Radio, Search,
  Target, Eye, Terminal, StickyNote, Users,
};

const NODE_WIDTH = 240;
const NODE_HEIGHT = 80;

/* ========== Handle Styles ========== */
const handleBase = "!border-[2px] !border-border !rounded-full transition-colors";
const handleInput = `${handleBase} !bg-muted-foreground hover:!bg-orange-400`;
const handleOutput = `${handleBase} !bg-muted-foreground hover:!bg-orange-400`;

/* ========== Dagre auto-layout ========== */
function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR" = "LR"
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 60,
    ranksep: 100,
    marginx: 40,
    marginy: 40,
  });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });
  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const dagreNode = g.node(node.id);
    return {
      ...node,
      position: {
        x: dagreNode.x - NODE_WIDTH / 2,
        y: dagreNode.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

/* ========== Custom Node: Agent (n8n-style) ========== */
type VisualNodeData = {
  label: string;
  role: string;
  agentName: string;
  responsibilities: string;
  llmModel?: string;
  mode?: string;
  enabledActionsCount?: number;
  hasOutputSchema?: boolean;
  hasFeedbackLoop?: boolean;
  isParallel?: boolean;
  schemaFields?: string[];
  executionStatus?: "pending" | "running" | "completed" | "failed" | "skipped" | "awaiting_approval";
  [key: string]: unknown;
};

function VisualAgentNode({ data, selected }: NodeProps<Node<VisualNodeData>>) {
  const role = data.role as string;
  const rc = roleColors[role] || roleColors.EXECUTOR;
  const execStatus = data.executionStatus as string | undefined;

  const statusClasses = execStatus === "running"
    ? "ring-2 ring-blue-400/60 ring-offset-1 ring-offset-[#1e1d1b]"
    : execStatus === "completed"
      ? "ring-2 ring-green-400/60 ring-offset-1 ring-offset-[#1e1d1b]"
      : execStatus === "awaiting_approval"
        ? "ring-2 ring-amber-300/60 ring-offset-1 ring-offset-[#1e1d1b]"
        : execStatus === "failed"
          ? "ring-2 ring-red-400/60 ring-offset-1 ring-offset-[#1e1d1b]"
          : "";

  const modelDef = data.llmModel ? getModelDef(data.llmModel as string) : null;

  return (
    <div
      className={cn(
        "rounded-xl bg-muted border border-foreground/20 shadow-lg w-[240px] max-w-[280px] transition-all duration-150",
        selected && "border-orange-500/70 shadow-orange-500/10 shadow-xl",
        statusClasses,
        execStatus === "running" && "animate-pulse",
      )}
    >
      {/* Input handle — left */}
      <Handle
        type="target"
        position={Position.Left}
        className={cn(handleInput, "!-left-[5px]")}
      />

      {/* Header row: icon + name + model */}
      <div className="flex items-start gap-2.5 px-3 pt-3 pb-1">
        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", rc.bg)}>
          <Bot className={cn("h-4 w-4", rc.text)} />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="text-[13px] font-semibold text-foreground truncate leading-tight"
            title={data.agentName}
          >
            {data.agentName}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={cn("text-[9px] font-bold uppercase tracking-wider", rc.text)}>{role}</span>
            {execStatus && execStatus !== "pending" && (
              <span className={cn(
                "text-[8px] font-medium px-1 py-0.5 rounded flex items-center gap-0.5",
                execStatus === "running" && "bg-blue-500/15 text-blue-400",
                execStatus === "completed" && "bg-green-500/15 text-green-400",
                execStatus === "awaiting_approval" && "bg-amber-500/15 text-amber-300",
                execStatus === "failed" && "bg-red-500/15 text-red-400",
                execStatus === "skipped" && "bg-muted/40 text-muted-foreground",
              )}>
                {execStatus === "running" && <Loader2 className="h-2 w-2 animate-spin" />}
                {execStatus === "completed" && <Check className="h-2 w-2" />}
                {execStatus === "failed" && <X className="h-2 w-2" />}
                {execStatus}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Badges row */}
      <div className="flex items-center gap-1 px-3 pb-2.5 flex-wrap">
        {modelDef && (
          <span className="text-[9px] bg-card text-muted-foreground px-1.5 py-0.5 rounded border border-foreground/20">
            {modelDef.shortLabel}
          </span>
        )}
        {data.hasOutputSchema && (
          <span className="text-[9px] bg-violet-500/10 text-violet-400 px-1.5 py-0.5 rounded flex items-center gap-0.5">
            <Database className="h-2 w-2" /> JSON
          </span>
        )}
        {typeof data.enabledActionsCount === "number" && data.enabledActionsCount > 0 && (
          <span className="text-[9px] bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded flex items-center gap-0.5">
            <Zap className="h-2 w-2" /> {data.enabledActionsCount}
          </span>
        )}
        {data.hasFeedbackLoop && (
          <span className="text-[9px] bg-cyan-500/10 text-cyan-400 px-1.5 py-0.5 rounded flex items-center gap-0.5">
            <GitBranch className="h-2 w-2" /> Loop
          </span>
        )}
        {data.isParallel && (
          <span className="text-[9px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded">
            Parallel
          </span>
        )}
      </div>

      {/* Output handle — right */}
      <Handle
        type="source"
        position={Position.Right}
        className={cn(handleOutput, "!-right-[5px]")}
      />
    </div>
  );
}

/* ========== Custom Node: Workflow Node (n8n-style) ========== */
type WorkflowNodeData = {
  label: string;
  nodeType: WorkflowNodeType;
  category: WorkflowNodeCategory;
  description: string;
  iconName: string;
  config: Record<string, unknown>;
  hasErrorPath?: boolean;
  execStatus?: "completed" | "failed" | "running" | "skipped" | "pending";
  execError?: string;
  execDurationMs?: number;
  execCredits?: number;
  skippedReason?: string;
  [key: string]: unknown;
};

function WorkflowNodeComponent({ data, selected }: NodeProps<Node<WorkflowNodeData>>) {
  const category = data.category as WorkflowNodeCategory;
  const colors = workflowNodeColors[category] || workflowNodeColors.actions;
  const IconComp = iconMap[data.iconName as string] || Zap;
  const nodeType = data.nodeType as WorkflowNodeType;
  const isLogicNode = category === "logic";
  const isTriggerNode = category === "triggers";
  const execStatus = data.execStatus as WorkflowNodeData["execStatus"];
  const durationMs = data.execDurationMs as number | undefined;

  // Format duration for badge
  const durationLabel = durationMs !== undefined
    ? durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`
    : "";

  // Execution status ring classes
  const statusRing = execStatus === "running"
    ? "ring-2 ring-orange-400/60 ring-offset-1 ring-offset-[#1e1d1b]"
    : execStatus === "completed"
      ? "ring-2 ring-green-400/40 ring-offset-1 ring-offset-[#1e1d1b]"
      : execStatus === "failed"
        ? "ring-2 ring-red-400/60 ring-offset-1 ring-offset-[#1e1d1b]"
        : execStatus === "skipped"
          ? "ring-1 ring-dashed ring-zinc-600/40 ring-offset-1 ring-offset-[#1e1d1b] opacity-60"
          : execStatus === "pending"
            ? "ring-1 ring-zinc-600/30 ring-offset-1 ring-offset-[#1e1d1b]"
            : "";

  // Config preview text
  let preview = "";
  if (nodeType === "delay" && data.config) {
    const c = data.config as Record<string, unknown>;
    preview = `${c.duration || 60}${c.unit === "minutes" ? "m" : c.unit === "hours" ? "h" : "s"}`;
  } else if (nodeType === "http_request" && data.config) {
    const c = data.config as Record<string, unknown>;
    preview = `${c.method || "GET"} ${c.url || "..."}`;
  } else if (nodeType === "if_condition" && data.config) {
    const c = data.config as Record<string, unknown>;
    preview = `${c.field || "field"} ${c.operator || "=="} ${c.value || "value"}`;
  }

  const isDisabled = !!data.config?.disabled;
  if (nodeType === "comment") {
    const color = String(data.config?.color || "yellow");
    const colorClass =
      color === "blue"
        ? "bg-blue-200 text-blue-950 border-blue-300"
        : color === "green"
          ? "bg-green-200 text-green-950 border-green-300"
          : color === "orange"
            ? "bg-orange-200 text-orange-950 border-orange-300"
            : "bg-yellow-200 text-yellow-950 border-yellow-300";
    const width = Math.max(180, Math.min(520, Number(data.config?.width) || 260));
    const height = Math.max(120, Math.min(420, Number(data.config?.height) || 160));
    return (
      <div
        className={cn(
          "relative rounded-lg border p-3 shadow-lg transition-all duration-150",
          colorClass,
          selected && "ring-2 ring-orange-500/60"
        )}
        style={{ width, minHeight: height }}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider opacity-70">
            <StickyNote className="h-3 w-3" />
            Comment
          </div>
          {typeof data.config?.authorUserId === "string" && (
            <span className="truncate text-[9px] opacity-60">{data.config.authorUserId}</span>
          )}
        </div>
        <div className="prose prose-sm max-w-none text-current prose-p:my-1 prose-ul:my-1 prose-li:my-0">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {String(data.config?.content || "")}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative rounded-xl bg-muted border border-foreground/20 shadow-lg w-[240px] max-w-[280px] transition-all duration-150",
        selected && "border-orange-500/70 shadow-orange-500/10 shadow-xl",
        statusRing,
        execStatus === "running" && "animate-pulse",
        execStatus === "completed" && "shadow-green-500/5",
        execStatus === "failed" && "shadow-red-500/10",
        isDisabled && "opacity-50 grayscale",
      )}
    >
      {isDisabled && (
        <div className="absolute -top-2 -left-2 flex items-center gap-0.5 rounded-full bg-muted border border-border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-muted-foreground shadow-md z-10">
          <Power className="h-2 w-2" /> Disabled
        </div>
      )}
      {/* Execution status badge — top-right corner */}
      {execStatus && execStatus !== "pending" && (
        <div className={cn(
          "absolute -top-2 -right-2 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-bold shadow-md border z-10",
          execStatus === "completed" && "bg-green-500/15 text-green-400 border-green-500/30 backdrop-blur-sm",
          execStatus === "failed" && "bg-red-500/15 text-red-400 border-red-500/30 backdrop-blur-sm",
          execStatus === "running" && "bg-orange-500/15 text-orange-400 border-orange-500/30 backdrop-blur-sm",
          execStatus === "skipped" && "bg-muted/50 text-muted-foreground border-border backdrop-blur-sm",
        )}>
          {execStatus === "completed" && <><Check className="h-2.5 w-2.5" /> {durationLabel}</>}
          {execStatus === "failed" && <><X className="h-2.5 w-2.5" /> Error</>}
          {execStatus === "running" && <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Running</>}
          {execStatus === "skipped" && <>⊘ Skip</>}
        </div>
      )}
      {execStatus === "pending" && (
        <div className="absolute -top-2 -right-2 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-medium bg-muted/80 text-muted-foreground border border-border/30 backdrop-blur-sm shadow-md z-10">
          ⏳ Waiting
        </div>
      )}

      {/* Input handle — left (not for triggers) */}
      {!isTriggerNode && (
        <Handle
          type="target"
          position={Position.Left}
          className={cn(handleInput, "!-left-[5px]")}
        />
      )}

      {/* Content */}
      <div className="flex items-start gap-2.5 px-3 py-3">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${colors.hex}15` }}
        >
          {getNodeIcon(nodeType, "h-4 w-4") || <span style={{ color: colors.hex }}><IconComp className="h-4 w-4" /></span>}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="text-[13px] font-semibold text-foreground truncate leading-tight"
            title={data.label as string}
          >
            {data.label as string}
          </p>
          <p
            className="text-[10px] text-muted-foreground truncate mt-0.5"
            style={{ color: `${colors.hex}99` }}
            title={data.description as string}
          >
            {data.description as string}
          </p>
        </div>
      </div>

      {/* Config preview (only when idle or pending) */}
      {preview && !execStatus && (
        <div className="px-3 pb-2.5 -mt-1">
          <p className="text-[10px] font-mono text-muted-foreground truncate bg-card rounded px-2 py-1 border border-foreground/20/50">
            {preview}
          </p>
        </div>
      )}

      {/* Success summary — brief output preview */}
      {execStatus === "completed" && durationLabel && (
        <div className="px-3 pb-2.5 -mt-1">
          <p className="text-[10px] text-green-400/70 truncate bg-green-500/5 rounded px-2 py-1 border border-green-500/10">
            ✓ {durationLabel}{data.execCredits ? `, ${data.execCredits} cr` : ""}
          </p>
        </div>
      )}

      {/* Error preview — shown below failed nodes */}
      {execStatus === "failed" && data.execError && (
        <div className="px-3 pb-2.5 -mt-1" title={data.execError as string}>
          <p className="text-[10px] text-red-400 truncate bg-red-500/5 rounded px-2 py-1 border border-red-500/15">
            ✕ {(data.execError as string).slice(0, 50)}{(data.execError as string).length > 50 ? "…" : ""}
          </p>
        </div>
      )}

      {/* Skipped state — upstream node failed */}
      {execStatus === "skipped" && (
        <div className="px-3 pb-2.5 -mt-1">
          <p className="text-[10px] text-muted-foreground italic truncate bg-card rounded px-2 py-1 border border-foreground/20/50">
            {data.skippedReason ? `Skipped — ${data.skippedReason}` : "Skipped — upstream node failed"}
          </p>
        </div>
      )}

      {/* Output handles — right side */}
      {nodeType === "parallel_split" ? (
        <>
          {Array.from({ length: Math.max(2, Math.min(5, Number(data.config?.branches) || 3)) }).map((_, index, list) => {
            const top = `${((index + 1) / (list.length + 1)) * 100}%`;
            return (
              <div key={index}>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`branch_${index}`}
                  className="!border-[2px] !border-border !rounded-full !bg-blue-500 !-right-[5px]"
                  style={{ top }}
                />
                <div className="absolute right-3 text-[7px] font-bold text-blue-400/80" style={{ top: `calc(${top} - 5px)` }}>
                  {index + 1}
                </div>
              </div>
            );
          })}
        </>
      ) : isLogicNode ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            className="!border-[2px] !border-border !rounded-full !bg-green-500 !-right-[5px]"
            style={{ top: "35%" }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            className="!border-[2px] !border-border !rounded-full !bg-red-500 !-right-[5px]"
            style={{ top: "65%" }}
          />
          {/* Labels for true/false */}
          <div className="absolute right-3 top-[27%] text-[7px] font-bold text-green-500/70">T</div>
          <div className="absolute right-3 top-[58%] text-[7px] font-bold text-red-400/70">F</div>
        </>
      ) : (
        <>
          <Handle
            type="source"
            position={Position.Right}
            className={cn(handleOutput, "!-right-[5px]")}
          />
          {/* Error output handle */}
          {!isTriggerNode && (
            <Handle
              type="source"
              position={Position.Right}
              id="error"
              className="!w-[7px] !h-[7px] !min-w-[7px] !min-h-[7px] !border-[1.5px] !border-border !rounded-full !bg-red-500/60 hover:!bg-red-400 !-right-[4px]"
              style={{ top: "75%" }}
            />
          )}
          {data.hasErrorPath && (
            <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500/80" />
          )}
        </>
      )}
    </div>
  );
}

/* ========== Team Knowledge Node ========== */
type KnowledgeNodeData = {
  label: string;
  docCount: number;
  [key: string]: unknown;
};

type FallbackNodeData = {
  label: string;
  agentName: string;
  llmModel?: string;
  [key: string]: unknown;
};

function TeamKnowledgeNode({ data }: NodeProps<Node<KnowledgeNodeData>>) {
  return (
    <div className="rounded-xl bg-muted border border-cyan-500/30 shadow-lg w-[220px] max-w-[280px]">
      <Handle
        type="source"
        position={Position.Right}
        className="!border-[2px] !border-border !rounded-full !bg-cyan-500 !-right-[5px]"
      />
      <div className="flex items-start gap-2.5 px-3 py-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15">
          <BookOpen className="h-4 w-4 text-cyan-400" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground truncate">Workflow Knowledge</p>
          <p className="text-[10px] text-cyan-400/70 mt-0.5">
            {data.docCount} {data.docCount === 1 ? "Dokument" : "Dokumente"}
          </p>
        </div>
      </div>
    </div>
  );
}

function FallbackGhostNode({ data }: NodeProps<Node<FallbackNodeData>>) {
  const model = typeof data.llmModel === "string" ? getModelDef(data.llmModel) : null;

  return (
    <div className="rounded-xl border border-dashed border-orange-500/30 bg-muted/80 shadow-lg w-[240px] max-w-[280px] opacity-90">
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="!border-[2px] !border-border !rounded-full !bg-orange-400 !-left-[5px]"
      />
      <div className="flex items-start gap-2.5 px-3 py-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-500/15">
          <AlertTriangle className="h-4 w-4 text-orange-300" />
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-wider text-orange-300">Fallback</p>
          <p className="truncate text-[13px] font-semibold text-foreground" title={data.agentName}>{data.agentName}</p>
          {model && <p className="text-[10px] text-muted-foreground mt-0.5">{model.shortLabel}</p>}
        </div>
      </div>
    </div>
  );
}

/* ========== Custom Animated Edge ========== */
function AnimatedConnectionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceHandleId,
  data,
  selected,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.25,
  });
  const [dataPopupOpen, setDataPopupOpen] = useState(false);

  const isExecuting = data?.executionActive as boolean;
  const isFallback = data?.isFallback as boolean;
  const isErrorEdge = data?.isErrorEdge as boolean;
  const flowData = data?.flowData as unknown;
  const flowStatus = data?.flowStatus as "success" | "error" | "none" | undefined;
  const schemaMismatch = data?.schemaMismatch as boolean | undefined;
  const mappingCount = (data?.mappingCount as number | undefined) || 0;
  const dataLabel = data?.dataLabel as string | undefined;

  // Branching-logic source handles (true/false) get distinct edge tints
  // and persistent labels so users can read flow direction at a glance.
  const isTrueBranch = sourceHandleId === "true";
  const isFalseBranch = sourceHandleId === "false";
  // Switch-case branches: handle id like "case-0", "case-1", "default"
  const isSwitchCase = !!sourceHandleId && sourceHandleId.startsWith("case-");
  const isSwitchDefault = sourceHandleId === "default";
  const branchLabel = isTrueBranch
    ? "true"
    : isFalseBranch
      ? "false"
      : isSwitchCase
        ? (data?.caseLabel as string) || sourceHandleId.replace("case-", "Case ")
        : isSwitchDefault
          ? "default"
          : null;

  // Edge color based on execution flow. The schema-mismatch warning
  // colour is amber (#F59E0B) so it's visually distinct from both the
  // error red and the executing orange — a "needs attention but not
  // broken" state. Branch edges (true/false) use green/red tints by
  // default — execution colours still take priority when active.
  const strokeColor = isErrorEdge
    ? "#EF4444"
    : isFallback
      ? "#FB923C"
      : isExecuting
        ? "#F97316"
        : flowStatus === "success"
          ? "#22C55E"
          : flowStatus === "error"
            ? "#EF4444"
            : selected
              ? "#F97316"
              : schemaMismatch
                ? "#F59E0B"
                : isTrueBranch
                  ? "#22C55E80"
                  : isFalseBranch
                    ? "#EF444480"
                    : "#4a4540";

  // Data preview for the midpoint badge
  const dataPreview = flowData
    ? typeof flowData === "string"
      ? flowData.slice(0, 30)
      : JSON.stringify(flowData).slice(0, 30)
    : null;

  return (
    <>
      {/* Glow for executing edges */}
      {isExecuting && (
        <BaseEdge
          id={`${id}-glow`}
          path={edgePath}
          style={{ stroke: "#F97316", strokeWidth: 6, filter: "blur(4px)", opacity: 0.35 }}
        />
      )}

      {/* Glow for successful data flow */}
      {flowStatus === "success" && !isExecuting && (
        <BaseEdge
          id={`${id}-flow-glow`}
          path={edgePath}
          style={{ stroke: "#22C55E", strokeWidth: 4, filter: "blur(3px)", opacity: 0.15 }}
        />
      )}

      {/* Main edge */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth: selected ? 2.5 : isExecuting ? 2.5 : flowStatus ? 2 : 1.5,
          strokeDasharray: isErrorEdge ? "6 4" : isFallback ? "5 5" : isExecuting ? "8 4" : undefined,
          animation: isExecuting ? "dashmove 0.5s linear infinite" : undefined,
        }}
        markerEnd={MarkerType.ArrowClosed}
      />

      {/* Data flow badge at edge midpoint */}
      {flowData && dataPreview && !isExecuting && (
        <EdgeLabelRenderer>
          <div
            className="absolute pointer-events-auto"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + 16}px)` }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); setDataPopupOpen(!dataPopupOpen); }}
              className={cn(
                "rounded border px-1.5 py-0.5 text-[8px] font-mono transition-all truncate max-w-[120px] block",
                flowStatus === "success"
                  ? "bg-green-500/10 border-green-500/20 text-green-400/80 hover:text-green-300 hover:border-green-500/40"
                  : flowStatus === "error"
                    ? "bg-red-500/10 border-red-500/20 text-red-400/80 hover:text-red-300"
                    : "bg-muted border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {dataPreview}{dataPreview.length >= 30 ? "…" : ""}
            </button>

            {/* Expanded data popup */}
            {dataPopupOpen && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-[280px] rounded-lg border border-foreground/20 bg-card shadow-2xl shadow-black/50 z-50 overflow-hidden">
                <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border">
                  <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Data Flow</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(typeof flowData === "string" ? flowData : JSON.stringify(flowData, null, 2));
                    }}
                    className="text-[9px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
                  >
                    <Copy className="h-2.5 w-2.5" />
                    Copy
                  </button>
                </div>
                <pre className="p-2.5 text-[10px] text-foreground font-mono overflow-auto max-h-[180px] scrollbar-thin">
                  {typeof flowData === "string" ? flowData : JSON.stringify(flowData, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Condition label pill */}
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "absolute pointer-events-auto rounded-full border px-2 py-0.5 text-[9px] font-medium transition-all cursor-pointer",
              selected
                ? "bg-orange-500/15 border-orange-500/40 text-orange-400"
                : isFallback
                  ? "bg-orange-500/10 border-orange-500/20 text-orange-300"
                  : "bg-muted border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            )}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {data.label as string}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Branch label — always-visible pill for if/switch outputs so
          flow direction is readable without hovering. Skipped when a
          custom condition label already takes the spot. */}
      {branchLabel && !data?.label && !isErrorEdge && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "absolute pointer-events-none rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-all",
              isTrueBranch
                ? "bg-green-500/15 border-green-500/40 text-green-400"
                : isFalseBranch
                  ? "bg-red-500/15 border-red-500/40 text-red-400"
                  : "bg-violet-500/15 border-violet-500/40 text-violet-300"
            )}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 14}px)` }}
          >
            {branchLabel}
          </div>
        </EdgeLabelRenderer>
      )}
      {isErrorEdge && !data?.label && (
        <EdgeLabelRenderer>
          <div
            className="absolute pointer-events-none rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[8px] font-medium text-red-400"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            error
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Schema-flow indicator. Three states:
          - schemaMismatch (amber): target consumes input but no mappings
          - mappingCount > 0 (green): explicit field mappings configured
          - else: nothing rendered (avoid visual noise on trivial edges)
          The pill is pointer-events-none — clicking the edge itself
          (handled at the ReactFlow level) opens the data mapper. */}
      {!isExecuting && !flowStatus && !data?.label && !isErrorEdge && (schemaMismatch || mappingCount > 0) && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "absolute pointer-events-none rounded-full border px-1.5 py-0.5 text-[8px] font-medium",
              schemaMismatch
                ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                : "bg-green-500/10 border-green-500/30 text-green-400"
            )}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            title={
              schemaMismatch
                ? "Click the edge to map data fields"
                : `${mappingCount} field${mappingCount === 1 ? "" : "s"} mapped — click to edit`
            }
          >
            {dataLabel}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

/* ========== Error-safe node wrappers ========== */
function SafeWorkflowNode(props: NodeProps<Node<WorkflowNodeData>>) {
  return (
    <NodeErrorBoundary nodeType={String((props.data as WorkflowNodeData)?.nodeType || "unknown")}>
      <WorkflowNodeComponent {...props} />
    </NodeErrorBoundary>
  );
}

/* ========== Node & Edge types ========== */
const nodeTypes = {
  visualAgent: VisualAgentNode,
  workflowNode: SafeWorkflowNode,
  teamKnowledge: TeamKnowledgeNode,
  fallbackGhost: FallbackGhostNode,
};
const edgeTypes = { animated: AnimatedConnectionEdge };

/* ========== Sidebar: Node Palette (n8n-style) ========== */
function NodePaletteSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(WORKFLOW_CATEGORIES.map((c) => c.id))
  );
  const [search, setSearch] = useState("");
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const toggleCategory = (id: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onDragStart = (e: React.DragEvent, def: WorkflowNodeDefinition) => {
    e.dataTransfer.setData("application/kiln-workflow-node", JSON.stringify({
      type: def.type,
      label: def.label,
      category: def.category,
      description: def.description,
      icon: def.icon,
      color: def.color,
      defaultConfig: def.defaultConfig,
    }));
    e.dataTransfer.effectAllowed = "move";
  };

  const searchLower = search.toLowerCase();

  if (collapsed) {
    return (
      <div className="absolute left-0 top-0 z-20 h-full">
        <button
          onClick={onToggle}
          className="m-2.5 flex h-9 w-9 items-center justify-center rounded-lg border border-foreground/20 bg-card text-muted-foreground shadow-md transition-colors hover:bg-muted/40 hover:text-foreground"
          title="Show node palette"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="absolute left-0 top-0 z-20 flex h-full w-[240px] flex-col border-r border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
        <span className="text-xs font-semibold text-foreground">Nodes</span>
        <button
          onClick={onToggle}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nodes..."
            className="w-full bg-card border border-border rounded-lg text-xs text-foreground pl-8 pr-3 py-1.5 outline-none focus:border-orange-500/50 placeholder:text-muted-foreground transition-colors"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {WORKFLOW_CATEGORIES.map((cat) => {
          const isExpanded = expandedCategories.has(cat.id);
          const catNodes = WORKFLOW_NODE_DEFINITIONS.filter((d) => d.category === cat.id);
          const filteredNodes = searchLower
            ? catNodes.filter((d) => d.label.toLowerCase().includes(searchLower) || d.type.toLowerCase().includes(searchLower))
            : catNodes;

          if (searchLower && filteredNodes.length === 0) return null;

          // AI Agents header gets the kiln-orange tint so the
          // headline use case stands out against the otherwise
          // monochrome palette.
          const isAgentsCategory = cat.id === "agents";

          return (
            <div key={cat.id}>
              {/* Category header */}
              <button
                onClick={() => toggleCategory(cat.id)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
                  isAgentsCategory
                    ? "bg-kiln-orange/[0.04] hover:bg-kiln-orange/10"
                    : "hover:bg-muted"
                )}
              >
                {isExpanded ? (
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 shrink-0",
                      isAgentsCategory ? "text-kiln-orange" : "text-muted-foreground"
                    )}
                  />
                ) : (
                  <ChevronRight
                    className={cn(
                      "h-3 w-3 shrink-0",
                      isAgentsCategory ? "text-kiln-orange" : "text-muted-foreground"
                    )}
                  />
                )}
                <span
                  className={cn(
                    "flex-1 text-[10px] font-semibold uppercase tracking-widest",
                    isAgentsCategory ? "text-kiln-orange" : "text-muted-foreground"
                  )}
                >
                  {cat.label}
                </span>
                <span
                  className={cn(
                    "text-[10px]",
                    isAgentsCategory ? "text-kiln-orange/70" : "text-muted-foreground"
                  )}
                >
                  {filteredNodes.length}
                </span>
              </button>

              {/* Thin divider */}
              {!isExpanded && <div className="mx-3 border-b border-border/60" />}

              {isExpanded && (
                <div className="pb-1">
                  {filteredNodes.map((def) => {
                    const Icon = iconMap[def.icon] || Zap;
                    return (
                      <div key={def.type} className="relative px-2">
                        <div
                          draggable
                          onDragStart={(e) => onDragStart(e, def)}
                          onMouseEnter={() => setHoveredNode(def.type)}
                          onMouseLeave={() => setHoveredNode(null)}
                          className="flex cursor-grab items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/80 active:cursor-grabbing active:bg-muted"
                        >
                          <div
                            className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded"
                            style={{ backgroundColor: `${def.color}12` }}
                          >
                            {getNodeIcon(def.type, "h-[14px] w-[14px]") || <span style={{ color: def.color }}><Icon className="h-[14px] w-[14px]" /></span>}
                          </div>
                          <span className="text-[12px] text-foreground truncate">{def.label}</span>
                        </div>

                        {/* Tooltip on hover */}
                        {hoveredNode === def.type && (
                          <div className="absolute left-full top-0 ml-2 z-50 w-48 rounded-lg border border-foreground/20 bg-card px-3 py-2 shadow-xl pointer-events-none">
                            <p className="text-[11px] font-medium text-foreground">{def.label}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{def.description}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="mx-3 mt-1 border-b border-border/60" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ========== Helper: edge schema-flow analysis ========== */
/**
 * Heuristic schema-flow check for an edge between two workflow nodes.
 *
 * Returns whether the edge has explicit field mappings, and whether
 * we suspect the operator forgot to wire something up — i.e. the
 * target needs input data but no mappings exist and the source
 * doesn't trivially passthrough.
 *
 * The check is deliberately permissive (no false-positive over-
 * warning) because workflows can pass data via `{{ steps.X.output }}`
 * expressions inside config fields, which we can't reliably trace
 * without executing. So we only flag the "obvious mistake" pattern:
 * an action/agent target that wants input but the edge carries
 * neither mappings nor a recognizable trigger source.
 */
function computeEdgeSchemaFlow(
  sourceType: string | undefined,
  targetType: string | undefined,
  mappingCount: number
): { schemaMismatch: boolean; dataLabel: string | undefined } {
  if (!sourceType || !targetType) {
    return { schemaMismatch: false, dataLabel: undefined };
  }

  if (mappingCount > 0) {
    return {
      schemaMismatch: false,
      dataLabel: mappingCount === 1 ? "1 field mapped" : `${mappingCount} fields mapped`,
    };
  }

  // Target node types that consume structured input. If one of these
  // is the target and there are no explicit mappings, the edge is a
  // candidate for "schema mismatch" warning.
  const TARGETS_NEEDING_INPUT = new Set([
    "agent",
    "llm_prompt",
    "http_request",
    "send_email",
    "send_slack",
    "transform",
    "filter",
    "if_condition",
    "switch",
    "approval_gate",
    "sub_workflow",
    "ai_summarize",
    "ai_classify",
    "ai_extract",
    "google_sheets_write",
    "gmail_send",
    "slack_send_integration",
    "notion_create",
    "airtable_create",
    "data_query",
    "a2a_call",
  ]);

  // Source node types that don't really produce structured "output"
  // worth mapping (triggers fire with whatever payload they receive,
  // delay just emits the time elapsed, etc). These are exempt — no
  // warning when the edge originates from one of these.
  const PASSTHROUGH_SOURCES = new Set([
    "trigger_webhook",
    "trigger_schedule",
    "trigger_lead",
    "trigger_chat",
    "trigger_manual",
    "delay",
    "set_variable",
    "merge",
    "parallel_merge",
    "wait_webhook",
    "wait_form",
  ]);

  if (TARGETS_NEEDING_INPUT.has(targetType) && !PASSTHROUGH_SOURCES.has(sourceType)) {
    return { schemaMismatch: true, dataLabel: "no mapping" };
  }

  return { schemaMismatch: false, dataLabel: undefined };
}

/* ========== Helper: members to flow elements ========== */
function membersToFlowElements(
  members: TeamMember[],
  executionSteps?: ExecutionStep[],
  savedPositions?: Record<string, { x: number; y: number }>,
  teamKnowledgeCount?: number,
  workflowNodes?: VisualTeamEditorProps["workflowNodes"],
  workflowEdges?: VisualTeamEditorProps["workflowEdges"]
) {
  const execMap = new Map(executionSteps?.map((s) => [s.memberId, s.status]) || []);
  const teamMemberNodeIdsByAgentId = new Map(
    members
      .filter((member) => member.agent?.id)
      .map((member) => [member.agent!.id, member.id])
  );
  const getNodeName = (member: TeamMember) => {
    if (member.agent?.name) return member.agent.name;
    const config =
      member.config && typeof member.config === "object" && !Array.isArray(member.config)
        ? (member.config as Record<string, unknown>)
        : null;
    return typeof config?.label === "string" && config.label.trim()
      ? config.label.trim()
      : member.role === "APPROVAL_GATE"
        ? "Approval Gate"
        : "Unassigned";
  };

  const nodes: Node[] = members.map((m) => {
    const schemaFields = (m.outputSchema as OutputSchemaField[] | null)?.map((s) => s.field) || [];
    const mode = m.role === "APPROVAL_GATE" ? "APPROVAL" : (m.agent?.mode || undefined);

    return {
      id: m.id,
      type: "visualAgent",
      position: savedPositions?.[m.id] || { x: 0, y: 0 },
      data: {
        label: getNodeName(m),
        role: m.role,
        agentName: getNodeName(m),
        responsibilities: m.responsibilities || "",
        llmModel: m.agent?.llmModel || undefined,
        mode,
        enabledActionsCount: m.enabledActions?.length || 0,
        hasOutputSchema: Array.isArray(m.outputSchema) && m.outputSchema.length > 0,
        isParallel: m.executionMode === "parallel",
        hasFeedbackLoop: !!m.feedbackLoop,
        schemaFields,
        executionStatus: execMap.get(m.id),
      },
    };
  });

  const edges: Edge[] = members
    .filter((m) => m.reportsToMemberId)
    .map((m) => {
      const sourceExec = execMap.get(m.reportsToMemberId!);
      const targetExec = execMap.get(m.id);
      const isExecuting = sourceExec === "completed" && targetExec === "running";

      return {
        id: `e-${m.reportsToMemberId}-${m.id}`,
        source: m.reportsToMemberId!,
        target: m.id,
        type: "animated",
        animated: true,
        data: {
          label: m.responsibilities ? m.responsibilities.split(".")[0].slice(0, 40) : undefined,
          executionActive: isExecuting,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isExecuting ? "#F97316" : "#4a4540",
          width: 14,
          height: 14,
        },
      };
    });

  const fallbackGhostNodes = new Map<string, Node>();

  members.forEach((member, index) => {
    if (!member.fallbackEnabled) return;
    const sourcePosition = savedPositions?.[member.id] || { x: 0, y: index * 180 };

    const addFallbackEdge = (targetId: string, label = "fallback") => {
      edges.push({
        id: `fallback-${member.id}-${targetId}`,
        source: member.id,
        target: targetId,
        type: "animated",
        animated: false,
        selectable: false,
        deletable: false,
        data: { label, isFallback: true, executionActive: false },
        style: { strokeDasharray: "5 5", stroke: "#FB923C", opacity: 0.9 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#FB923C", width: 12, height: 12 },
      });
    };

    if (member.fallbackAgentId && member.fallbackAgent) {
      const inTeamNodeId = teamMemberNodeIdsByAgentId.get(member.fallbackAgentId);
      if (inTeamNodeId) {
        addFallbackEdge(inTeamNodeId);
      } else {
        const ghostId = `__fallback__${member.id}__agent`;
        if (!fallbackGhostNodes.has(ghostId)) {
          fallbackGhostNodes.set(ghostId, {
            id: ghostId,
            type: "fallbackGhost",
            position: savedPositions?.[ghostId] || { x: sourcePosition.x + 340, y: sourcePosition.y + 40 },
            data: { label: "Fallback Agent", agentName: member.fallbackAgent.name, llmModel: member.fallbackAgent.llmModel },
            draggable: false,
            selectable: false,
            deletable: false,
          });
        }
        addFallbackEdge(ghostId);
      }
    }

    if (member.fallbackModel && member.agent) {
      const ghostId = `__fallback__${member.id}__model`;
      if (!fallbackGhostNodes.has(ghostId)) {
        fallbackGhostNodes.set(ghostId, {
          id: ghostId,
          type: "fallbackGhost",
          position: savedPositions?.[ghostId] || { x: sourcePosition.x + 340, y: sourcePosition.y + 140 },
          data: { label: "Fallback Model", agentName: member.agent.name, llmModel: member.fallbackModel },
          draggable: false,
          selectable: false,
          deletable: false,
        });
      }
      addFallbackEdge(ghostId, "fallback model");
    }
  });

  nodes.push(...Array.from(fallbackGhostNodes.values()));

  // Feedback loop edges
  members.forEach((m) => {
    const fl = m.feedbackLoop as { targetMemberId: string; maxIterations: number; qualityField: string; qualityThreshold: number } | null;
    if (!fl) return;
    edges.push({
      id: `loop-${m.id}-${fl.targetMemberId}`,
      source: m.id,
      target: fl.targetMemberId,
      type: "animated",
      animated: true,
      deletable: false,
      data: {
        label: `Loop: ${fl.qualityField} < ${fl.qualityThreshold} (max ${fl.maxIterations}x)`,
        executionActive: false,
      },
      style: { strokeDasharray: "6 3", stroke: "#06B6D4" },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#06B6D4", width: 12, height: 12 },
    });
  });

  // Shared team knowledge node
  if (teamKnowledgeCount && teamKnowledgeCount > 0) {
    const kbNodeId = "__team_kb__";
    nodes.push({
      id: kbNodeId,
      type: "teamKnowledge",
      position: savedPositions?.[kbNodeId] || { x: 0, y: 0 },
      data: { label: "Workflow Knowledge", docCount: teamKnowledgeCount, role: "KB", agentName: "Workflow Knowledge", responsibilities: "" },
      draggable: true,
      selectable: false,
    });

    members.forEach((m) => {
      edges.push({
        id: `kb-${kbNodeId}-${m.id}`,
        source: kbNodeId,
        target: m.id,
        type: "animated",
        animated: false,
        selectable: false,
        deletable: false,
        data: {},
        style: { strokeDasharray: "4 4", stroke: "#06B6D4", opacity: 0.3 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#06B6D4", width: 10, height: 10 },
      });
    });
  }

  // Workflow nodes (non-agent)
  if (workflowNodes && workflowNodes.length > 0) {
    const defMap = new Map(WORKFLOW_NODE_DEFINITIONS.map((d) => [d.type, d]));
    workflowNodes.forEach((wn) => {
      const def = defMap.get(wn.type);
      if (!def) return;
      const hasErrorPath = workflowEdges?.some(
        (we) => we.sourceId === wn.id && (we.sourceHandle === "error" || we.condition === "error")
      );
      nodes.push({
        id: wn.id,
        type: "workflowNode",
        position: savedPositions?.[wn.id] || wn.position,
        data: {
          label: wn.label,
          nodeType: wn.type,
          category: def.category,
          description: def.description,
          iconName: def.icon,
          config: wn.config,
          hasErrorPath: !!hasErrorPath,
        },
      });
    });
  }

  // Workflow edges. Each edge carries pre-computed schema-flow info
  // (mapping count + mismatch flag) so the AnimatedConnectionEdge can
  // render the right indicator without re-deriving from full state.
  if (workflowEdges && workflowEdges.length > 0) {
    const wfNodeMap = new Map(
      (workflowNodes || []).map((n) => [n.id, n])
    );
    workflowEdges.forEach((we) => {
      const isErrorEdge = we.sourceHandle === "error" || we.condition === "error";
      const sourceNode = wfNodeMap.get(we.sourceId);
      const targetNode = wfNodeMap.get(we.targetId);
      const mappingCount = (we.mappings || []).length;
      const { schemaMismatch, dataLabel } = isErrorEdge
        ? { schemaMismatch: false, dataLabel: undefined }
        : computeEdgeSchemaFlow(sourceNode?.type, targetNode?.type, mappingCount);

      // Resolve switch case label from source node's config so each
      // branch gets a readable name (e.g. "premium", "default").
      let caseLabel: string | undefined;
      if (sourceNode?.type === "switch" && we.sourceHandle?.startsWith("case-")) {
        const idx = parseInt(we.sourceHandle.replace("case-", ""), 10);
        const cases = (sourceNode.config?.cases as Array<{ label?: string }>) || [];
        caseLabel = cases[idx]?.label;
      }

      edges.push({
        id: `wfe-${we.sourceId}-${we.targetId}-${we.sourceHandle || "default"}`,
        source: we.sourceId,
        target: we.targetId,
        sourceHandle: we.sourceHandle || undefined,
        type: "animated",
        animated: true,
        data: {
          label: we.condition || undefined,
          executionActive: false,
          isErrorEdge,
          mappingCount,
          schemaMismatch,
          dataLabel,
          caseLabel,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#4a4540", width: 14, height: 14 },
      });
    });
  }

  return { nodes, edges };
}

/* ========== Main Component ========== */
export function VisualTeamEditor(props: VisualTeamEditorProps) {
  return (
    <ReactFlowProvider>
      <VisualTeamEditorInner {...props} />
    </ReactFlowProvider>
  );
}

/* ── Empty-state quick-start chip ──────────────────────────────────
 * One of four buttons rendered on a brand-new workflow canvas.
 * Clicking adds a node of the chosen type at the canvas center.
 */
function QuickStartChip({
  label,
  description,
  onClick,
  primary = false,
}: {
  label: string;
  description: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-all hover:-translate-y-0.5",
        primary
          ? "border-kiln-orange/40 bg-kiln-orange/5 hover:bg-kiln-orange/10 hover:border-kiln-orange/60"
          : "border-border bg-card hover:bg-muted/40 hover:border-foreground/20"
      )}
    >
      <span
        className={cn(
          "text-xs font-semibold",
          primary ? "text-kiln-orange" : "text-foreground"
        )}
      >
        {label}
      </span>
      <span className="text-[10px] text-muted-foreground">{description}</span>
    </button>
  );
}

function VisualTeamEditorInner({
  teamId,
  members,
  onNodeClick,
  onConnectionCreate,
  onConnectionDelete,
  executionSteps,
  savedPositions,
  onPositionsChange,
  teamKnowledgeCount,
  workflowNodes: wfNodes,
  workflowEdges: wfEdges,
  onWorkflowNodesChange,
  onWorkflowEdgesChange,
  onEdgeClick: onEdgeClickProp,
  onVariablesClick,
  onRunWorkflow,
  executionStatus = "idle",
  executionDuration,
  executionCredits,
  nodeResults,
  executionLogs,
}: VisualTeamEditorProps) {
  const reactFlowInstance = useReactFlow();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  // Unified panel state — only ONE panel open at a time
  type ActivePanel = "palette" | "config" | "none";
  const [activePanel, setActivePanel] = useState<ActivePanel>("none");
  const [selectedNode, setSelectedNode] = useState<{
    id: string;
    type: WorkflowNodeType;
    label: string;
    config: Record<string, unknown>;
  } | null>(null);

  // Node search command palette
  const [nodeSearchOpen, setNodeSearchOpen] = useState(false);
  const [nodeSearchPosition, setNodeSearchPosition] = useState<{ x: number; y: number } | undefined>();

  // Multi-selection state — tracks IDs of selected workflow nodes
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId?: string;
    nodeType?: WorkflowNodeType;
  } | null>(null);

  // In-memory clipboard for copied nodes (persisted to sessionStorage for tab-switching)
  const [clipboardNodes, setClipboardNodes] = useState<{
    nodes: Array<{ type: WorkflowNodeType; label: string; config: Record<string, unknown>; relativePos: { x: number; y: number } }>;
    edges: Array<{ sourceIdx: number; targetIdx: number; sourceHandle?: string }>;
  } | null>(null);

  // Restore clipboard from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("kiln-canvas-clipboard");
      if (saved) setClipboardNodes(JSON.parse(saved));
    } catch {
      // Best-effort; ignore corrupted state.
    }
  }, []);

  // Persist clipboard whenever it changes
  useEffect(() => {
    try {
      if (clipboardNodes) {
        sessionStorage.setItem("kiln-canvas-clipboard", JSON.stringify(clipboardNodes));
      } else {
        sessionStorage.removeItem("kiln-canvas-clipboard");
      }
    } catch {
      // sessionStorage unavailable (private mode) — no-op
    }
  }, [clipboardNodes]);

  // Derived helpers
  const sidebarCollapsed = activePanel !== "palette";

  // Save indicator state
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Undo/Redo refs (callbacks that need setNodes/setEdges are defined after useNodesState below)
  const MAX_HISTORY = 30;
  const historyRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const historyIndexRef = useRef(-1);
  const isUndoRedoRef = useRef(false);

  const pushHistory = useCallback((snapNodes: Node[], snapEdges: Edge[]) => {
    if (isUndoRedoRef.current) return;
    const history = historyRef.current;
    const idx = historyIndexRef.current;
    historyRef.current = history.slice(0, idx + 1);
    historyRef.current.push({
      nodes: snapNodes.map((n) => ({ ...n, data: { ...n.data } })),
      edges: snapEdges.map((e) => ({ ...e })),
    });
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current = historyRef.current.slice(-MAX_HISTORY);
    }
    historyIndexRef.current = historyRef.current.length - 1;
  }, []);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const updateUndoRedoState = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  // Refs to avoid stale closures in callbacks
  const wfEdgesRef = useRef(wfEdges);
  useEffect(() => { wfEdgesRef.current = wfEdges; }, [wfEdges]);
  const wfNodesRef = useRef(wfNodes);
  useEffect(() => { wfNodesRef.current = wfNodes; }, [wfNodes]);
  // Ref for ReactFlow edges (used by nodeResults effect to avoid dependency loop)
  const edgesRef = useRef<Edge[]>([]);

  // Flash save indicator
  const flashSaveStatus = useCallback(() => {
    setSaveStatus("saving");
    if (saveTimerDebounceRef.current) clearTimeout(saveTimerDebounceRef.current);
    saveTimerDebounceRef.current = setTimeout(() => {
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    }, 400);
  }, []);

  // Inject dash animation CSS
  useEffect(() => {
    const styleId = "visual-team-editor-styles";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes dashmove { 0% { stroke-dashoffset: 12; } 100% { stroke-dashoffset: 0; } }
      @keyframes kiln-handle-pulse {
        0%, 100% { box-shadow: 0 0 0 0 hsl(var(--primary) / 0.5); }
        50% { box-shadow: 0 0 0 4px hsl(var(--primary) / 0.15); }
      }
      .react-flow__edge.selected .react-flow__edge-path { stroke: hsl(var(--primary)) !important; }

      /* Theme-aware dot grid — overrides Background's hard-coded fill */
      .kiln-canvas-bg circle { fill: hsl(var(--border) / 0.45) !important; }

      /* Connection handles: 8x8 default, 12x12 hover with primary border + pulse */
      .react-flow__handle {
        pointer-events: all !important;
        cursor: crosshair !important;
        z-index: 10 !important;
        width: 8px !important;
        height: 8px !important;
        transition: transform 0.15s, background-color 0.15s, box-shadow 0.15s, border-color 0.15s, width 0.15s, height 0.15s;
      }
      .react-flow__handle:hover {
        width: 12px !important;
        height: 12px !important;
        border-color: hsl(var(--primary)) !important;
        animation: kiln-handle-pulse 1.4s ease-in-out infinite;
      }
      /* Connection drag feedback: valid targets glow orange, invalid dim */
      .connecting .react-flow__handle.connectingto {
        background-color: hsl(var(--primary)) !important;
        width: 14px !important;
        height: 14px !important;
        box-shadow: 0 0 8px hsl(var(--primary) / 0.7);
      }
      .connecting .react-flow__handle.valid {
        background-color: #22c55e !important;
        border-color: #22c55e !important;
        width: 14px !important;
        height: 14px !important;
        box-shadow: 0 0 8px rgba(34, 197, 94, 0.6);
      }

      /* Multi-selection: nodes get an orange border ring */
      .react-flow__node.selected > div { box-shadow: 0 0 0 2px hsl(var(--primary) / 0.7), 0 8px 24px hsl(0 0% 0% / 0.25) !important; }
    `;
    document.head.appendChild(style);
    return () => { style.remove(); };
  }, []);

  // Build initial elements
  const initial = useMemo(() => {
    const { nodes: rawNodes, edges: rawEdges } = membersToFlowElements(
      members, executionSteps, savedPositions, teamKnowledgeCount, wfNodes, wfEdges
    );
    const hasSaved = savedPositions && Object.keys(savedPositions).length > 0;
    if (hasSaved) return { nodes: rawNodes, edges: rawEdges };
    return getLayoutedElements(rawNodes, rawEdges, "LR");
  }, [members, executionSteps, savedPositions, teamKnowledgeCount, wfNodes, wfEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  // Keep edgesRef in sync for loop-free reads
  edgesRef.current = edges;

  // Undo/Redo callbacks (need setNodes/setEdges from above)
  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    isUndoRedoRef.current = true;
    historyIndexRef.current -= 1;
    const snapshot = historyRef.current[historyIndexRef.current];
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    updateUndoRedoState();
    requestAnimationFrame(() => { isUndoRedoRef.current = false; });
  }, [setNodes, setEdges, updateUndoRedoState]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    isUndoRedoRef.current = true;
    historyIndexRef.current += 1;
    const snapshot = historyRef.current[historyIndexRef.current];
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    updateUndoRedoState();
    requestAnimationFrame(() => { isUndoRedoRef.current = false; });
  }, [setNodes, setEdges, updateUndoRedoState]);

  // Track previous structure to avoid destructive full rebuilds
  const prevStructureRef = useRef<{ nodeIds: string; edgeKeys: string; memberIds: string }>({ nodeIds: "", edgeKeys: "", memberIds: "" });

  // Targeted update: only full-rebuild when structure changes (nodes added/removed, edges changed)
  useEffect(() => {
    const wfNodeIds = (wfNodes || []).map((n) => n.id).sort().join(",");
    const wfEdgeKeys = (wfEdges || []).map((e) => `${e.sourceId}-${e.targetId}`).sort().join(",");
    const memberIds = members.map((m) => m.id).sort().join(",");
    const prev = prevStructureRef.current;

    const structureChanged =
      wfNodeIds !== prev.nodeIds ||
      wfEdgeKeys !== prev.edgeKeys ||
      memberIds !== prev.memberIds;

    if (!structureChanged) {
      // Config-only change: update individual node data without rebuilding
      setNodes((nds) =>
        nds.map((n) => {
          if (n.type === "workflowNode") {
            const wfNode = (wfNodes || []).find((wn) => wn.id === n.id);
            if (wfNode) {
              return { ...n, data: { ...n.data, label: wfNode.label, config: wfNode.config } };
            }
          }
          // Update execution status for agent nodes
          const execStep = executionSteps?.find((s) => s.memberId === n.id);
          if (execStep && (n.data as VisualNodeData)?.executionStatus !== execStep.status) {
            return { ...n, data: { ...n.data, executionStatus: execStep.status } };
          }
          return n;
        })
      );
      return;
    }

    // Structure changed — full rebuild
    prevStructureRef.current = { nodeIds: wfNodeIds, edgeKeys: wfEdgeKeys, memberIds };
    const { nodes: rawNodes, edges: rawEdges } = membersToFlowElements(
      members, executionSteps, savedPositions, teamKnowledgeCount, wfNodes, wfEdges
    );
    const hasSaved = savedPositions && Object.keys(savedPositions).length > 0;
    if (hasSaved) {
      setNodes(rawNodes);
      setEdges(rawEdges);
    } else {
      const layouted = getLayoutedElements(rawNodes, rawEdges, "LR");
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
    }
  }, [members, executionSteps, savedPositions, teamKnowledgeCount, wfNodes, wfEdges, setNodes, setEdges]);

  // Update workflow nodes with execution results (including error info + downstream skipping)
  // IMPORTANT: uses edgesRef (not edges) to avoid setEdges → edges change → re-trigger loop
  const prevNodeResultsKeyRef = useRef("");
  useEffect(() => {
    if (!nodeResults || Object.keys(nodeResults).length === 0) return;

    // Guard: only run when nodeResults actually changed (serialize status keys)
    const key = Object.entries(nodeResults)
      .map(([id, r]) => `${id}:${r.status}:${r.durationMs ?? ""}:${r.error ?? ""}`)
      .sort()
      .join("|");
    if (key === prevNodeResultsKeyRef.current) return;
    prevNodeResultsKeyRef.current = key;

    // Read edges from ref (stable, doesn't trigger re-render dependency)
    const currentEdges = edgesRef.current;

    // Collect IDs of failed nodes and find the upstream node label for skip reason
    const failedNodeIds = new Set<string>();
    const failedNodeLabels = new Map<string, string>();
    for (const [id, result] of Object.entries(nodeResults)) {
      if (result.status === "failed") {
        failedNodeIds.add(id);
        failedNodeLabels.set(id, result.nodeLabel || id);
      }
    }

    // Find all nodes downstream of any failed node via BFS on edges
    const skippedNodeIds = new Set<string>();
    const skipReasons = new Map<string, string>();
    if (failedNodeIds.size > 0) {
      const queue = [...failedNodeIds];
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const edge of currentEdges) {
          if (edge.source === current && !failedNodeIds.has(edge.target) && !skippedNodeIds.has(edge.target)) {
            skippedNodeIds.add(edge.target);
            const reason = failedNodeLabels.get(current) || skipReasons.get(current);
            if (reason) skipReasons.set(edge.target, `"${reason}" failed`);
            queue.push(edge.target);
          }
        }
      }
    }

    // Update nodes with enriched execution data
    setNodes((nds) =>
      nds.map((n) => {
        if (n.type !== "workflowNode") return n;

        if (skippedNodeIds.has(n.id)) {
          return {
            ...n,
            data: {
              ...n.data,
              execStatus: "skipped" as const,
              skippedReason: skipReasons.get(n.id),
            },
          };
        }

        const result = nodeResults[n.id];
        if (!result) return n;

        // Extract error from result.error or from output
        let execError: string | undefined;
        if (result.status === "failed") {
          execError = result.error || undefined;
          if (!execError && result.output) {
            const out = result.output as Record<string, unknown>;
            execError = (out.message as string) || (out.error as string) || String(result.output);
          }
        }

        return {
          ...n,
          data: {
            ...n.data,
            execStatus: result.status,
            execDurationMs: result.durationMs,
            execCredits: result.credits,
            ...(execError ? { execError } : {}),
          },
        };
      })
    );

    // Update edges with flow data (using callback form — no dependency on edges state)
    setEdges((eds) =>
      eds.map((e) => {
        const sourceResult = nodeResults[e.source];
        if (!sourceResult || sourceResult.status === "running") return e;

        const flowStatus = sourceResult.status === "completed" ? "success"
          : sourceResult.status === "failed" ? "error"
          : "none";

        const flowData = sourceResult.status === "completed" && sourceResult.output
          ? sourceResult.output
          : undefined;

        return {
          ...e,
          data: {
            ...e.data,
            flowStatus,
            flowData,
          },
        };
      })
    );
  }, [nodeResults, setNodes, setEdges]);

  // Push initial history snapshot once nodes are rendered
  const initialHistoryPushed = useRef(false);
  useEffect(() => {
    if (!initialHistoryPushed.current && nodes.length > 0) {
      pushHistory(nodes, edges);
      updateUndoRedoState();
      initialHistoryPushed.current = true;
    }
  }, [nodes, edges, pushHistory, updateUndoRedoState]);

  // Auto-fit view on initial load
  const hasFitView = useRef(false);
  useEffect(() => {
    if (!hasFitView.current && nodes.length > 0) {
      hasFitView.current = true;
      // Delay to let ReactFlow render nodes first
      const timer = setTimeout(() => {
        reactFlowInstance.fitView({ padding: 0.2, duration: 300 });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [nodes.length, reactFlowInstance]);

  // Zoom level indicator (subscribes to viewport)
  const [zoomPercent, setZoomPercent] = useState(100);
  useEffect(() => {
    const update = () => {
      const z = reactFlowInstance.getZoom();
      setZoomPercent(Math.round(z * 100));
    };
    update();
    const interval = setInterval(update, 200);
    return () => clearInterval(interval);
  }, [reactFlowInstance]);

  const handleFitView = useCallback(() => {
    reactFlowInstance.fitView({ padding: 0.2, duration: 300 });
  }, [reactFlowInstance]);

  const handleZoomIn = useCallback(() => {
    reactFlowInstance.zoomIn({ duration: 200 });
  }, [reactFlowInstance]);

  const handleZoomOut = useCallback(() => {
    reactFlowInstance.zoomOut({ duration: 200 });
  }, [reactFlowInstance]);

  const handleZoomReset = useCallback(() => {
    const v = reactFlowInstance.getViewport();
    reactFlowInstance.setViewport({ x: v.x, y: v.y, zoom: 1 }, { duration: 200 });
  }, [reactFlowInstance]);

  // ── Multi-selection / clipboard helpers ───────────────────────────
  // Copy currently-selected workflow nodes (plus internal edges) into
  // the in-memory clipboard. Each node stores config + a relative
  // position to the bounding box, so paste can offset the whole group.
  const copySelectedNodes = useCallback(() => {
    const allNodes = reactFlowInstance.getNodes();
    const allEdges = reactFlowInstance.getEdges();
    const selected = allNodes.filter((n) => n.selected && n.type === "workflowNode");
    if (selected.length === 0) return;

    const { x: minX, y: minY } = boundingTopLeft(selected.map((n) => ({ id: n.id, position: n.position })));
    const idToIdx = new Map(selected.map((n, i) => [n.id, i]));
    const selectedIds = new Set(selected.map((n) => n.id));

    const internalEdges = pickInternalEdges(
      allEdges.map((e) => ({ source: e.source, target: e.target, sourceHandle: e.sourceHandle || undefined })),
      selectedIds,
    ).map((e) => ({
      sourceIdx: idToIdx.get(e.source)!,
      targetIdx: idToIdx.get(e.target)!,
      sourceHandle: e.sourceHandle,
    }));

    setClipboardNodes({
      nodes: selected.map((n) => {
        const nd = n.data as WorkflowNodeData;
        return {
          type: nd.nodeType,
          label: nd.label as string,
          config: { ...(nd.config as Record<string, unknown>) },
          relativePos: { x: n.position.x - minX, y: n.position.y - minY },
        };
      }),
      edges: internalEdges,
    });
  }, [reactFlowInstance]);

  // Paste clipboard nodes into the canvas, offset 40px from original.
  // Handles both single-node and multi-node groups including internal
  // edges. The pasted group becomes the new selection.
  const pasteFromClipboard = useCallback(() => {
    if (!clipboardNodes || clipboardNodes.nodes.length === 0) return;

    const viewport = reactFlowInstance.getViewport();
    const baseX = -viewport.x / viewport.zoom + 100;
    const baseY = -viewport.y / viewport.zoom + 100;
    const offset = PASTE_OFFSET_PX;

    const newIds: string[] = [];
    const newFlowNodes: Node[] = [];
    const newWfNodes: { id: string; type: WorkflowNodeType; label: string; position: { x: number; y: number }; config: Record<string, unknown> }[] = [];

    clipboardNodes.nodes.forEach((cn) => {
      const def = WORKFLOW_NODE_DEFINITIONS.find((d) => d.type === cn.type);
      if (!def) return;
      const newId = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      newIds.push(newId);
      const pos = {
        x: baseX + cn.relativePos.x + offset,
        y: baseY + cn.relativePos.y + offset,
      };
      newFlowNodes.push({
        id: newId,
        type: "workflowNode",
        position: pos,
        selected: true,
        data: {
          label: cn.label,
          nodeType: cn.type,
          category: def.category,
          description: def.description,
          iconName: def.icon,
          config: cn.config,
        },
      });
      newWfNodes.push({ id: newId, type: cn.type, label: cn.label, position: pos, config: cn.config });
    });

    const newFlowEdges: Edge[] = clipboardNodes.edges.map((ce) => ({
      id: `e-${newIds[ce.sourceIdx]}-${newIds[ce.targetIdx]}`,
      source: newIds[ce.sourceIdx],
      target: newIds[ce.targetIdx],
      sourceHandle: ce.sourceHandle,
      type: "animated",
      animated: true,
      data: {},
      markerEnd: { type: MarkerType.ArrowClosed, color: "#4a4540", width: 14, height: 14 },
    }));

    const newWfEdges = clipboardNodes.edges.map((ce) => ({
      sourceId: newIds[ce.sourceIdx],
      targetId: newIds[ce.targetIdx],
      sourceHandle: ce.sourceHandle,
    }));

    setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newFlowNodes]);
    setEdges((eds) => [...eds, ...newFlowEdges]);

    if (onWorkflowNodesChange) {
      onWorkflowNodesChange([...(wfNodes || []), ...newWfNodes]);
    }
    if (onWorkflowEdgesChange) {
      onWorkflowEdgesChange([...(wfEdges || []), ...newWfEdges]);
    }

    setTimeout(() => {
      pushHistory(reactFlowInstance.getNodes(), reactFlowInstance.getEdges());
      updateUndoRedoState();
    }, 50);
  }, [clipboardNodes, reactFlowInstance, setNodes, setEdges, onWorkflowNodesChange, onWorkflowEdgesChange, wfNodes, wfEdges, pushHistory, updateUndoRedoState]);

  // Bulk-delete all currently selected nodes. Confirms when 5+.
  const handleBulkDelete = useCallback(() => {
    const ids = selectedNodeIds;
    if (ids.length === 0) return;
    if (shouldConfirmBulkDelete(ids.length) && !confirm(`Delete ${ids.length} selected nodes?`)) return;

    setNodes((nds) => nds.filter((n) => !ids.includes(n.id)));
    setEdges((eds) => eds.filter((e) => !ids.includes(e.source) && !ids.includes(e.target)));
    if (onWorkflowNodesChange && wfNodesRef.current) {
      onWorkflowNodesChange(wfNodesRef.current.filter((n) => !ids.includes(n.id)));
    }
    if (onWorkflowEdgesChange && wfEdgesRef.current) {
      onWorkflowEdgesChange(wfEdgesRef.current.filter((e) => !ids.includes(e.sourceId) && !ids.includes(e.targetId)));
    }
    setSelectedNodeIds([]);
    setTimeout(() => {
      pushHistory(reactFlowInstance.getNodes(), reactFlowInstance.getEdges());
      updateUndoRedoState();
    }, 50);
  }, [selectedNodeIds, setNodes, setEdges, onWorkflowNodesChange, onWorkflowEdgesChange, reactFlowInstance, pushHistory, updateUndoRedoState]);

  // Bulk-duplicate selected nodes (delegates to copy + paste)
  const handleBulkDuplicate = useCallback(() => {
    copySelectedNodes();
    // Defer so clipboardNodes state updates before paste reads it
    setTimeout(() => pasteFromClipboard(), 0);
  }, [copySelectedNodes, pasteFromClipboard]);

  // Single-node duplicate (Ctrl+D path) — operates on currently selected nodes
  const duplicateSelected = useCallback(() => {
    const selected = reactFlowInstance.getNodes().filter((n) => n.selected && n.type === "workflowNode");
    if (selected.length === 0) return;
    if (selected.length >= 2) {
      handleBulkDuplicate();
      return;
    }
    const n = selected[0];
    const nd = n.data as WorkflowNodeData;
    const newId = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const pos = { x: n.position.x + 50, y: n.position.y + 50 };
    const newFlowNode: Node = {
      id: newId,
      type: "workflowNode",
      position: pos,
      selected: true,
      data: { ...nd, label: `${nd.label as string} (copy)` },
    };
    const newWfNode = {
      id: newId,
      type: nd.nodeType,
      label: `${nd.label as string} (copy)`,
      position: pos,
      config: { ...(nd.config as Record<string, unknown>) },
    };
    setNodes((nds) => [...nds.map((m) => ({ ...m, selected: false })), newFlowNode]);
    if (onWorkflowNodesChange && wfNodes) {
      onWorkflowNodesChange([...wfNodes, newWfNode]);
    }
    setTimeout(() => {
      pushHistory(reactFlowInstance.getNodes(), reactFlowInstance.getEdges());
      updateUndoRedoState();
    }, 50);
  }, [reactFlowInstance, setNodes, onWorkflowNodesChange, wfNodes, pushHistory, updateUndoRedoState, handleBulkDuplicate]);

  // Toggle the disabled flag on a node — disabled nodes are skipped at
  // run-time but stay in the canvas with their edges intact.
  const toggleNodeDisabled = useCallback(
    (nodeId: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const cfg = (n.data?.config as Record<string, unknown>) || {};
          const nextDisabled = !cfg.disabled;
          return { ...n, data: { ...n.data, config: { ...cfg, disabled: nextDisabled } } };
        })
      );
      if (onWorkflowNodesChange && wfNodesRef.current) {
        onWorkflowNodesChange(
          wfNodesRef.current.map((n) =>
            n.id === nodeId
              ? { ...n, config: { ...(n.config || {}), disabled: !(n.config?.disabled as boolean) } }
              : n
          )
        );
      }
    },
    [setNodes, onWorkflowNodesChange]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if (isInput) return;

      const ctrl = e.metaKey || e.ctrlKey;

      // Ctrl+Z → undo
      if (ctrl && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        undo();
        return;
      }
      // Ctrl+Shift+Z or Ctrl+Y → redo
      if ((ctrl && e.shiftKey && e.key === "z") || (ctrl && e.key === "y")) {
        e.preventDefault();
        redo();
        return;
      }
      // Ctrl+A → select all
      if (ctrl && e.key === "a") {
        e.preventDefault();
        setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
        setEdges((eds) => eds.map((e) => ({ ...e, selected: true })));
        return;
      }
      // Escape → close node search, deselect all, close config panel
      if (e.key === "Escape") {
        if (nodeSearchOpen) {
          setNodeSearchOpen(false);
          return;
        }
        setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
        setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
        setSelectedNode(null);
        setActivePanel("none");
        return;
      }
      // "/" → open node search command palette
      if (e.key === "/" && !ctrl) {
        e.preventDefault();
        setNodeSearchOpen(true);
        return;
      }
      // Cmd/Ctrl+K or Cmd/Ctrl+P → open node search command palette
      if (ctrl && (e.key === "k" || e.key === "p")) {
        e.preventDefault();
        setNodeSearchOpen(true);
        return;
      }
      // Cmd/Ctrl + "+" / "=" → zoom in
      if (ctrl && (e.key === "+" || e.key === "=")) {
        e.preventDefault();
        handleZoomIn();
        return;
      }
      // Cmd/Ctrl + "-" → zoom out
      if (ctrl && e.key === "-") {
        e.preventDefault();
        handleZoomOut();
        return;
      }
      // Cmd/Ctrl + 0 → reset zoom to 100%
      if (ctrl && e.key === "0") {
        e.preventDefault();
        handleZoomReset();
        return;
      }
      // Cmd/Ctrl + 1 → fit view
      if (ctrl && e.key === "1") {
        e.preventDefault();
        handleFitView();
        return;
      }
      // Ctrl+C → copy selected nodes to clipboard (in-memory)
      if (ctrl && e.key === "c") {
        e.preventDefault();
        copySelectedNodes();
        return;
      }
      // Ctrl+V → paste clipboard nodes (offset 40px from origin)
      if (ctrl && e.key === "v") {
        e.preventDefault();
        pasteFromClipboard();
        return;
      }
      // Ctrl+D → duplicate selected nodes
      if (ctrl && e.key === "d") {
        e.preventDefault();
        duplicateSelected();
        return;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    undo, redo, setNodes, setEdges, reactFlowInstance,
    onWorkflowNodesChange, wfNodes, pushHistory, updateUndoRedoState,
    nodeSearchOpen, handleZoomIn, handleZoomOut, handleZoomReset, handleFitView,
    copySelectedNodes, pasteFromClipboard, duplicateSelected,
  ]);

  // Save positions on drag end (debounced)
  const handleNodeDragStop = useCallback(
    () => {
      if (!onPositionsChange) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const currentNodes = reactFlowInstance.getNodes();
        const positions: Record<string, { x: number; y: number }> = {};
        currentNodes.forEach((n) => { positions[n.id] = n.position; });
        onPositionsChange(positions);
      }, 500);
    },
    [onPositionsChange, reactFlowInstance]
  );

  // Validate connections: prevent self-loops, duplicates, trigger-to-trigger, and cycles
  const isValidConnection = useCallback(
    (connection: Edge | Connection) => {
      if (!connection.source || !connection.target) return false;
      // No self-connections
      if (connection.source === connection.target) return false;

      // No duplicate connections (same source → same target)
      const exists = edges.some(
        (e) => e.source === connection.source && e.target === connection.target
      );
      if (exists) return false;

      // No connecting two trigger nodes together
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      const sourceCategory = (sourceNode?.data as WorkflowNodeData)?.category;
      const targetCategory = (targetNode?.data as WorkflowNodeData)?.category;
      if (sourceCategory === "triggers" && targetCategory === "triggers") return false;

      // Cycle detection: BFS from target's outputs — if we reach source, it's a cycle
      const visited = new Set<string>();
      const queue = [connection.target];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (current === connection.source) return false;
        if (visited.has(current)) continue;
        visited.add(current);
        edges.filter((e) => e.source === current).forEach((e) => queue.push(e.target));
      }

      return true;
    },
    [nodes, edges]
  );

  // Handle new connections (uses ref to avoid stale closure)
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const newEdge: Edge = {
        id: `e-${connection.source}-${connection.target}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle || undefined,
        type: "animated",
        animated: true,
        data: {},
        markerEnd: { type: MarkerType.ArrowClosed, color: "#4a4540", width: 14, height: 14 },
      };
      setEdges((eds) => addEdge(newEdge, eds));

      // Persist workflow edges (use ref for current value)
      if (onWorkflowEdgesChange && wfEdgesRef.current) {
        const newWfEdge = {
          sourceId: connection.source,
          targetId: connection.target,
          sourceHandle: connection.sourceHandle || undefined,
        };
        onWorkflowEdgesChange([...wfEdgesRef.current, newWfEdge]);
        flashSaveStatus();
      }

      onConnectionCreate?.(connection.source, connection.target);

      // Push to undo history (structural change)
      setTimeout(() => {
        const allNodes = reactFlowInstance.getNodes();
        const allEdges = reactFlowInstance.getEdges();
        pushHistory(allNodes, allEdges);
        updateUndoRedoState();
      }, 50);
    },
    [setEdges, onConnectionCreate, onWorkflowEdgesChange, flashSaveStatus, reactFlowInstance, pushHistory, updateUndoRedoState]
  );

  // Auto-layout
  const handleAutoLayout = useCallback(() => {
    const layouted = getLayoutedElements(nodes, edges, "LR");
    setNodes(layouted.nodes);
    setEdges(layouted.edges);
    setTimeout(() => {
      reactFlowInstance.fitView({ padding: 0.3, duration: 300 });
    }, 50);
    if (onPositionsChange) {
      const positions: Record<string, { x: number; y: number }> = {};
      layouted.nodes.forEach((n) => { positions[n.id] = n.position; });
      onPositionsChange(positions);
    }
  }, [nodes, edges, setNodes, setEdges, reactFlowInstance, onPositionsChange]);

  // Handle drop from sidebar
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("application/kiln-workflow-node");
      if (!raw) return;

      try {
        const payload = JSON.parse(raw) as {
          type: WorkflowNodeType;
          label: string;
          category: WorkflowNodeCategory;
          description: string;
          icon: string;
          color: string;
          defaultConfig: Record<string, unknown>;
        };

        if (!reactFlowWrapper.current) return;

        const position = reactFlowInstance.screenToFlowPosition({
          x: e.clientX,
          y: e.clientY,
        });

        const wfNode = createWorkflowNode(payload.type, position);
        const def = WORKFLOW_NODE_DEFINITIONS.find((d) => d.type === payload.type);
        if (!def) return;

        const newFlowNode: Node = {
          id: wfNode.id,
          type: "workflowNode",
          position,
          data: {
            label: wfNode.label,
            nodeType: wfNode.type,
            category: def.category,
            description: def.description,
            iconName: def.icon,
            config: wfNode.config,
          },
        };

        setNodes((nds) => [...nds, newFlowNode]);

        if (onWorkflowNodesChange) {
          const currentWfNodes = wfNodes || [];
          onWorkflowNodesChange([
            ...currentWfNodes,
            { id: wfNode.id, type: wfNode.type, label: wfNode.label, position, config: wfNode.config },
          ]);
        }

        // Push to undo history (structural change)
        setTimeout(() => {
          const allN = reactFlowInstance.getNodes();
          const allE = reactFlowInstance.getEdges();
          pushHistory(allN, allE);
          updateUndoRedoState();
        }, 50);
      } catch {
        // Invalid drag data
      }
    },
    [reactFlowInstance, setNodes, onWorkflowNodesChange, wfNodes, pushHistory, updateUndoRedoState]
  );

  // Config panel handlers
  const handleNodeConfigChange = useCallback(
    (nodeId: string, newConfig: Record<string, unknown>) => {
      // Update local ReactFlow node
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, config: newConfig } } : n
        )
      );
      // Update workflow nodes
      if (onWorkflowNodesChange && wfNodes) {
        onWorkflowNodesChange(
          wfNodes.map((n) => (n.id === nodeId ? { ...n, config: newConfig } : n))
        );
        flashSaveStatus();
      }
      // Update local selected state
      setSelectedNode((prev) => (prev && prev.id === nodeId ? { ...prev, config: newConfig } : prev));
    },
    [setNodes, onWorkflowNodesChange, wfNodes, flashSaveStatus]
  );

  const handleNodeLabelChange = useCallback(
    (nodeId: string, newLabel: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, label: newLabel } } : n
        )
      );
      if (onWorkflowNodesChange && wfNodes) {
        onWorkflowNodesChange(
          wfNodes.map((n) => (n.id === nodeId ? { ...n, label: newLabel } : n))
        );
      }
      setSelectedNode((prev) => (prev && prev.id === nodeId ? { ...prev, label: newLabel } : prev));
    },
    [setNodes, onWorkflowNodesChange, wfNodes]
  );

  const handleNodeDelete = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      if (onWorkflowNodesChange && wfNodesRef.current) {
        onWorkflowNodesChange(wfNodesRef.current.filter((n) => n.id !== nodeId));
      }
      if (onWorkflowEdgesChange && wfEdgesRef.current) {
        onWorkflowEdgesChange(wfEdgesRef.current.filter((e) => e.sourceId !== nodeId && e.targetId !== nodeId));
      }
      setSelectedNode(null);
      setActivePanel("palette");

      // Push to undo history (structural change)
      setTimeout(() => {
        const allN = reactFlowInstance.getNodes();
        const allE = reactFlowInstance.getEdges();
        pushHistory(allN, allE);
        updateUndoRedoState();
      }, 50);
    },
    [setNodes, setEdges, onWorkflowNodesChange, onWorkflowEdgesChange, reactFlowInstance, pushHistory, updateUndoRedoState]
  );

  const handleClosePanel = useCallback(() => {
    setSelectedNode(null);
    setActivePanel("none");
  }, []);

  // Node search: create node and open config panel
  const handleNodeSearchSelect = useCallback(
    (nodeType: string, position?: { x: number; y: number }) => {
      const def = WORKFLOW_NODE_DEFINITIONS.find((d) => d.type === nodeType);
      if (!def) return;

      // Default position: center of viewport
      let pos = position;
      if (!pos) {
        const viewport = reactFlowInstance.getViewport();
        const bounds = reactFlowWrapper.current?.getBoundingClientRect();
        if (bounds) {
          pos = reactFlowInstance.screenToFlowPosition({
            x: bounds.width / 2,
            y: bounds.height / 2,
          });
        } else {
          pos = { x: -viewport.x / viewport.zoom + 400, y: -viewport.y / viewport.zoom + 300 };
        }
      }

      const wfNode = createWorkflowNode(nodeType as WorkflowNodeType, pos);
      const newFlowNode: Node = {
        id: wfNode.id,
        type: "workflowNode",
        position: pos,
        data: {
          label: wfNode.label,
          nodeType: wfNode.type,
          category: def.category,
          description: def.description,
          iconName: def.icon,
          config: wfNode.config,
        },
      };

      setNodes((nds) => [...nds, newFlowNode]);
      if (onWorkflowNodesChange && wfNodes) {
        onWorkflowNodesChange([...wfNodes, wfNode]);
      }

      // Open config panel for the new node
      setSelectedNode({
        id: wfNode.id,
        type: wfNode.type,
        label: wfNode.label,
        config: wfNode.config,
      });
      setActivePanel("config");

      setTimeout(() => {
        pushHistory(reactFlowInstance.getNodes(), reactFlowInstance.getEdges());
        updateUndoRedoState();
      }, 50);
    },
    [setNodes, onWorkflowNodesChange, wfNodes, reactFlowInstance, pushHistory, updateUndoRedoState]
  );

  const isEmpty = members.length === 0 && (!wfNodes || wfNodes.length === 0) && nodes.length === 0;

  // Drops a node of the given type into the canvas center. Used by the
  // empty-state quick-start buttons so brand-new workflows aren't
  // staring at a blank canvas — operators get a one-click on-ramp.
  const addNodeAtCenter = useCallback(
    (type: WorkflowNodeType) => {
      const def = WORKFLOW_NODE_DEFINITIONS.find((d) => d.type === type);
      if (!def) return;

      // Calculate canvas center in flow coordinates. Falls back to (0,0)
      // when the wrapper isn't measured yet (very first paint).
      let position = { x: 0, y: 0 };
      try {
        const wrap = reactFlowWrapper.current;
        if (wrap) {
          const rect = wrap.getBoundingClientRect();
          position = reactFlowInstance.screenToFlowPosition({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          });
        }
      } catch {
        // Best-effort; the node still drops at (0,0) if anything throws.
      }

      const wfNode = createWorkflowNode(type, position);
      const newFlowNode: Node = {
        id: wfNode.id,
        type: "workflowNode",
        position,
        data: {
          label: wfNode.label,
          nodeType: wfNode.type,
          category: def.category,
          description: def.description,
          iconName: def.icon,
          config: wfNode.config,
        },
      };

      setNodes((nds) => [...nds, newFlowNode]);
      if (onWorkflowNodesChange) {
        const currentWfNodes = wfNodes || [];
        onWorkflowNodesChange([
          ...currentWfNodes,
          {
            id: wfNode.id,
            type: wfNode.type,
            label: wfNode.label,
            position,
            config: wfNode.config,
          },
        ]);
      }

      setTimeout(() => {
        const allN = reactFlowInstance.getNodes();
        const allE = reactFlowInstance.getEdges();
        pushHistory(allN, allE);
        updateUndoRedoState();
      }, 50);
    },
    [
      reactFlowInstance,
      setNodes,
      onWorkflowNodesChange,
      wfNodes,
      pushHistory,
      updateUndoRedoState,
    ]
  );

  const addCommentAtScreenPosition = useCallback(
    (screen: { x: number; y: number }) => {
      const position = reactFlowInstance.screenToFlowPosition(screen);
      const wfNode = createWorkflowNode("comment", position, {
        label: "Comment",
        config: { content: "Add a note...", color: "yellow", width: 260, height: 160 },
      });
      const def = WORKFLOW_NODE_DEFINITIONS.find((d) => d.type === "comment");
      if (!def) return;

      const newFlowNode: Node = {
        id: wfNode.id,
        type: "workflowNode",
        position,
        data: {
          label: wfNode.label,
          nodeType: wfNode.type,
          category: def.category,
          description: def.description,
          iconName: def.icon,
          config: wfNode.config,
        },
      };

      setNodes((nds) => [...nds, newFlowNode]);
      if (onWorkflowNodesChange) {
        onWorkflowNodesChange([...(wfNodes || []), wfNode]);
      }
      fetch(`/api/teams/${teamId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Add a note...", color: "yellow", position }),
      }).catch(() => {});
    },
    [reactFlowInstance, setNodes, onWorkflowNodesChange, wfNodes, teamId]
  );

  // Execution status label
  const execLabel =
    executionStatus === "running"
      ? "Running..."
      : executionStatus === "completed"
        ? `Completed${executionDuration ? ` (${(executionDuration / 1000).toFixed(1)}s` : ""}${executionCredits ? `, ${executionCredits} credits)` : executionDuration ? ")" : ""}`
        : executionStatus === "failed"
          ? "Failed"
          : "Idle";

  // Build timeline data for the execution panel
  const timelineData = useMemo<ExecutionTimelineData | null>(() => {
    if (!nodeResults || Object.keys(nodeResults).length === 0) {
      return null;
    }

    const entries: TimelineNodeEntry[] = [];
    for (const [nId, result] of Object.entries(nodeResults)) {
      entries.push({
        nodeId: nId,
        nodeLabel: result.nodeLabel || wfNodes?.find((n) => n.id === nId)?.label || nId,
        nodeType: result.nodeType || wfNodes?.find((n) => n.id === nId)?.type || "unknown",
        status: (result.status || "pending") as TimelineNodeEntry["status"],
        durationMs: result.durationMs,
        credits: result.credits,
        error: result.error ? { type: "runtime_error", message: result.error } : undefined,
        input: result.input,
        output: result.output,
        meta: result.meta,
      });
    }

    return {
      status: executionStatus ?? "idle",
      totalDurationMs: executionDuration,
      totalCredits: executionCredits,
      entries,
      logs: executionLogs,
    };
  }, [nodeResults, executionStatus, executionDuration, executionCredits, executionLogs, wfNodes]);

  return (
    <CanvasErrorBoundary>
    <div className="h-full w-full relative" ref={reactFlowWrapper}>
      {/* Node Palette Sidebar */}
      <NodePaletteSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => {
          if (activePanel === "palette") {
            setActivePanel("none");
          } else {
            setSelectedNode(null);
            setActivePanel("palette");
          }
        }}
      />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        selectionMode={SelectionMode.Partial}
        selectionOnDrag={true}
        panOnDrag={[1, 2]}
        multiSelectionKeyCode={["Meta", "Control"]}
        onSelectionChange={({ nodes: selNodes }) => {
          setSelectedNodeIds(selNodes.filter((n) => n.type === "workflowNode").map((n) => n.id));
        }}
        onNodeContextMenu={(e, node) => {
          e.preventDefault();
          if (node.type !== "workflowNode") return;
          setContextMenu({
            x: e.clientX,
            y: e.clientY,
            nodeId: node.id,
            nodeType: (node.data as WorkflowNodeData).nodeType,
          });
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          const event = e as unknown as { clientX: number; clientY: number };
          setContextMenu({ x: event.clientX, y: event.clientY });
        }}
        onConnect={onConnect}
        onNodeDragStop={handleNodeDragStop}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.15}
        maxZoom={2}
        nodeDragThreshold={2}
        proOptions={{ hideAttribution: true }}
        colorMode="light"
        className="bg-card"
        isValidConnection={isValidConnection}
        connectionLineStyle={{ stroke: "#F97316", strokeWidth: 2, strokeDasharray: "5 3" }}
        defaultEdgeOptions={{ type: "animated", animated: true }}
        onNodeClick={(_event, node) => {
          if (node.id.startsWith("__fallback__")) return;
          if (node.type === "workflowNode") {
            const nd = node.data as WorkflowNodeData;
            // Open config panel, collapse palette to make room
            setSelectedNode({
              id: node.id,
              type: nd.nodeType,
              label: nd.label as string,
              config: nd.config as Record<string, unknown>,
            });
            setActivePanel("config");
            return;
          }
          setSelectedNode(null);
          onNodeClick(node.id);
        }}
        onPaneClick={() => {
          if (selectedNode) {
            setSelectedNode(null);
            setActivePanel("none");
          }
        }}
        onDoubleClick={(e) => {
          // Double-click on empty canvas → open node search at cursor position
          const bounds = reactFlowWrapper.current?.getBoundingClientRect();
          if (bounds) {
            const pos = reactFlowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
            setNodeSearchPosition(pos);
          }
          setNodeSearchOpen(true);
        }}
        onEdgeClick={(_event, edge) => {
          onEdgeClickProp?.(edge.id, edge.source, edge.target);
        }}
        deleteKeyCode={["Backspace", "Delete"]}
        onEdgesDelete={(deletedEdges) => {
          deletedEdges.forEach((e) => {
            if (!e.id.startsWith("e-")) return;
            onConnectionDelete?.(e.source, e.target);
          });
          setTimeout(() => { pushHistory(reactFlowInstance.getNodes(), reactFlowInstance.getEdges()); updateUndoRedoState(); }, 50);
        }}
        onNodesDelete={(deletedNodes) => {
          if (!onWorkflowNodesChange || !wfNodes) return;
          const deletedIds = new Set(deletedNodes.map((n) => n.id));
          const remaining = wfNodes.filter((n) => !deletedIds.has(n.id));
          if (remaining.length !== wfNodes.length) {
            onWorkflowNodesChange(remaining);
          }
          setTimeout(() => { pushHistory(reactFlowInstance.getNodes(), reactFlowInstance.getEdges()); updateUndoRedoState(); }, 50);
        }}
        snapToGrid
        snapGrid={[20, 20]}
      >
        {/* Dot grid background — theme-aware. Uses CSS-var color via
            visual-team-editor-styles override; the prop is a fallback for
            edge cases where the override doesn't apply. */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.5}
          className="kiln-canvas-bg"
        />

        <MiniMap
          nodeColor={(node) => {
            if (node.type === "workflowNode") {
              const cat = (node.data as WorkflowNodeData)?.category;
              return workflowNodeColors[cat]?.hex || "hsl(var(--primary))";
            }
            const role = (node.data as VisualNodeData)?.role;
            return roleColors[role]?.hex || "hsl(var(--primary))";
          }}
          maskColor="hsl(var(--muted) / 0.6)"
          className="!bg-card !border-border rounded-xl shadow-lg"
          style={{ backgroundColor: "hsl(var(--card))" }}
          pannable
          zoomable
        />

        {/* Custom zoom controls — n8n/Figma-style with zoom-percent pill */}
        <Panel position="bottom-left" className="!mb-4 !ml-4">
          <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-xl">
            <button
              onClick={handleZoomOut}
              title="Zoom out (Ctrl+-)"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleZoomReset}
              title="Reset zoom (Ctrl+0)"
              className="min-w-[44px] rounded-lg px-1.5 py-1 text-[10px] font-mono font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {zoomPercent}%
            </button>
            <button
              onClick={handleZoomIn}
              title="Zoom in (Ctrl++)"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <div className="mx-0.5 h-4 w-px bg-border" />
            <button
              onClick={handleFitView}
              title="Fit to screen (Ctrl+1)"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </Panel>

        {/* Empty state overlay — rendered INSIDE ReactFlow so the canvas
            stays a valid drop target. Quick-start buttons one-click-add
            a node at the canvas center; the drag-and-drop path from the
            palette also still works. */}
        {isEmpty && (
          <Panel position="top-center" className="!mt-[18%]">
            <div className="flex flex-col items-center gap-5 pointer-events-auto">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10 border border-orange-500/20">
                <LayoutGrid className="h-7 w-7 text-orange-500/60" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  Start building your workflow
                </p>
                <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                  Pick a starting node — or drag one from the library on
                  the left.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <QuickStartChip
                  label="+ Trigger"
                  description="Webhook / Schedule / Manual"
                  onClick={() => addNodeAtCenter("trigger_manual")}
                />
                <QuickStartChip
                  label="+ AI Agent"
                  description="Use existing or inline"
                  onClick={() => addNodeAtCenter("agent")}
                  primary
                />
                <QuickStartChip
                  label="+ Integration"
                  description="Slack, Sheets, Notion…"
                  onClick={() => addNodeAtCenter("slack_send_integration")}
                />
                <QuickStartChip
                  label="+ Action"
                  description="HTTP / Email / Slack"
                  onClick={() => addNodeAtCenter("http_request")}
                />
              </div>
              {sidebarCollapsed && (
                <button
                  onClick={() => {
                    setSelectedNode(null);
                    setActivePanel("palette");
                  }}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <PanelLeft className="h-3.5 w-3.5" />
                  Show node palette
                </button>
              )}
            </div>
          </Panel>
        )}

        {/* Toolbar */}
        <Panel position="top-right" className="flex items-center gap-2">
          {/* Execution status */}
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 shadow-md">
            <div className={cn(
              "h-2 w-2 rounded-full",
              executionStatus === "running" && "bg-orange-400 animate-pulse",
              executionStatus === "completed" && "bg-green-400",
              executionStatus === "failed" && "bg-red-400",
              executionStatus === "idle" && "bg-muted",
            )} />
            <span className="text-[11px] text-muted-foreground">{execLabel}</span>
          </div>

          {/* Save indicator */}
          {saveStatus !== "idle" && (
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-md">
              {saveStatus === "saving" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              {saveStatus === "saved" && <Check className="h-3 w-3 text-green-400" />}
              <span className={cn("text-[10px]", saveStatus === "saved" ? "text-green-400" : "text-muted-foreground")}>
                {saveStatus === "saving" ? "Saving..." : "Saved"}
              </span>
            </div>
          )}

          {/* Run Workflow */}
          {onRunWorkflow && (
            <Button
              size="sm"
              onClick={onRunWorkflow}
              disabled={executionStatus === "running"}
              className="bg-orange-600 text-white hover:bg-orange-500 disabled:opacity-50 shadow-md text-xs"
            >
              {executionStatus === "running" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 mr-1.5" />
              )}
              {executionStatus === "running" ? "Running..." : "Run Workflow"}
            </Button>
          )}

          {onVariablesClick && (
            <Button
              size="sm"
              variant="outline"
              onClick={onVariablesClick}
              className="bg-card border-foreground/20 text-muted-foreground hover:text-foreground hover:bg-muted/40 shadow-md text-xs"
            >
              <Variable className="h-3.5 w-3.5 mr-1.5" />
              Variables
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleAutoLayout}
            className="bg-card border-foreground/20 text-muted-foreground hover:text-foreground hover:bg-muted/40 shadow-md text-xs"
          >
            <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />
            Auto Layout
          </Button>

          {/* Undo / Redo */}
          <div className="flex items-center rounded-lg border border-border bg-card shadow-md overflow-hidden">
            <button
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <div className="w-px h-4 bg-muted" />
            <button
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z)"
              className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </Panel>

        {/* Execution legend — sits above zoom controls when active */}
        {executionSteps && executionSteps.length > 0 && (
          <Panel position="bottom-left" className="!mb-16 !ml-4">
            <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-lg">
              <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Status</p>
              <div className="flex items-center gap-3">
                {[
                  { color: "bg-blue-400", label: "Running" },
                  { color: "bg-green-400", label: "Done" },
                  { color: "bg-red-400", label: "Failed" },
                  { color: "bg-muted", label: "Pending" },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-1">
                    <div className={cn("h-2 w-2 rounded-full", s.color)} />
                    <span className="text-[10px] text-muted-foreground">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        )}
        {/* Add node button — bottom center */}
        <Panel position="bottom-center" className="!mb-4">
          <button
            onClick={() => {
              setNodeSearchPosition(undefined);
              setNodeSearchOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-xl border border-foreground/20 bg-card px-3.5 py-2 text-xs font-medium text-muted-foreground shadow-lg transition-all hover:border-orange-500/40 hover:text-orange-400 hover:shadow-orange-500/5"
            title="Add node (or press /)"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Node
            <kbd className="ml-1 rounded bg-card px-1 py-0.5 text-[9px] font-mono text-muted-foreground">/</kbd>
          </button>
        </Panel>

        {/* Multi-selection floating toolbar — appears when 2+ nodes selected */}
        {selectedNodeIds.length >= 2 && (
          <Panel position="top-center" className="!mt-4">
            <div className="flex items-center gap-1.5 rounded-xl border border-orange-500/40 bg-card px-2.5 py-1.5 shadow-xl shadow-orange-500/5">
              <span className="text-[10px] font-medium text-orange-400 px-1.5">
                {selectedNodeIds.length} selected
              </span>
              <div className="h-4 w-px bg-border" />
              <button
                onClick={() => handleBulkDuplicate()}
                title="Duplicate (Ctrl+D)"
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Copy className="h-3 w-3" />
                Duplicate
              </button>
              <button
                onClick={() => handleBulkDelete()}
                title="Delete (Backspace)"
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-red-400 transition-colors hover:bg-red-500/10"
              >
                <Trash2 className="h-3 w-3" />
                Delete ({selectedNodeIds.length})
              </button>
            </div>
          </Panel>
        )}
      </ReactFlow>

      {/* Node Search Command Palette */}
      <NodeSearch
        open={nodeSearchOpen}
        onClose={() => setNodeSearchOpen(false)}
        onSelectNode={handleNodeSearchSelect}
        position={nodeSearchPosition}
      />

      {/* Right-click Context Menu — node-targeted or pane-only */}
      {contextMenu && (
        <CanvasContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={(() => {
            const items: CanvasContextMenuItem[] = [];
            if (contextMenu.nodeId) {
              const nId = contextMenu.nodeId;
              const targetNode = reactFlowInstance.getNode(nId);
              const isDisabled = !!(targetNode?.data as WorkflowNodeData)?.config?.disabled;
              items.push(
                { id: "duplicate", label: "Duplicate", shortcut: "⌘D", icon: "copy", onClick: () => {
                    setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nId })));
                    setTimeout(() => duplicateSelected(), 0);
                  }
                },
                { id: "test", label: "Test This Node", icon: "test", onClick: () => {
                    const wfNode = wfNodesRef.current?.find((n) => n.id === nId);
                    if (wfNode) {
                      setSelectedNode({ id: wfNode.id, type: wfNode.type, label: wfNode.label, config: wfNode.config });
                      setActivePanel("config");
                    }
                  }
                },
                { id: "logs", label: "View Node Logs", icon: "logs", onClick: () => {
                    const wfNode = wfNodesRef.current?.find((n) => n.id === nId);
                    if (wfNode) {
                      setSelectedNode({ id: wfNode.id, type: wfNode.type, label: wfNode.label, config: wfNode.config });
                      setActivePanel("config");
                    }
                  }
                },
                { id: "__divider__", label: "", onClick: () => {} },
                { id: "disable", label: isDisabled ? "Enable Node" : "Disable Node", icon: "disable", onClick: () => toggleNodeDisabled(nId) },
                { id: "comment", label: "Add Annotation", icon: "comment", onClick: () => addCommentAtScreenPosition({ x: contextMenu.x, y: contextMenu.y }) },
                { id: "__divider__", label: "", onClick: () => {} },
                { id: "delete", label: "Delete", shortcut: "⌫", icon: "delete", destructive: true, onClick: () => handleNodeDelete(nId) },
              );
            } else {
              items.push(
                { id: "add", label: "Add Node…", shortcut: "/", icon: "add", onClick: () => {
                    const pos = reactFlowInstance.screenToFlowPosition({ x: contextMenu.x, y: contextMenu.y });
                    setNodeSearchPosition(pos);
                    setNodeSearchOpen(true);
                  }
                },
                {
                  id: "paste",
                  label: "Paste",
                  shortcut: "⌘V",
                  icon: "paste",
                  disabled: !clipboardNodes,
                  onClick: () => pasteFromClipboard(),
                },
                { id: "comment", label: "Add Comment", icon: "comment", onClick: () => addCommentAtScreenPosition({ x: contextMenu.x, y: contextMenu.y }) },
              );
            }
            return items;
          })()}
        />
      )}

      {/* Node Config Panel (right side) */}
      {selectedNode && (() => {
        const nr = nodeResults?.[selectedNode.id];
        const hasUpstream = edges.some((e) => e.target === selectedNode.id || nodes.some((n) => n.type === "workflowNode" && edges.some((ed) => ed.source === n.id && ed.target === selectedNode.id)));
        const isTrigger = wfNodes?.some((n) => n.id === selectedNode.id && (n.type as string).startsWith("trigger"));
        return (
          <NodeConfigPanel
            nodeId={selectedNode.id}
            nodeType={selectedNode.type}
            label={selectedNode.label}
            config={selectedNode.config}
            onConfigChange={handleNodeConfigChange}
            onLabelChange={handleNodeLabelChange}
            onDelete={handleNodeDelete}
            onClose={handleClosePanel}
            teamId={teamId}
            lastRunInput={nr?.input}
            lastRunResult={nr?.output}
            lastRunError={nr?.error}
            lastRunDurationMs={nr?.durationMs}
            lastRunCredits={nr?.credits}
            lastRunStatus={nr?.status}
            hasUpstreamConnection={hasUpstream}
            isTriggerNode={isTrigger}
          />
        );
      })()}

      {/* Execution Timeline Panel (bottom) */}
      <ExecutionTimelinePanel
        data={timelineData}
        onNodeClick={(nId) => {
          // Open the node's config panel and switch to Output tab
          const wfNode = wfNodes?.find((n) => n.id === nId);
          if (wfNode) {
            setSelectedNode({ id: wfNode.id, type: wfNode.type, label: wfNode.label, config: wfNode.config });
            setActivePanel("config");
          }
        }}
        onNodeFix={(nId) => {
          const wfNode = wfNodes?.find((n) => n.id === nId);
          if (wfNode) {
            setSelectedNode({ id: wfNode.id, type: wfNode.type, label: wfNode.label, config: wfNode.config });
            setActivePanel("config");
          }
        }}
        onHighlightNode={(nId) => {
          // Scroll to and briefly highlight the node
          const rfNode = reactFlowInstance.getNode(nId);
          if (rfNode) {
            reactFlowInstance.fitView({ nodes: [rfNode], padding: 0.5, duration: 300 });
          }
        }}
      />
    </div>
    </CanvasErrorBoundary>
  );
}
