"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
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
  agentMode?: "CHAT" | "TASK";
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
  workflowEdges?: { sourceId: string; targetId: string; condition?: string; sourceHandle?: string }[];
  onWorkflowNodesChange?: (nodes: { id: string; type: WorkflowNodeType; label: string; position: { x: number; y: number }; config: Record<string, unknown> }[]) => void;
  onWorkflowEdgesChange?: (edges: { sourceId: string; targetId: string; condition?: string; sourceHandle?: string }[]) => void;
  onWorkflowNodeClick?: (nodeId: string, nodeType: WorkflowNodeType, config: Record<string, unknown>) => void;
  onEdgeClick?: (edgeId: string, sourceNodeId: string, targetNodeId: string) => void;
  onVariablesClick?: () => void;
  onRunWorkflow?: () => void;
  executionStatus?: "idle" | "running" | "completed" | "failed";
  executionDuration?: number;
  executionCredits?: number;
  nodeResults?: Record<string, { input?: unknown; output?: unknown; status?: "completed" | "failed" | "running" }>;
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
  Target, Eye, Terminal,
};

const NODE_WIDTH = 240;
const NODE_HEIGHT = 80;

/* ========== Handle Styles ========== */
const handleBase = "!w-[10px] !h-[10px] !border-[2px] !border-[#332f2b] !rounded-full transition-colors";
const handleInput = `${handleBase} !bg-[#52525b] hover:!bg-orange-400`;
const handleOutput = `${handleBase} !bg-[#52525b] hover:!bg-orange-400`;

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
  agentMode?: string;
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
        "rounded-xl bg-[#2a2826] border border-[#3d3935] shadow-lg min-w-[220px] max-w-[260px] transition-all duration-150",
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
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-1">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", rc.bg)}>
          <Bot className={cn("h-4.5 w-4.5", rc.text)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-zinc-100 truncate leading-tight">{data.agentName}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={cn("text-[9px] font-bold uppercase tracking-wider", rc.text)}>{role}</span>
            {execStatus && execStatus !== "pending" && (
              <span className={cn(
                "text-[8px] font-medium px-1 py-0.5 rounded flex items-center gap-0.5",
                execStatus === "running" && "bg-blue-500/15 text-blue-400",
                execStatus === "completed" && "bg-green-500/15 text-green-400",
                execStatus === "awaiting_approval" && "bg-amber-500/15 text-amber-300",
                execStatus === "failed" && "bg-red-500/15 text-red-400",
                execStatus === "skipped" && "bg-zinc-700/40 text-zinc-500",
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
          <span className="text-[9px] bg-[#242220] text-zinc-400 px-1.5 py-0.5 rounded border border-[#3d3935]">
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
  [key: string]: unknown;
};

function WorkflowNodeComponent({ data, selected }: NodeProps<Node<WorkflowNodeData>>) {
  const category = data.category as WorkflowNodeCategory;
  const colors = workflowNodeColors[category] || workflowNodeColors.actions;
  const IconComp = iconMap[data.iconName as string] || Zap;
  const nodeType = data.nodeType as WorkflowNodeType;
  const isLogicNode = category === "logic";
  const isTriggerNode = category === "triggers";

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

  return (
    <div
      className={cn(
        "rounded-xl bg-[#2a2826] border border-[#3d3935] shadow-lg min-w-[200px] max-w-[240px] transition-all duration-150",
        selected && "border-orange-500/70 shadow-orange-500/10 shadow-xl",
      )}
    >
      {/* Input handle — left (not for triggers) */}
      {!isTriggerNode && (
        <Handle
          type="target"
          position={Position.Left}
          className={cn(handleInput, "!-left-[5px]")}
        />
      )}

      {/* Content */}
      <div className="flex items-center gap-2.5 px-3 py-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${colors.hex}15` }}
        >
          <span style={{ color: colors.hex }}><IconComp className="h-4.5 w-4.5" /></span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-zinc-100 truncate leading-tight">{data.label as string}</p>
          <p className="text-[10px] text-zinc-500 truncate mt-0.5" style={{ color: `${colors.hex}99` }}>
            {data.description as string}
          </p>
        </div>
      </div>

      {/* Config preview */}
      {preview && (
        <div className="px-3 pb-2.5 -mt-1">
          <p className="text-[10px] font-mono text-zinc-500 truncate bg-[#242220] rounded px-2 py-1 border border-[#3d3935]/50">
            {preview}
          </p>
        </div>
      )}

      {/* Output handles — right side */}
      {isLogicNode ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            className="!w-[10px] !h-[10px] !border-[2px] !border-[#332f2b] !rounded-full !bg-green-500 !-right-[5px]"
            style={{ top: "35%" }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            className="!w-[10px] !h-[10px] !border-[2px] !border-[#332f2b] !rounded-full !bg-red-500 !-right-[5px]"
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
              className="!w-[7px] !h-[7px] !border-[1.5px] !border-[#332f2b] !rounded-full !bg-red-500/60 hover:!bg-red-400 !-right-[4px]"
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
    <div className="rounded-xl bg-[#2a2826] border border-cyan-500/30 shadow-lg min-w-[180px] max-w-[200px]">
      <Handle
        type="source"
        position={Position.Right}
        className="!w-[10px] !h-[10px] !border-[2px] !border-[#332f2b] !rounded-full !bg-cyan-500 !-right-[5px]"
      />
      <div className="flex items-center gap-2.5 px-3 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15">
          <BookOpen className="h-4 w-4 text-cyan-400" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-zinc-200">Workflow Knowledge</p>
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
    <div className="rounded-xl border border-dashed border-orange-500/30 bg-[#2a2826]/80 shadow-lg min-w-[200px] max-w-[240px] opacity-90">
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="!w-[10px] !h-[10px] !border-[2px] !border-[#332f2b] !rounded-full !bg-orange-400 !-left-[5px]"
      />
      <div className="flex items-center gap-2.5 px-3 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/15">
          <AlertTriangle className="h-4 w-4 text-orange-300" />
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-wider text-orange-300">Fallback</p>
          <p className="truncate text-[13px] font-semibold text-zinc-200">{data.agentName}</p>
          {model && <p className="text-[10px] text-zinc-500 mt-0.5">{model.shortLabel}</p>}
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

  const isExecuting = data?.executionActive as boolean;
  const isFallback = data?.isFallback as boolean;
  const isErrorEdge = data?.isErrorEdge as boolean;

  const strokeColor = isErrorEdge
    ? "#EF4444"
    : isFallback
      ? "#FB923C"
      : isExecuting
        ? "#F97316"
        : selected
          ? "#F97316"
          : "#4a4540";

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

      {/* Main edge */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth: selected ? 2.5 : isExecuting ? 2.5 : 1.5,
          strokeDasharray: isErrorEdge ? "6 4" : isFallback ? "5 5" : isExecuting ? "8 4" : undefined,
          animation: isExecuting ? "dashmove 0.5s linear infinite" : undefined,
        }}
        markerEnd={MarkerType.ArrowClosed}
      />

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
                  : "bg-[#2a2826] border-[#4a4540] text-zinc-400 hover:border-zinc-500 hover:text-zinc-300"
            )}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {data.label as string}
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
    </>
  );
}

/* ========== Node & Edge types ========== */
const nodeTypes = {
  visualAgent: VisualAgentNode,
  workflowNode: WorkflowNodeComponent,
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
          className="m-2.5 flex h-9 w-9 items-center justify-center rounded-lg border border-[#3d3935] bg-[#242220] text-zinc-400 shadow-md transition-colors hover:bg-[#2a2826] hover:text-zinc-200"
          title="Show node palette"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="absolute left-0 top-0 z-20 flex h-full w-[240px] flex-col border-r border-[#332f2b] bg-[#1e1d1b]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-[#332f2b]">
        <span className="text-xs font-semibold text-zinc-300">Nodes</span>
        <button
          onClick={onToggle}
          className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-[#332f2b] hover:text-zinc-300"
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-[#332f2b]">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nodes..."
            className="w-full bg-[#1a1918] border border-[#332f2b] rounded-lg text-xs text-zinc-200 pl-8 pr-3 py-1.5 outline-none focus:border-orange-500/50 placeholder:text-zinc-500 transition-colors"
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

          return (
            <div key={cat.id}>
              {/* Category header */}
              <button
                onClick={() => toggleCategory(cat.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[#222230]"
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3 text-zinc-500 shrink-0" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-zinc-500 shrink-0" />
                )}
                <span className="flex-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                  {cat.label}
                </span>
                <span className="text-[10px] text-zinc-500">{filteredNodes.length}</span>
              </button>

              {/* Thin divider */}
              {!isExpanded && <div className="mx-3 border-b border-[#332f2b]/60" />}

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
                          className="flex cursor-grab items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[#332f2b]/80 active:cursor-grabbing active:bg-[#332f2b]"
                        >
                          <div
                            className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded"
                            style={{ backgroundColor: `${def.color}12` }}
                          >
                            <span style={{ color: def.color }}><Icon className="h-[14px] w-[14px]" /></span>
                          </div>
                          <span className="text-[12px] text-zinc-300 truncate">{def.label}</span>
                        </div>

                        {/* Tooltip on hover */}
                        {hoveredNode === def.type && (
                          <div className="absolute left-full top-0 ml-2 z-50 w-48 rounded-lg border border-[#3d3935] bg-[#242220] px-3 py-2 shadow-xl pointer-events-none">
                            <p className="text-[11px] font-medium text-zinc-200">{def.label}</p>
                            <p className="text-[10px] text-zinc-500 mt-0.5">{def.description}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="mx-3 mt-1 border-b border-[#332f2b]/60" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
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
    const agentMode = m.role === "APPROVAL_GATE" ? "APPROVAL" : (m.agent?.agentMode || undefined);

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
        agentMode,
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

  // Workflow edges
  if (workflowEdges && workflowEdges.length > 0) {
    workflowEdges.forEach((we) => {
      edges.push({
        id: `wfe-${we.sourceId}-${we.targetId}`,
        source: we.sourceId,
        target: we.targetId,
        sourceHandle: we.sourceHandle || undefined,
        type: "animated",
        animated: true,
        data: {
          label: we.condition || undefined,
          executionActive: false,
          isErrorEdge: we.sourceHandle === "error" || we.condition === "error",
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

function VisualTeamEditorInner({
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
  onWorkflowNodeClick,
  onEdgeClick: onEdgeClickProp,
  onVariablesClick,
  onRunWorkflow,
  executionStatus = "idle",
  executionDuration,
  executionCredits,
  nodeResults,
}: VisualTeamEditorProps) {
  const reactFlowInstance = useReactFlow();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Config panel state
  const [selectedNode, setSelectedNode] = useState<{
    id: string;
    type: WorkflowNodeType;
    label: string;
    config: Record<string, unknown>;
  } | null>(null);

  // Inject dash animation CSS
  useEffect(() => {
    const styleId = "visual-team-editor-styles";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes dashmove { 0% { stroke-dashoffset: 12; } 100% { stroke-dashoffset: 0; } }
      .react-flow__edge.selected .react-flow__edge-path { stroke: #F97316 !important; }
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

  // Update nodes/edges when data changes
  useEffect(() => {
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

  // Handle new connections
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
      onConnectionCreate?.(connection.source, connection.target);
    },
    [setEdges, onConnectionCreate]
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

        const bounds = reactFlowWrapper.current?.getBoundingClientRect();
        if (!bounds) return;

        const position = reactFlowInstance.screenToFlowPosition({
          x: e.clientX - bounds.left,
          y: e.clientY - bounds.top,
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
      } catch {
        // Invalid drag data
      }
    },
    [reactFlowInstance, setNodes, onWorkflowNodesChange, wfNodes]
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
      }
      // Update local selected state
      setSelectedNode((prev) => (prev && prev.id === nodeId ? { ...prev, config: newConfig } : prev));
    },
    [setNodes, onWorkflowNodesChange, wfNodes]
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
      if (onWorkflowNodesChange && wfNodes) {
        onWorkflowNodesChange(wfNodes.filter((n) => n.id !== nodeId));
      }
      setSelectedNode(null);
    },
    [setNodes, setEdges, onWorkflowNodesChange, wfNodes]
  );

  const handleClosePanel = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const isEmpty = members.length === 0 && (!wfNodes || wfNodes.length === 0) && nodes.length === 0;

  // Execution status label
  const execLabel =
    executionStatus === "running"
      ? "Running..."
      : executionStatus === "completed"
        ? `Completed${executionDuration ? ` (${(executionDuration / 1000).toFixed(1)}s` : ""}${executionCredits ? `, ${executionCredits} credits)` : executionDuration ? ")" : ""}`
        : executionStatus === "failed"
          ? "Failed"
          : "Idle";

  return (
    <div className="h-full w-full relative" ref={reactFlowWrapper}>
      {/* Node Palette Sidebar */}
      <NodePaletteSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={handleNodeDragStop}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.15}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="bg-[#1a1918]"
        connectionLineStyle={{ stroke: "#F97316", strokeWidth: 2, strokeDasharray: "5 3" }}
        defaultEdgeOptions={{ type: "animated", animated: true }}
        onNodeClick={(_event, node) => {
          if (node.id.startsWith("__fallback__")) return;
          if (node.type === "workflowNode") {
            const nd = node.data as WorkflowNodeData;
            // Open config panel
            setSelectedNode({
              id: node.id,
              type: nd.nodeType,
              label: nd.label as string,
              config: nd.config as Record<string, unknown>,
            });
            onWorkflowNodeClick?.(node.id, nd.nodeType, nd.config);
            return;
          }
          setSelectedNode(null);
          onNodeClick(node.id);
        }}
        onPaneClick={() => {
          setSelectedNode(null);
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
        }}
        onNodesDelete={(deletedNodes) => {
          if (!onWorkflowNodesChange || !wfNodes) return;
          const deletedIds = new Set(deletedNodes.map((n) => n.id));
          const remaining = wfNodes.filter((n) => !deletedIds.has(n.id));
          if (remaining.length !== wfNodes.length) {
            onWorkflowNodesChange(remaining);
          }
        }}
        snapToGrid
        snapGrid={[20, 20]}
      >
        {/* Dot grid background — subtle like n8n/Figma */}
        <Background
          variant={BackgroundVariant.Dots}
          color="#332f2b"
          gap={20}
          size={1}
        />

        <MiniMap
          nodeColor={(node) => {
            if (node.type === "workflowNode") {
              const cat = (node.data as WorkflowNodeData)?.category;
              return workflowNodeColors[cat]?.hex || "#4a4540";
            }
            const role = (node.data as VisualNodeData)?.role;
            return roleColors[role]?.hex || "#4a4540";
          }}
          maskColor="rgba(10,10,18,0.8)"
          className="!bg-[#1e1d1b] !border-[#332f2b] rounded-xl"
          pannable
          zoomable
        />

        <Controls
          className="!bg-[#1e1d1b] !border-[#332f2b] !rounded-xl !shadow-xl [&>button]:!bg-[#2a2826] [&>button]:!border-[#3d3935] [&>button]:!text-zinc-400 [&>button:hover]:!bg-[#332f2b] [&>button:hover]:!text-zinc-200"
          showInteractive={false}
        />

        {/* Empty state overlay — rendered INSIDE ReactFlow so drop target stays active */}
        {isEmpty && (
          <Panel position="top-center" className="!mt-[25%]">
            <div className="flex flex-col items-center gap-4 pointer-events-auto">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10 border border-orange-500/20">
                <LayoutGrid className="h-7 w-7 text-orange-500/50" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-zinc-300 mb-1">Start building your workflow</p>
                <p className="text-xs text-zinc-500 max-w-xs">
                  Drag nodes from the palette and drop them here
                </p>
              </div>
              {sidebarCollapsed && (
                <button
                  onClick={() => setSidebarCollapsed(false)}
                  className="flex items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-400 transition-colors hover:bg-orange-500/20"
                >
                  <PanelLeft className="h-3.5 w-3.5" />
                  Show Node Palette
                </button>
              )}
            </div>
          </Panel>
        )}

        {/* Toolbar */}
        <Panel position="top-right" className="flex items-center gap-2">
          {/* Execution status */}
          <div className="flex items-center gap-2 rounded-lg border border-[#332f2b] bg-[#1e1d1b] px-3 py-1.5 shadow-md">
            <div className={cn(
              "h-2 w-2 rounded-full",
              executionStatus === "running" && "bg-orange-400 animate-pulse",
              executionStatus === "completed" && "bg-green-400",
              executionStatus === "failed" && "bg-red-400",
              executionStatus === "idle" && "bg-zinc-600",
            )} />
            <span className="text-[11px] text-zinc-400">{execLabel}</span>
          </div>

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
              className="bg-[#1e1d1b] border-[#3d3935] text-zinc-400 hover:text-zinc-200 hover:bg-[#2a2826] shadow-md text-xs"
            >
              <Variable className="h-3.5 w-3.5 mr-1.5" />
              Variables
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleAutoLayout}
            className="bg-[#1e1d1b] border-[#3d3935] text-zinc-400 hover:text-zinc-200 hover:bg-[#2a2826] shadow-md text-xs"
          >
            <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />
            Auto Layout
          </Button>
        </Panel>

        {/* Execution legend */}
        {executionSteps && executionSteps.length > 0 && (
          <Panel position="bottom-left" className="!mb-2 !ml-2">
            <div className="bg-[#1e1d1b] border border-[#332f2b] rounded-xl px-3 py-2 shadow-lg">
              <p className="text-[9px] font-medium uppercase tracking-wider text-zinc-500 mb-1.5">Status</p>
              <div className="flex items-center gap-3">
                {[
                  { color: "bg-blue-400", label: "Running" },
                  { color: "bg-green-400", label: "Done" },
                  { color: "bg-red-400", label: "Failed" },
                  { color: "bg-zinc-600", label: "Pending" },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-1">
                    <div className={cn("h-2 w-2 rounded-full", s.color)} />
                    <span className="text-[10px] text-zinc-500">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        )}
      </ReactFlow>

      {/* Node Config Panel (right side) */}
      {selectedNode && (
        <NodeConfigPanel
          nodeId={selectedNode.id}
          nodeType={selectedNode.type}
          label={selectedNode.label}
          config={selectedNode.config}
          onConfigChange={handleNodeConfigChange}
          onLabelChange={handleNodeLabelChange}
          onDelete={handleNodeDelete}
          onClose={handleClosePanel}
          lastRunInput={nodeResults?.[selectedNode.id]?.input}
          lastRunResult={nodeResults?.[selectedNode.id]?.output}
        />
      )}
    </div>
  );
}
