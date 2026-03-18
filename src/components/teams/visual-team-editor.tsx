"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
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
  AlertCircle,
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
  GripVertical,
  PanelLeftClose,
  PanelLeft,
  Shield,
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
  /** Workflow nodes (non-agent) stored in JSON on the team */
  workflowNodes?: { id: string; type: WorkflowNodeType; label: string; position: { x: number; y: number }; config: Record<string, unknown> }[];
  workflowEdges?: { sourceId: string; targetId: string; condition?: string; sourceHandle?: string }[];
  onWorkflowNodesChange?: (nodes: { id: string; type: WorkflowNodeType; label: string; position: { x: number; y: number }; config: Record<string, unknown> }[]) => void;
  onWorkflowEdgesChange?: (edges: { sourceId: string; targetId: string; condition?: string; sourceHandle?: string }[]) => void;
  onWorkflowNodeClick?: (nodeId: string, nodeType: WorkflowNodeType, config: Record<string, unknown>) => void;
  onEdgeClick?: (edgeId: string, sourceNodeId: string, targetNodeId: string) => void;
}

/* ========== Constants ========== */
const roleColors: Record<string, { bg: string; text: string; border: string; hex: string; glow: string }> = {
  HEAD: { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/40", hex: "#F97316", glow: "shadow-orange-500/20" },
  COORDINATOR: { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/40", hex: "#3B82F6", glow: "shadow-blue-500/20" },
  EXECUTOR: { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/40", hex: "#22C55E", glow: "shadow-green-500/20" },
  REPORTER: { bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/40", hex: "#A855F7", glow: "shadow-purple-500/20" },
  APPROVAL_GATE: { bg: "bg-amber-500/20", text: "text-amber-300", border: "border-amber-500/40", hex: "#F59E0B", glow: "shadow-amber-500/20" },
};

/** Color mapping for workflow node types (non-agent nodes) */
const workflowNodeColors: Record<WorkflowNodeCategory, { border: string; bg: string; text: string; hex: string }> = {
  triggers: { border: "border-amber-500/50", bg: "bg-amber-500/15", text: "text-amber-400", hex: "#F59E0B" },
  agents: { border: "border-orange-500/40", bg: "bg-orange-500/15", text: "text-orange-400", hex: "#F97316" },
  logic: { border: "border-violet-500/50", bg: "bg-violet-500/15", text: "text-violet-400", hex: "#8B5CF6" },
  actions: { border: "border-blue-500/50", bg: "bg-blue-500/15", text: "text-blue-400", hex: "#3B82F6" },
  control: { border: "border-cyan-500/50", bg: "bg-cyan-500/15", text: "text-cyan-400", hex: "#06B6D4" },
};

/** Map lucide icon names to components */
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Globe, Clock, UserPlus, MessageSquare, Play, Bot, GitBranch, GitFork,
  Filter, Mail, Hash, Timer, Variable, ShieldCheck, Pause, Layers, Merge,
  Zap, Shield,
};

const NODE_WIDTH = 260;
const NODE_HEIGHT = 140;

/* ========== Dagre auto-layout ========== */
function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR" = "TB"
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 80,
    ranksep: 120,
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

/* ========== Custom Node: Agent ========== */
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
  executionStatus?:
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "skipped"
    | "awaiting_approval";
  [key: string]: unknown;
};

function VisualAgentNode({ data, selected }: NodeProps<Node<VisualNodeData>>) {
  const role = data.role as string;
  const rc = roleColors[role] || roleColors.EXECUTOR;
  const execStatus = data.executionStatus as string | undefined;

  const statusRing = execStatus === "running"
    ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-[#0C0A09]"
    : execStatus === "completed"
      ? "ring-2 ring-green-400 ring-offset-2 ring-offset-[#0C0A09]"
      : execStatus === "awaiting_approval"
        ? "ring-2 ring-amber-300 ring-offset-2 ring-offset-[#0C0A09]"
      : execStatus === "failed"
        ? "ring-2 ring-red-400 ring-offset-2 ring-offset-[#0C0A09]"
        : "";

  return (
    <div
      className={cn(
        "rounded-2xl border-2 bg-zinc-900/95 backdrop-blur-md px-4 py-3 shadow-xl min-w-[220px] max-w-[260px] transition-all duration-200",
        rc.border,
        selected && `${rc.glow} shadow-lg scale-[1.02]`,
        statusRing,
        (execStatus === "running" || execStatus === "awaiting_approval") && "animate-pulse",
      )}
    >
      {/* Target handles — top and left */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-zinc-500 !w-3 !h-3 !border-2 !border-zinc-800 hover:!bg-orange-400 transition-colors !-top-1.5"
      />

      {/* Role + execution status */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full", rc.bg, rc.text)}
        >
          {role}
        </span>

        {execStatus && (
          <span
            className={cn(
              "text-[9px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-1 ml-auto",
              execStatus === "running" && "bg-blue-500/20 text-blue-400",
              execStatus === "completed" && "bg-green-500/20 text-green-400",
              execStatus === "awaiting_approval" && "bg-amber-500/20 text-amber-300",
              execStatus === "failed" && "bg-red-500/20 text-red-400",
              execStatus === "pending" && "bg-zinc-700/60 text-zinc-500",
              execStatus === "skipped" && "bg-zinc-700/40 text-zinc-600",
            )}
          >
            {execStatus === "running" && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
            {execStatus === "completed" && <Check className="h-2.5 w-2.5" />}
            {execStatus === "awaiting_approval" && <AlertCircle className="h-2.5 w-2.5" />}
            {execStatus === "failed" && <X className="h-2.5 w-2.5" />}
            {execStatus}
          </span>
        )}
      </div>

      {/* Agent name + model */}
      <div className="flex items-center gap-2 mb-1">
        <p className="text-sm font-semibold text-zinc-100 truncate flex-1">{data.agentName}</p>
        {data.llmModel && (() => {
          const m = getModelDef(data.llmModel as string);
          return m ? (
            <span className="text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-full shrink-0 border border-zinc-700/50">
              {m.shortLabel}
            </span>
          ) : null;
        })()}
      </div>

      {/* Responsibilities preview */}
      {data.responsibilities && (
        <p className="text-[11px] text-zinc-500 line-clamp-2 mb-2">{data.responsibilities}</p>
      )}

      {/* Badges row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {data.agentMode && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full",
              data.agentMode === "APPROVAL"
                ? "bg-amber-500/15 text-amber-300"
                : data.agentMode === "CHAT"
                  ? "bg-blue-500/15 text-blue-400"
                  : "bg-green-500/15 text-green-400"
            )}
          >
            {data.agentMode === "APPROVAL" ? (
              <AlertCircle className="h-2.5 w-2.5" />
            ) : data.agentMode === "CHAT" ? (
              <MessageSquare className="h-2.5 w-2.5" />
            ) : (
              <Zap className="h-2.5 w-2.5" />
            )}
            {data.agentMode === "APPROVAL" ? "Gate" : data.agentMode === "CHAT" ? "Chat" : "Task"}
          </span>
        )}

        {typeof data.enabledActionsCount === "number" && data.enabledActionsCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[9px] bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded-full">
            <Zap className="h-2 w-2" />
            {data.enabledActionsCount} tools
          </span>
        )}

        {data.hasOutputSchema && (
          <span className="inline-flex items-center gap-1 text-[9px] bg-violet-500/10 text-violet-400 px-1.5 py-0.5 rounded-full">
            <Database className="h-2 w-2" />
            JSON
          </span>
        )}

        {data.isParallel && (
          <span className="inline-flex items-center gap-1 text-[9px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded-full">
            <Zap className="h-2 w-2" />
            Parallel
          </span>
        )}

        {data.hasFeedbackLoop && (
          <span className="inline-flex items-center gap-1 text-[9px] bg-cyan-500/10 text-cyan-400 px-1.5 py-0.5 rounded-full">
            <GitBranch className="h-2 w-2" />
            Loop
          </span>
        )}
      </div>

      {/* Schema fields preview on node */}
      {data.schemaFields && (data.schemaFields as string[]).length > 0 && (
        <div className="mt-2 pt-2 border-t border-zinc-800/80">
          <div className="flex flex-wrap gap-1">
            {(data.schemaFields as string[]).slice(0, 3).map((f) => (
              <span key={f} className="text-[8px] font-mono bg-zinc-800/80 text-zinc-500 px-1.5 py-0.5 rounded">
                {f}
              </span>
            ))}
            {(data.schemaFields as string[]).length > 3 && (
              <span className="text-[8px] text-zinc-600">+{(data.schemaFields as string[]).length - 3}</span>
            )}
          </div>
        </div>
      )}

      {/* Source handles — bottom and right */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-zinc-500 !w-3 !h-3 !border-2 !border-zinc-800 hover:!bg-orange-400 transition-colors !-bottom-1.5"
      />
    </div>
  );
}

/* ========== Custom Node: Workflow Node (non-agent) ========== */
type WorkflowNodeData = {
  label: string;
  nodeType: WorkflowNodeType;
  category: WorkflowNodeCategory;
  description: string;
  iconName: string;
  config: Record<string, unknown>;
  [key: string]: unknown;
};

function WorkflowNodeComponent({ data, selected }: NodeProps<Node<WorkflowNodeData>>) {
  const category = data.category as WorkflowNodeCategory;
  const colors = workflowNodeColors[category] || workflowNodeColors.actions;
  const IconComp = iconMap[data.iconName as string] || Zap;
  const nodeType = data.nodeType as WorkflowNodeType;
  const isLogicNode = category === "logic";

  return (
    <div
      className={cn(
        "rounded-2xl border-2 bg-zinc-900/95 backdrop-blur-md px-4 py-3 shadow-xl min-w-[200px] max-w-[240px] transition-all duration-200",
        colors.border,
        selected && "shadow-lg scale-[1.02] ring-1 ring-white/10",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-zinc-500 !w-3 !h-3 !border-2 !border-zinc-800 hover:!bg-orange-400 transition-colors !-top-1.5"
      />

      <div className="flex items-center gap-2.5 mb-1.5">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-xl shrink-0", colors.bg)}>
          <IconComp className={cn("h-4 w-4", colors.text)} />
        </div>
        <div className="min-w-0 flex-1">
          <span className={cn("text-[9px] font-bold uppercase tracking-wider", colors.text)}>
            {category}
          </span>
          <p className="text-sm font-semibold text-zinc-100 truncate">{data.label as string}</p>
        </div>
      </div>

      <p className="text-[11px] text-zinc-500 line-clamp-2">{data.description as string}</p>

      {/* Config preview */}
      {nodeType === "delay" && data.config && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-zinc-400">
          <Timer className="h-3 w-3" />
          {(data.config as Record<string, unknown>).duration as number || 60}{(data.config as Record<string, unknown>).unit as string || "s"}
        </div>
      )}
      {nodeType === "http_request" && data.config && (
        <div className="mt-2 flex items-center gap-1 text-[10px] font-mono text-zinc-400 truncate">
          <Globe className="h-3 w-3 shrink-0" />
          {(data.config as Record<string, unknown>).method as string || "GET"} {(data.config as Record<string, unknown>).url as string || "..."}
        </div>
      )}
      {nodeType === "if_condition" && data.config && (
        <div className="mt-2 flex items-center gap-1 text-[10px] font-mono text-zinc-400 truncate">
          <GitBranch className="h-3 w-3 shrink-0" />
          {(data.config as Record<string, unknown>).field as string || "field"} {(data.config as Record<string, unknown>).operator as string || "=="} {(data.config as Record<string, unknown>).value as string || "value"}
        </div>
      )}

      {/* Source handles */}
      {isLogicNode ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            className="!bg-green-500 !w-3 !h-3 !border-2 !border-zinc-800 !-bottom-1.5"
            style={{ left: "35%" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className="!bg-red-500 !w-3 !h-3 !border-2 !border-zinc-800 !-bottom-1.5"
            style={{ left: "65%" }}
          />
          <div className="flex justify-between mt-2 px-2 text-[8px] text-zinc-600">
            <span className="text-green-500">true</span>
            <span className="text-red-400">false</span>
          </div>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-zinc-500 !w-3 !h-3 !border-2 !border-zinc-800 hover:!bg-orange-400 transition-colors !-bottom-1.5"
        />
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
    <div className="rounded-2xl border-2 border-cyan-500/30 bg-zinc-900/95 backdrop-blur-md px-4 py-3 shadow-xl min-w-[180px] max-w-[200px]">
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-cyan-500 !w-3 !h-3 !border-2 !border-zinc-800 !-bottom-1.5"
      />
      <div className="flex items-center gap-2 mb-1.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/15">
          <BookOpen className="h-3.5 w-3.5 text-cyan-400" />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
          Shared KB
        </span>
      </div>
      <p className="text-sm font-semibold text-zinc-200">Workflow Knowledge</p>
      <p className="text-[11px] text-zinc-500 mt-0.5">
        {data.docCount} {data.docCount === 1 ? "Dokument" : "Dokumente"}
      </p>
    </div>
  );
}

function FallbackGhostNode({ data }: NodeProps<Node<FallbackNodeData>>) {
  const model = typeof data.llmModel === "string" ? getModelDef(data.llmModel) : null;

  return (
    <div className="rounded-2xl border border-dashed border-orange-500/30 bg-zinc-900/90 px-4 py-3 shadow-lg min-w-[200px] max-w-[240px] opacity-95">
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="!bg-orange-400 !w-3 !h-3 !border-2 !border-zinc-800 !-left-1.5"
      />
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/15">
          <AlertTriangle className="h-3.5 w-3.5 text-orange-300" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-orange-300">
            Fallback
          </p>
          <p className="truncate text-sm font-semibold text-zinc-200">
            {data.agentName}
          </p>
        </div>
      </div>
      {model ? (
        <p className="mt-2 text-[11px] text-zinc-500">{model.shortLabel}</p>
      ) : null}
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

  return (
    <>
      {/* Glow effect for executing edges */}
      {isExecuting && (
        <BaseEdge
          id={`${id}-glow`}
          path={edgePath}
          style={{
            stroke: "#F97316",
            strokeWidth: 6,
            filter: "blur(4px)",
            opacity: 0.4,
          }}
        />
      )}

      {/* Main edge */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: isFallback
            ? "#FB923C"
            : isExecuting
              ? "#F97316"
              : selected
                ? "#F97316"
                : "#3f3f46",
          strokeWidth: isFallback ? 2 : isExecuting ? 3 : 2,
          strokeDasharray: isFallback ? "5 5" : isExecuting ? "8 4" : undefined,
          animation: isFallback
            ? undefined
            : isExecuting
              ? "dashmove 0.5s linear infinite"
              : undefined,
        }}
        markerEnd={MarkerType.ArrowClosed}
      />

      {/* Edge label */}
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "absolute pointer-events-auto rounded-lg border px-2.5 py-1 text-[10px] font-medium transition-all cursor-pointer",
              selected
                ? "bg-orange-500/10 border-orange-500/30 text-orange-400"
                : isFallback
                  ? "bg-orange-500/10 border-orange-500/20 text-orange-300"
                  : "bg-zinc-900/90 border-zinc-700/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            <div className="flex items-center gap-1.5">
              <GitBranch className="h-3 w-3" />
              {data.label as string}
            </div>
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

/* ========== Sidebar: Draggable Node Palette ========== */
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

  if (collapsed) {
    return (
      <div className="absolute left-0 top-0 z-20 h-full">
        <button
          onClick={onToggle}
          className="m-2 flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900/95 text-zinc-400 shadow-lg backdrop-blur-md transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          title="Show node palette"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="absolute left-0 top-0 z-20 flex h-full w-[250px] flex-col border-r border-zinc-800 bg-zinc-950/95 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-kiln-orange" />
          <span className="text-xs font-semibold text-zinc-200">Node Palette</span>
        </div>
        <button
          onClick={onToggle}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Categories */}
      <div className="flex-1 overflow-y-auto py-1 scrollbar-thin">
        {WORKFLOW_CATEGORIES.map((cat) => {
          const isExpanded = expandedCategories.has(cat.id);
          const catNodes = WORKFLOW_NODE_DEFINITIONS.filter((d) => d.category === cat.id);
          const CatIcon = iconMap[cat.icon] || Zap;

          return (
            <div key={cat.id}>
              <button
                onClick={() => toggleCategory(cat.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-zinc-800/60"
              >
                <span style={{ color: cat.color }}><CatIcon className="h-3.5 w-3.5 shrink-0" /></span>
                <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  {cat.label}
                </span>
                <span className="text-[10px] text-zinc-600">{catNodes.length}</span>
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3 text-zinc-600" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-zinc-600" />
                )}
              </button>

              {isExpanded && (
                <div className="px-2 pb-1.5">
                  {catNodes.map((def) => {
                    const Icon = iconMap[def.icon] || Zap;
                    return (
                      <div
                        key={def.type}
                        draggable
                        onDragStart={(e) => onDragStart(e, def)}
                        className="group flex cursor-grab items-center gap-2.5 rounded-xl px-2.5 py-2 transition-all hover:bg-zinc-800/80 active:cursor-grabbing active:scale-[0.97]"
                      >
                        <div className="flex h-3 w-3 items-center justify-center text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100">
                          <GripVertical className="h-3 w-3" />
                        </div>
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                          style={{ backgroundColor: `${def.color}15` }}
                        >
                          <span style={{ color: def.color }}><Icon className="h-3.5 w-3.5" /></span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-medium text-zinc-300">{def.label}</p>
                          <p className="truncate text-[9px] text-zinc-600">{def.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <div className="border-t border-zinc-800 px-3 py-2">
        <p className="text-[10px] text-zinc-600">Drag nodes onto the canvas to add them to your workflow</p>
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
          color: isExecuting ? "#F97316" : "#52525b",
          width: 16,
          height: 16,
        },
      };
    });

  const fallbackGhostNodes = new Map<string, Node>();

  members.forEach((member, index) => {
    if (!member.fallbackEnabled) return;

    const sourcePosition =
      savedPositions?.[member.id] || { x: 0, y: index * 180 };

    const addFallbackEdge = (targetId: string, label = "fallback") => {
      edges.push({
        id: `fallback-${member.id}-${targetId}`,
        source: member.id,
        target: targetId,
        type: "animated",
        animated: false,
        selectable: false,
        deletable: false,
        data: {
          label,
          isFallback: true,
          executionActive: false,
        },
        style: {
          strokeDasharray: "5 5",
          stroke: "#FB923C",
          opacity: 0.9,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#FB923C",
          width: 14,
          height: 14,
        },
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
            position: savedPositions?.[ghostId] || {
              x: sourcePosition.x + 340,
              y: sourcePosition.y + 40,
            },
            data: {
              label: "Fallback Agent",
              agentName: member.fallbackAgent.name,
              llmModel: member.fallbackAgent.llmModel,
            },
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
          position: savedPositions?.[ghostId] || {
            x: sourcePosition.x + 340,
            y: sourcePosition.y + 140,
          },
          data: {
            label: "Fallback Model",
            agentName: member.agent.name,
            llmModel: member.fallbackModel,
          },
          draggable: false,
          selectable: false,
          deletable: false,
        });
      }
      addFallbackEdge(ghostId, "fallback model");
    }
  });

  nodes.push(...Array.from(fallbackGhostNodes.values()));

  // Add feedback loop edges (curved back arrows)
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
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#06B6D4",
        width: 14,
        height: 14,
      },
    });
  });

  // Add shared team knowledge node if documents exist
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

    // Connect KB node to all agent members (dashed cyan lines, no labels)
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
        style: { strokeDasharray: "4 4", stroke: "#06B6D4", opacity: 0.35 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#06B6D4",
          width: 10,
          height: 10,
        },
      });
    });
  }

  // Add workflow nodes (non-agent)
  if (workflowNodes && workflowNodes.length > 0) {
    const defMap = new Map(WORKFLOW_NODE_DEFINITIONS.map((d) => [d.type, d]));
    workflowNodes.forEach((wn) => {
      const def = defMap.get(wn.type);
      if (!def) return;
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
        },
      });
    });
  }

  // Add workflow edges
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
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#52525b",
          width: 16,
          height: 16,
        },
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
  onWorkflowEdgesChange,
  onWorkflowNodeClick,
  onEdgeClick: onEdgeClickProp,
}: VisualTeamEditorProps) {
  const reactFlowInstance = useReactFlow();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

    // Apply dagre layout only if no saved positions
    const hasSaved = savedPositions && Object.keys(savedPositions).length > 0;
    if (hasSaved) {
      return { nodes: rawNodes, edges: rawEdges };
    }
    return getLayoutedElements(rawNodes, rawEdges, "TB");
  }, [members, executionSteps, savedPositions, teamKnowledgeCount, wfNodes, wfEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  // Update nodes/edges when members or execution steps change
  useEffect(() => {
    const { nodes: rawNodes, edges: rawEdges } = membersToFlowElements(
      members, executionSteps, savedPositions, teamKnowledgeCount, wfNodes, wfEdges
    );
    const hasSaved = savedPositions && Object.keys(savedPositions).length > 0;

    if (hasSaved) {
      setNodes(rawNodes);
      setEdges(rawEdges);
    } else {
      const layouted = getLayoutedElements(rawNodes, rawEdges, "TB");
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
        currentNodes.forEach((n) => {
          positions[n.id] = n.position;
        });
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
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#52525b",
          width: 16,
          height: 16,
        },
      };
      setEdges((eds) => addEdge(newEdge, eds));
      onConnectionCreate?.(connection.source, connection.target);
    },
    [setEdges, onConnectionCreate]
  );

  // Auto-layout button handler
  const handleAutoLayout = useCallback(() => {
    const layouted = getLayoutedElements(nodes, edges, "TB");
    setNodes(layouted.nodes);
    setEdges(layouted.edges);

    // Fit view after layout
    setTimeout(() => {
      reactFlowInstance.fitView({ padding: 0.3, duration: 300 });
    }, 50);

    // Save new positions
    if (onPositionsChange) {
      const positions: Record<string, { x: number; y: number }> = {};
      layouted.nodes.forEach((n) => {
        positions[n.id] = n.position;
      });
      onPositionsChange(positions);
    }
  }, [nodes, edges, setNodes, setEdges, reactFlowInstance, onPositionsChange]);

  // Handle drop from sidebar palette
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

        // Convert screen coordinates to flow position
        const bounds = reactFlowWrapper.current?.getBoundingClientRect();
        if (!bounds) return;

        const position = reactFlowInstance.screenToFlowPosition({
          x: e.clientX - bounds.left,
          y: e.clientY - bounds.top,
        });

        const wfNode = createWorkflowNode(payload.type, position);

        // Add the React Flow node immediately
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

        // Notify parent about new workflow node
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

  // Empty state
  if (members.length === 0 && (!wfNodes || wfNodes.length === 0)) {
    return (
      <div className="relative h-full w-full">
        <NodePaletteSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4 py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-orange-500/10">
            <Sparkles className="h-10 w-10 text-orange-500/50" />
          </div>
          <p className="text-sm text-zinc-400">Drag nodes from the palette to build your workflow</p>
        </div>
      </div>
    );
  }

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
        className="bg-[#0C0A09]"
        connectionLineStyle={{ stroke: "#F97316", strokeWidth: 2, strokeDasharray: "5 3" }}
        defaultEdgeOptions={{
          type: "animated",
          animated: true,
        }}
        onNodeClick={(_event, node) => {
          if (node.id.startsWith("__fallback__")) return;
          // Check if it's a workflow node
          if (node.type === "workflowNode") {
            const nd = node.data as WorkflowNodeData;
            onWorkflowNodeClick?.(node.id, nd.nodeType, nd.config);
            return;
          }
          onNodeClick(node.id);
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
          // Remove workflow nodes
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
        <Background color="#1c1917" gap={20} size={1} />

        <MiniMap
          nodeColor={(node) => {
            if (node.type === "workflowNode") {
              const cat = (node.data as WorkflowNodeData)?.category;
              return workflowNodeColors[cat]?.hex || "#52525b";
            }
            const role = (node.data as VisualNodeData)?.role;
            return roleColors[role]?.hex || "#52525b";
          }}
          maskColor="rgba(0,0,0,0.75)"
          className="!bg-zinc-900/90 !border-zinc-800 rounded-xl"
          pannable
          zoomable
        />

        <Controls
          className="!bg-zinc-900/90 !border-zinc-800 !rounded-xl !shadow-xl [&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!text-zinc-400 [&>button:hover]:!bg-zinc-700 [&>button:hover]:!text-zinc-200"
          showInteractive={false}
        />

        {/* Auto-layout button */}
        <Panel position="top-right" className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleAutoLayout}
            className="bg-zinc-900/90 border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 shadow-lg"
          >
            <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />
            Auto Layout
          </Button>
        </Panel>

        {/* Execution legend */}
        {executionSteps && executionSteps.length > 0 && (
          <Panel position="bottom-left" className="!mb-2 !ml-2">
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl px-3 py-2 shadow-lg">
              <p className="text-[9px] font-medium uppercase tracking-wider text-zinc-500 mb-1.5">Execution Status</p>
              <div className="flex items-center gap-3">
                {[
                  { status: "running", color: "bg-blue-400", label: "Running" },
                  { status: "completed", color: "bg-green-400", label: "Done" },
                  { status: "failed", color: "bg-red-400", label: "Failed" },
                  { status: "pending", color: "bg-zinc-600", label: "Pending" },
                ].map((s) => (
                  <div key={s.status} className="flex items-center gap-1">
                    <div className={cn("h-2 w-2 rounded-full", s.color)} />
                    <span className="text-[10px] text-zinc-500">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}
