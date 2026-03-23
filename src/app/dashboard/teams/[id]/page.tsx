"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ReactFlow,
  Background,
  MiniMap,
  Handle,
  Position,
  ReactFlowProvider,
  NodeProps,
  Node,
  Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { TeamExecutionsTab } from "@/components/teams/executions-tab";
import { TeamCostDashboard } from "@/components/teams/team-cost-dashboard";
import {
  TeamScheduleTab,
  type TeamScheduleConfigValue,
  type TeamSchedulePreviewValue,
} from "@/components/teams/team-schedule-tab";
import { VisualTeamEditor } from "@/components/teams/visual-team-editor";
import { TeamKnowledgeTab } from "@/components/teams/team-knowledge-tab";
import { TeamWebhooksTab } from "@/components/teams/team-webhooks-tab";
import { TeamPermissionsTab } from "@/components/teams/team-permissions-tab";
import { ErrorHandlerConfigPanel, type ErrorHandlerConfig } from "@/components/workflows/error-handler-config";
import { VersionHistoryPanel } from "@/components/workflows/version-history";
import { WorkflowActivityFeed, WorkflowChangelog } from "@/components/workflows/workflow-comments";
import { TeamCostCalculator } from "@/components/teams/team-cost-calculator";
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonTab } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import {
  Users,
  ArrowLeft,
  Play,
  Pause,
  Plus,
  Target,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Loader2,
  Activity,
  BarChart3,
  Settings,
  Trash2,
  X,
  Send,
  Sparkles,
  ChevronDown,
  MessageSquare,
  Zap,
  Info,
  Coins,
  AlertCircle,
  Database,
  CalendarDays,
  LayoutGrid,
  List,
  BookOpen,
  Heart,
  TrendingUp,
  TrendingDown,
  Globe,
  Download,
  Copy,
  GitFork,
  FlaskConical,
  Network,
  Layers,
  Shield,
  Share2,
  History,
  GitCompare,
} from "lucide-react";
import {
  PROVIDERS,
  getModelsForProvider,
  getModelDef,
  type ProviderKey,
} from "@/lib/ai";
import {
  normalizeApprovalGateConfig,
  type ApprovalTimeoutAction,
} from "@/lib/team-approval";
// NodeConfigPanel is now handled inside VisualTeamEditor
import { DataMapper, type FieldMapping } from "@/components/workflows/data-mapper";
import { type WorkflowNodeType } from "@/lib/workflow-node-types";
import DebugRunner from "@/components/workflows/debug-runner";
import { LogViewer } from "@/components/workflows/log-viewer";
import { ExecutionDiff } from "@/components/workflows/execution-diff";
import { PerformanceProfiler } from "@/components/workflows/performance-profiler";

/* ========== Types ========== */
interface TeamAgent {
  id: string;
  name: string;
  slug: string;
  description?: string;
  llmModel?: string;
  modelProvider?: string;
  agentMode?: "CHAT" | "TASK";
  systemPrompt?: string;
  triggerType?: string;
  outputType?: string;
  outputConfig?: Record<string, unknown> | null;
  triggerConfig?: Record<string, unknown> | null;
}

interface OutputSchemaField {
  field: string;
  type: "string" | "number" | "boolean";
  description: string;
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

interface TeamTask {
  id: string;
  teamId: string;
  assignedToId?: string | null;
  title: string;
  description?: string | null;
  status:
    | "PENDING"
    | "RUNNING"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "FAILED"
    | "SKIPPED"
    | "AWAITING_APPROVAL"
    | "REJECTED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  result?: string | null;
  parentTaskId?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Team {
  id: string;
  userId?: string;
  name: string;
  description?: string;
  goal?: string;
  config?: {
    nodePositions?: Record<string, { x: number; y: number }>;
    schedule?: Partial<TeamScheduleConfigValue>;
    maxConcurrent?: number;
    errorHandler?: ErrorHandlerConfig;
  } | null;
  schedulePreview?: TeamSchedulePreviewValue | null;
  parentTeamId?: string | null;
  parentTeamName?: string | null;
  isOwner?: boolean;
  sharedRole?: string | null;
  status: "ACTIVE" | "PAUSED";
  createdAt: string;
  updatedAt: string;
  members: TeamMember[];
  tasks: TeamTask[];
  _count: { tasks: number; members: number };
}

/* ========== Role color config ========== */
const roleColors: Record<string, { bg: string; text: string; border: string; hex: string }> = {
  HEAD: { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/40", hex: "#F97316" },
  COORDINATOR: { bg: "bg-blue-500/20", text: "text-gray-400", border: "border-blue-500/40", hex: "#3B82F6" },
  EXECUTOR: { bg: "bg-green-500/20", text: "text-gray-400", border: "border-green-500/40", hex: "#22C55E" },
  REPORTER: { bg: "bg-purple-500/20", text: "text-gray-400", border: "border-purple-500/40", hex: "#A855F7" },
  APPROVAL_GATE: { bg: "bg-amber-500/20", text: "text-gray-400", border: "border-amber-500/40", hex: "#F59E0B" },
};

const priorityColors: Record<string, { bg: string; text: string }> = {
  LOW: { bg: "bg-zinc-700/60", text: "text-zinc-400" },
  MEDIUM: { bg: "bg-blue-500/20", text: "text-gray-400" },
  HIGH: { bg: "bg-orange-500/20", text: "text-orange-400" },
  URGENT: { bg: "bg-red-500/20", text: "text-gray-400" },
};

const statusColumns = ["PENDING", "RUNNING", "AWAITING_APPROVAL", "COMPLETED", "FAILED", "REJECTED", "SKIPPED"] as const;
const statusLabels: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  PENDING: { label: "Pending", icon: <Clock className="h-4 w-4" />, color: "text-zinc-400" },
  RUNNING: { label: "Running", icon: <Loader2 className="h-4 w-4 animate-spin" />, color: "text-gray-400" },
  IN_PROGRESS: { label: "Running", icon: <Loader2 className="h-4 w-4 animate-spin" />, color: "text-gray-400" },
  AWAITING_APPROVAL: { label: "Awaiting approval", icon: <AlertCircle className="h-4 w-4" />, color: "text-gray-400" },
  COMPLETED: { label: "Completed", icon: <CheckCircle2 className="h-4 w-4" />, color: "text-gray-400" },
  FAILED: { label: "Failed", icon: <AlertTriangle className="h-4 w-4" />, color: "text-gray-400" },
  REJECTED: { label: "Rejected", icon: <X className="h-4 w-4" />, color: "text-red-300" },
  SKIPPED: { label: "Skipped", icon: <Info className="h-4 w-4" />, color: "text-zinc-500" },
};

function normalizeTaskStatus(status: TeamTask["status"]) {
  return status === "IN_PROGRESS" ? "RUNNING" : status;
}

function getMemberDisplayName(member: TeamMember) {
  if (member.agent?.name) {
    return member.agent.name;
  }

  if (member.role === "APPROVAL_GATE") {
    const config =
      member.config && typeof member.config === "object" && !Array.isArray(member.config)
        ? (member.config as Record<string, unknown>)
        : null;
    return typeof config?.label === "string" && config.label.trim()
      ? config.label.trim()
      : "Approval Gate";
  }

  return "Unassigned node";
}

/* ========== Custom ReactFlow Node ========== */
type TeamMemberNodeData = {
  label: string;
  role: string;
  agentName: string;
  responsibilities: string;
  taskCount: number;
  llmModel?: string;
  agentMode?: string;
  enabledActionsCount?: number;
  hasOutputSchema?: boolean;
  sharedContextCount?: number;
  sharedContextPreview?: string[];
  [key: string]: unknown;
};

function TeamMemberNode({ data }: NodeProps<Node<TeamMemberNodeData>>) {
  const role = data.role as string;
  const rc = roleColors[role] || roleColors.EXECUTOR;

  return (
    <div
      className={cn(
        "rounded-xl border bg-zinc-900/90 backdrop-blur-sm px-4 py-3 shadow-lg min-w-[200px] max-w-[260px] cursor-pointer hover:brightness-110 transition-all",
        rc.border
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-zinc-600 !w-2 !h-2" />

      <div className="flex items-center gap-2 mb-2">
        <span
          className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full", rc.bg, rc.text)}
        >
          {role}
        </span>
        {data.taskCount > 0 && (
          <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-full ml-auto">
            {data.taskCount} tasks
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-zinc-100 truncate">{data.agentName}</p>
        {data.llmModel && (() => {
          const m = getModelDef(data.llmModel as string);
          return m ? <span className="text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-full shrink-0">{m.shortLabel}</span> : null;
        })()}
      </div>

      {data.responsibilities && (
        <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{data.responsibilities}</p>
      )}

      {/* Agent mode badge */}
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {data.agentMode && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full",
              data.agentMode === "APPROVAL"
                ? "bg-amber-500/15 text-gray-400"
                :
              data.agentMode === "CHAT"
                ? "bg-blue-500/15 text-gray-400"
                : "bg-green-500/15 text-gray-400"
            )}
          >
            {data.agentMode === "APPROVAL" ? (
              <AlertCircle className="h-2.5 w-2.5" />
            ) : data.agentMode === "CHAT" ? (
              <MessageSquare className="h-2.5 w-2.5" />
            ) : (
              <Zap className="h-2.5 w-2.5" />
            )}
            {data.agentMode === "APPROVAL"
              ? "Approval"
              : data.agentMode === "CHAT"
                ? "Chat"
                : "Task"}
          </span>
        )}
        {typeof data.enabledActionsCount === "number" && data.enabledActionsCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[9px] bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded-full">
            <Zap className="h-2 w-2" />
            {data.enabledActionsCount}
          </span>
        )}
        {data.hasOutputSchema && (
          <span className="inline-flex items-center text-[9px] bg-white/[0.05] text-gray-400 px-1.5 py-0.5 rounded-full">
            JSON
          </span>
        )}
        {typeof data.sharedContextCount === "number" && data.sharedContextCount > 0 && (
          <span
            title={(data.sharedContextPreview || []).join(", ")}
            className="inline-flex items-center gap-1 text-[9px] bg-white/[0.05] text-gray-400 px-1.5 py-0.5 rounded-full"
          >
            <Database className="h-2.5 w-2.5" />
            {data.sharedContextCount}
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-zinc-600 !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { teamMember: TeamMemberNode };

/* ========== Tree layout helper ========== */
function buildHierarchyGraph(
  members: TeamMember[],
  tasks: TeamTask[],
  sharedContextKeys: string[] = []
) {
  // Count tasks per member
  const taskCounts: Record<string, number> = {};
  tasks.forEach((t) => {
    if (t.assignedToId) {
      taskCounts[t.assignedToId] = (taskCounts[t.assignedToId] || 0) + 1;
    }
  });

  // Group members by level for Y positioning
  const levelGroups: Record<number, TeamMember[]> = {};
  members.forEach((m) => {
    const lvl = m.level ?? 0;
    if (!levelGroups[lvl]) levelGroups[lvl] = [];
    levelGroups[lvl].push(m);
  });

  // Alternatively, use role-based Y if levels are all 0
  const roleYMap: Record<string, number> = {
    HEAD: 0,
    COORDINATOR: 200,
    APPROVAL_GATE: 300,
    EXECUTOR: 400,
    REPORTER: 600,
  };
  const allSameLevel = members.length > 1 && members.every((m) => m.level === members[0].level);

  // Build parent -> children map for horizontal positioning
  const childrenMap: Record<string, TeamMember[]> = {};
  const roots: TeamMember[] = [];

  members.forEach((m) => {
    if (m.reportsToMemberId) {
      if (!childrenMap[m.reportsToMemberId]) childrenMap[m.reportsToMemberId] = [];
      childrenMap[m.reportsToMemberId].push(m);
    } else {
      roots.push(m);
    }
  });

  // Calculate subtree widths for proper spacing
  const NODE_WIDTH = 280;
  const H_GAP = 40;
  const subtreeWidths: Record<string, number> = {};

  function calcWidth(memberId: string): number {
    const children = childrenMap[memberId] || [];
    if (children.length === 0) {
      subtreeWidths[memberId] = NODE_WIDTH;
      return NODE_WIDTH;
    }
    const totalChildWidth = children.reduce((sum, c) => sum + calcWidth(c.id), 0) + (children.length - 1) * H_GAP;
    subtreeWidths[memberId] = Math.max(NODE_WIDTH, totalChildWidth);
    return subtreeWidths[memberId];
  }

  roots.forEach((r) => calcWidth(r.id));

  // Position nodes
  const positions: Record<string, { x: number; y: number }> = {};

  function positionNode(memberId: string, centerX: number, y: number) {
    positions[memberId] = { x: centerX - NODE_WIDTH / 2, y };
    const children = childrenMap[memberId] || [];
    if (children.length === 0) return;

    const totalWidth = children.reduce((sum, c) => sum + (subtreeWidths[c.id] || NODE_WIDTH), 0) + (children.length - 1) * H_GAP;
    let startX = centerX - totalWidth / 2;

    children.forEach((child) => {
      const w = subtreeWidths[child.id] || NODE_WIDTH;
      const childRole = child.role;
      const childY = allSameLevel ? (roleYMap[childRole] ?? y + 200) : y + 200;
      positionNode(child.id, startX + w / 2, childY);
      startX += w + H_GAP;
    });
  }

  // Position each root tree
  const totalRootsWidth = roots.reduce((sum, r) => sum + (subtreeWidths[r.id] || NODE_WIDTH), 0) + (roots.length - 1) * H_GAP;
  let rootStartX = -totalRootsWidth / 2;

  roots.forEach((root) => {
    const w = subtreeWidths[root.id] || NODE_WIDTH;
    const rootY = allSameLevel ? (roleYMap[root.role] ?? 0) : 0;
    positionNode(root.id, rootStartX + w / 2, rootY);
    rootStartX += w + H_GAP;
  });

  // Handle orphan members (no parent, not a root somehow)
  let orphanX = rootStartX + 100;
  members.forEach((m) => {
    if (!positions[m.id]) {
      const y = allSameLevel ? (roleYMap[m.role] ?? 0) : m.level * 200;
      positions[m.id] = { x: orphanX, y };
      orphanX += NODE_WIDTH + H_GAP;
    }
  });

  const nodes: Node<TeamMemberNodeData>[] = members.map((m) => ({
    id: m.id,
    type: "teamMember",
    position: positions[m.id] || { x: 0, y: 0 },
    data: {
      label: getMemberDisplayName(m),
      role: m.role,
      agentName: getMemberDisplayName(m),
      responsibilities: m.responsibilities || "",
      taskCount: taskCounts[m.id] || 0,
      llmModel: m.agent?.llmModel || undefined,
      agentMode: m.role === "APPROVAL_GATE" ? "APPROVAL" : (m.agent?.agentMode || undefined),
      enabledActionsCount: m.enabledActions?.length || 0,
      hasOutputSchema: Array.isArray(m.outputSchema) && m.outputSchema.length > 0,
      sharedContextCount: sharedContextKeys.length,
      sharedContextPreview: sharedContextKeys.slice(0, 4),
    },
  }));

  const edges: Edge[] = members
    .filter((m) => m.reportsToMemberId)
    .map((m) => ({
      id: `e-${m.reportsToMemberId}-${m.id}`,
      source: m.reportsToMemberId!,
      target: m.id,
      animated: true,
      style: { stroke: "#52525b", strokeWidth: 2 },
    }));

  return { nodes, edges };
}

/* ========== Tabs ========== */
type TabKey = "hierarchy" | "tasks" | "activity" | "analytics" | "cost" | "knowledge" | "executions" | "versions" | "schedule" | "webhooks" | "permissions" | "settings";

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "hierarchy", label: "Hierarchy", icon: <Users className="h-4 w-4" /> },
  { key: "tasks", label: "Tasks", icon: <Target className="h-4 w-4" /> },
  { key: "knowledge", label: "Knowledge", icon: <BookOpen className="h-4 w-4" /> },
  { key: "activity", label: "Activity", icon: <Activity className="h-4 w-4" /> },
  { key: "analytics", label: "Analytics", icon: <BarChart3 className="h-4 w-4" /> },
  { key: "cost", label: "Cost", icon: <Coins className="h-4 w-4" /> },
  { key: "executions", label: "Executions", icon: <Clock className="h-4 w-4" /> },
  { key: "versions", label: "Versions", icon: <History className="h-4 w-4" /> },
  { key: "schedule", label: "Schedule", icon: <CalendarDays className="h-4 w-4" /> },
  { key: "webhooks", label: "Webhooks", icon: <Globe className="h-4 w-4" /> },
  { key: "permissions", label: "Members", icon: <Shield className="h-4 w-4" /> },
  { key: "settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
];

/* ========== Edit Member Panel ========== */
interface EditMemberPanelProps {
  member: TeamMember | null;
  allMembers: TeamMember[];
  teamId: string;
  onClose: () => void;
  onSaved: () => void;
}

function EditMemberPanel({ member, allMembers, teamId, onClose, onSaved }: EditMemberPanelProps) {
  const [agentData, setAgentData] = useState<TeamAgent | null>(null);
  const [availableFallbackAgents, setAvailableFallbackAgents] = useState<TeamAgent[]>([]);
  const [loadingAgent, setLoadingAgent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  // Editable fields
  const [agentName, setAgentName] = useState("");
  const [role, setRole] = useState<"HEAD" | "COORDINATOR" | "EXECUTOR" | "REPORTER" | "APPROVAL_GATE">("EXECUTOR");
  const [responsibilities, setResponsibilities] = useState("");
  const [reportsToMemberId, setReportsToMemberId] = useState<string>("");
  const [provider, setProvider] = useState<ProviderKey>("ANTHROPIC");
  const [llmModel, setLlmModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [triggerType, setTriggerType] = useState("");
  const [outputType, setOutputType] = useState("");
  const [approverEmail, setApproverEmail] = useState("");
  const [approvalMessage, setApprovalMessage] = useState("");
  const [timeoutHours, setTimeoutHours] = useState(24);
  const [timeoutAction, setTimeoutAction] = useState<ApprovalTimeoutAction>("skip");

  // Output schema
  const [schemaFields, setSchemaFields] = useState<OutputSchemaField[]>([]);

  // Tool scoping
  const [agentActions, setAgentActions] = useState<string[]>([]);
  const [enabledActions, setEnabledActions] = useState<string[]>([]);

  // Execution mode
  const [executionMode, setExecutionMode] = useState<"sequential" | "parallel">("sequential");
  const [fallbackAgentId, setFallbackAgentId] = useState("");
  const [fallbackModel, setFallbackModel] = useState("");
  const [fallbackEnabled, setFallbackEnabled] = useState(true);
  const [maxRetries, setMaxRetries] = useState(2);

  // Feedback loop
  // Trigger team config
  const [triggerTeamEnabled, setTriggerTeamEnabled] = useState(false);
  const [triggerTeamTargetId, setTriggerTeamTargetId] = useState("");
  const [triggerTeamMode, setTriggerTeamMode] = useState<"async" | "sync">("async");
  const [triggerTeamGoal, setTriggerTeamGoal] = useState("");
  const [availableTeams, setAvailableTeams] = useState<{ id: string; name: string }[]>([]);

  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopTargetMemberId, setLoopTargetMemberId] = useState("");
  const [loopMaxIterations, setLoopMaxIterations] = useState(3);
  const [loopQualityField, setLoopQualityField] = useState("");
  const [loopQualityThreshold, setLoopQualityThreshold] = useState(80);

  // Fetch full agent data when member changes
  useEffect(() => {
    if (!member) return;

    // Seed form from member data immediately
    setAgentName(getMemberDisplayName(member));
    setRole(member.role);
    setResponsibilities(member.responsibilities || "");
    setReportsToMemberId(member.reportsToMemberId || "");
    setProvider((member.agent?.modelProvider as ProviderKey) || "ANTHROPIC");
    setLlmModel(member.agent?.llmModel || "");
    setSystemPrompt(member.agent?.systemPrompt || "");
    setTriggerType(member.agent?.triggerType || "");
    setOutputType(member.agent?.outputType || "");
    setSchemaFields((member.outputSchema as OutputSchemaField[]) || []);
    setEnabledActions(member.enabledActions || []);
    setExecutionMode((member.executionMode as "sequential" | "parallel") || "sequential");
    setFallbackAgentId(member.fallbackAgentId || "");
    setFallbackModel(member.fallbackModel || "");
    setFallbackEnabled(member.fallbackEnabled !== false);
    setMaxRetries(typeof member.maxRetries === "number" ? member.maxRetries : 2);
    const fl = member.feedbackLoop;
    if (fl) {
      setLoopEnabled(true);
      setLoopTargetMemberId(fl.targetMemberId);
      setLoopMaxIterations(fl.maxIterations);
      setLoopQualityField(fl.qualityField);
      setLoopQualityThreshold(fl.qualityThreshold);
    } else {
      setLoopEnabled(false);
      setLoopTargetMemberId("");
      setLoopMaxIterations(3);
      setLoopQualityField("");
      setLoopQualityThreshold(80);
    }
    // Trigger team config laden
    const memberCfg = member.config as Record<string, unknown> | null;
    const triggerCfg = memberCfg?.triggerTeam as Record<string, unknown> | null;
    if (triggerCfg && member.enabledActions?.includes("TRIGGER_TEAM")) {
      setTriggerTeamEnabled(true);
      setTriggerTeamTargetId(String(triggerCfg.targetTeamId || ""));
      setTriggerTeamMode((triggerCfg.mode as "async" | "sync") || "async");
      setTriggerTeamGoal(String(triggerCfg.goalTemplate || ""));
    } else {
      setTriggerTeamEnabled(false);
      setTriggerTeamTargetId("");
      setTriggerTeamMode("async");
      setTriggerTeamGoal("");
    }

    const gateConfig = normalizeApprovalGateConfig(member.config, "");
    setApproverEmail(gateConfig.approverEmail);
    setApprovalMessage(gateConfig.approvalMessage);
    setTimeoutHours(gateConfig.timeoutHours);
    setTimeoutAction(gateConfig.timeoutAction);
    setConfirmRemove(false);

    if (member.role === "APPROVAL_GATE" || !member.agentId) {
      setAgentActions([]);
      setAgentData(null);
      setLoadingAgent(false);
      return;
    }

    // Load agent's available actions for tool scoping
    fetch(`/api/agents/${member.agentId}/actions`)
      .then((r) => r.json())
      .then((data) => {
        const actions = (Array.isArray(data) ? data : data.actions || [])
          .filter((a: { enabled: boolean }) => a.enabled)
          .map((a: { type: string }) => a.type);
        setAgentActions(actions);
      })
      .catch(() => setAgentActions([]));

    // Fetch full agent to get systemPrompt + mode
    setLoadingAgent(true);
    fetch(`/api/agents/${member.agentId}`)
      .then((r) => r.json())
      .then((data: TeamAgent) => {
        setAgentData(data);
        setAgentName(data.name);
        setProvider((data.modelProvider as ProviderKey) || "ANTHROPIC");
        setLlmModel(data.llmModel || "");
        setSystemPrompt(data.systemPrompt || "");
        setTriggerType(data.triggerType || "");
        setOutputType(data.outputType || "");
      })
      .catch(() => {
        // Silently fall back to member.agent data already seeded
      })
      .finally(() => setLoadingAgent(false));
  }, [member]);

  useEffect(() => {
    if (!member) return;

    fetch("/api/agents")
      .then((response) => response.json())
      .then((data: TeamAgent[] | { error?: string }) => {
        const agents = Array.isArray(data) ? data : [];
        setAvailableFallbackAgents(
          agents.filter((agent) => agent.id !== member.agentId)
        );
      })
      .catch(() => setAvailableFallbackAgents([]));
    // Verfügbare Teams für TRIGGER_TEAM laden
    fetch("/api/teams")
      .then((r) => r.json())
      .then((data: { id: string; name: string }[]) => {
        const allTeams = Array.isArray(data) ? data : [];
        setAvailableTeams(allTeams.filter((t) => t.id !== teamId));
      })
      .catch(() => setAvailableTeams([]));
  }, [member, teamId]);

  const availableModels = useMemo(() => getModelsForProvider(provider), [provider]);
  const fallbackModelOptions = useMemo(
    () =>
      availableModels.filter(
        (model) => !member?.agent?.llmModel || model.id !== member.agent.llmModel
      ),
    [availableModels, member?.agent?.llmModel]
  );

  const handleProviderChange = (p: ProviderKey) => {
    setProvider(p);
    const models = getModelsForProvider(p);
    setLlmModel(models[0]?.id || "");
  };

  const handleSave = async () => {
    if (!member || saving) return;
    setSaving(true);
    try {
      if (role !== "APPROVAL_GATE" && member.agentId) {
        await fetch(`/api/agents/${member.agentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: agentName.trim(),
            systemPrompt: systemPrompt.trim(),
            llmModel: llmModel || undefined,
            modelProvider: provider,
            triggerType: triggerType || undefined,
            outputType: outputType || undefined,
          }),
        });
      }

      // 2. Update member fields (role, responsibilities, reportsTo, schema, tools)
      await fetch(`/api/teams/${teamId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: member.id,
          role,
          responsibilities: responsibilities.trim() || undefined,
          reportsToMemberId: reportsToMemberId || null,
          outputSchema: schemaFields.length > 0 ? schemaFields : null,
          enabledActions: triggerTeamEnabled
            ? Array.from(new Set([...enabledActions.filter((a) => a !== "TRIGGER_TEAM"), "TRIGGER_TEAM"]))
            : enabledActions.filter((a) => a !== "TRIGGER_TEAM"),
          executionMode,
          fallbackAgentId: fallbackEnabled ? fallbackAgentId || null : null,
          fallbackModel: fallbackEnabled ? fallbackModel || null : null,
          fallbackEnabled,
          maxRetries,
          feedbackLoop: loopEnabled && loopTargetMemberId && loopQualityField
            ? { targetMemberId: loopTargetMemberId, maxIterations: loopMaxIterations, qualityField: loopQualityField, qualityThreshold: loopQualityThreshold }
            : null,
          config:
            role === "APPROVAL_GATE"
              ? {
                  approverEmail: approverEmail.trim(),
                  approvalMessage: approvalMessage.trim(),
                  timeoutHours,
                  timeoutAction,
                }
              : triggerTeamEnabled && triggerTeamTargetId
                ? {
                    triggerTeam: {
                      targetTeamId: triggerTeamTargetId,
                      mode: triggerTeamMode,
                      goalTemplate: triggerTeamGoal.trim() || undefined,
                    },
                  }
                : null,
        }),
      });

      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!member || removing) return;
    setRemoving(true);
    try {
      await fetch(`/api/teams/${teamId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id }),
      });
      onSaved();
      onClose();
    } finally {
      setRemoving(false);
    }
  };

  const agentMode =
    role === "APPROVAL_GATE"
      ? "APPROVAL"
      : (agentData?.agentMode || member?.agent?.agentMode);
  const rc = member ? (roleColors[member.role] || roleColors.EXECUTOR) : roleColors.EXECUTOR;

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-20 bg-black/40 transition-opacity duration-200",
          member ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-[380px] z-30 bg-zinc-900 border-l border-border shadow-2xl transform transition-transform duration-200 flex flex-col",
          member ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            {member && (
              <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full", rc.bg, rc.text)}>
                {member.role}
              </span>
            )}
            <h3 className="text-sm font-semibold text-zinc-100">Edit Node</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Panel body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loadingAgent && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
            </div>
          )}

          {!loadingAgent && member && (
            <>
              {/* Agent name */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Agent Name</label>
                <input
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors placeholder:text-zinc-600"
                  placeholder="Agent name..."
                />
              </div>

              {/* Role */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Role</label>
                <div className="relative">
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as typeof role)}
                    className="w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors pr-8"
                  >
                    <option value="HEAD">HEAD</option>
                    <option value="COORDINATOR">COORDINATOR</option>
                    <option value="EXECUTOR">EXECUTOR</option>
                    <option value="REPORTER">REPORTER</option>
                    <option value="APPROVAL_GATE">APPROVAL_GATE</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
                </div>
              </div>

              {/* Agent mode badge (read-only) */}
              {agentMode && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Agent Mode</label>
                  <div>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full",
                        agentMode === "APPROVAL"
                          ? "bg-amber-500/15 text-gray-400 border border-amber-500/30"
                          :
                        agentMode === "CHAT"
                          ? "bg-blue-500/15 text-gray-400 border border-blue-500/30"
                          : "bg-green-500/15 text-gray-400 border border-green-500/30"
                      )}
                    >
                      {agentMode === "APPROVAL" ? (
                        <AlertCircle className="h-3 w-3" />
                      ) : agentMode === "CHAT" ? (
                        <MessageSquare className="h-3 w-3" />
                      ) : (
                        <Zap className="h-3 w-3" />
                      )}
                      {agentMode === "APPROVAL"
                        ? "Approval Gate"
                        : agentMode === "CHAT"
                          ? "Chat Agent"
                          : "Task Agent"}
                    </span>
                  </div>
                </div>
              )}

              {/* LLM Provider */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">LLM Provider</label>
                <div className="relative">
                  <select
                    value={provider}
                    onChange={(e) => handleProviderChange(e.target.value as ProviderKey)}
                    className="w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors pr-8"
                  >
                    {(Object.keys(PROVIDERS) as ProviderKey[]).map((p) => (
                      <option key={p} value={p}>{PROVIDERS[p].label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
                </div>
              </div>

              {/* LLM Model */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Model</label>
                <div className="relative">
                  <select
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    className="w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors pr-8"
                  >
                    {availableModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}{m.badge ? ` — ${m.badge}` : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
                </div>
              </div>

              {/* Responsibilities */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Responsibilities</label>
                <textarea
                  value={responsibilities}
                  onChange={(e) => setResponsibilities(e.target.value)}
                  rows={3}
                  placeholder="Describe this agent's responsibilities..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors resize-none placeholder:text-zinc-600"
                />
              </div>

              {role === "APPROVAL_GATE" && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-400">Approver Email</label>
                    <input
                      value={approverEmail}
                      onChange={(e) => setApproverEmail(e.target.value)}
                      placeholder="approver@example.com"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors placeholder:text-zinc-600"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-400">Approval Message</label>
                    <textarea
                      value={approvalMessage}
                      onChange={(e) => setApprovalMessage(e.target.value)}
                      rows={3}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors resize-none placeholder:text-zinc-600"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-400">Timeout Hours</label>
                      <input
                        type="number"
                        min={1}
                        value={timeoutHours}
                        onChange={(e) => setTimeoutHours(Math.max(1, Number(e.target.value) || 24))}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-400">Timeout Action</label>
                      <select
                        value={timeoutAction}
                        onChange={(e) => setTimeoutAction(e.target.value as ApprovalTimeoutAction)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors"
                      >
                        <option value="auto_approve">Auto approve</option>
                        <option value="auto_reject">Auto reject</option>
                        <option value="skip">Skip gate</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {/* System prompt */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">System Prompt</label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={5}
                  placeholder="System prompt for this agent..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors resize-none placeholder:text-zinc-600 font-mono text-xs"
                />
              </div>

              {/* Reports to */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Reports To</label>
                <div className="relative">
                  <select
                    value={reportsToMemberId}
                    onChange={(e) => setReportsToMemberId(e.target.value)}
                    className="w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors pr-8"
                  >
                    <option value="">— None (root) —</option>
                    {allMembers
                      .filter((m) => m.id !== member.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {getMemberDisplayName(m)} ({m.role})
                        </option>
                      ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
                </div>
              </div>

              {/* Task-agent specific fields */}
              {agentMode === "TASK" && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-400">Trigger Type</label>
                    <div className="relative">
                      <select
                        value={triggerType}
                        onChange={(e) => setTriggerType(e.target.value)}
                        className="w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors pr-8"
                      >
                        <option value="">— None —</option>
                        <option value="MANUAL">Manual</option>
                        <option value="SCHEDULE">Schedule</option>
                        <option value="WEBHOOK">Webhook</option>
                        <option value="EVENT">Event</option>
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-400">Output Type</label>
                    <div className="relative">
                      <select
                        value={outputType}
                        onChange={(e) => setOutputType(e.target.value)}
                        className="w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors pr-8"
                      >
                        <option value="">— None —</option>
                        <option value="NONE">None</option>
                        <option value="EMAIL">Email</option>
                        <option value="HTTP">HTTP</option>
                        <option value="NEXT_AGENT">Next Agent</option>
                        <option value="WEBHOOK">Webhook</option>
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
                    </div>
                  </div>
                </>
              )}

              {/* ── Output Schema (Structured Routing) ── */}
              <div className="space-y-1.5 border-t border-zinc-800 pt-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-400">Output Schema</label>
                  <button
                    type="button"
                    onClick={() =>
                      setSchemaFields((prev) => [...prev, { field: "", type: "string", description: "" }])
                    }
                    className="text-[10px] font-medium text-orange-400 hover:text-orange-300"
                  >
                    + Add Field
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500">Define structured output fields for JSON routing between agents.</p>

                {schemaFields.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {schemaFields.map((sf, i) => (
                      <div key={i} className="flex gap-1.5 items-start">
                        <input
                          value={sf.field}
                          onChange={(e) => {
                            const updated = [...schemaFields];
                            updated[i] = { ...updated[i], field: e.target.value };
                            setSchemaFields(updated);
                          }}
                          placeholder="field_name"
                          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-md text-xs text-zinc-100 px-2 py-1.5 outline-none focus:border-orange-500/60 font-mono"
                        />
                        <select
                          value={sf.type}
                          onChange={(e) => {
                            const updated = [...schemaFields];
                            updated[i] = { ...updated[i], type: e.target.value as OutputSchemaField["type"] };
                            setSchemaFields(updated);
                          }}
                          className="w-20 appearance-none bg-zinc-800 border border-zinc-700 rounded-md text-xs text-zinc-100 px-2 py-1.5 outline-none focus:border-orange-500/60"
                        >
                          <option value="string">string</option>
                          <option value="number">number</option>
                          <option value="boolean">bool</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => setSchemaFields((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-zinc-600 hover:text-gray-400 mt-1"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {schemaFields.length > 0 && (
                  <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2">
                    <p className="text-[9px] font-medium text-zinc-500 mb-1">Preview</p>
                    <pre className="text-[10px] font-mono text-zinc-400 overflow-x-auto">
                      {JSON.stringify(
                        Object.fromEntries(
                          schemaFields
                            .filter((f) => f.field)
                            .map((f) => [f.field, f.type === "number" ? 0 : f.type === "boolean" ? false : ""])
                        ),
                        null,
                        2
                      )}
                    </pre>
                  </div>
                )}
              </div>

              {/* ── Tool Scoping ── */}
              {agentActions.length > 0 && (
                <div className="space-y-1.5 border-t border-zinc-800 pt-4">
                  <label className="text-xs font-medium text-zinc-400">Active Tools</label>
                  <p className="text-[10px] text-zinc-500">
                    Select which tools this agent can use during workflow execution.
                    {enabledActions.length === 0 && " (All tools active)"}
                  </p>

                  {agentActions.length > 6 && (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 mt-1">
                      <AlertCircle className="h-3 w-3 text-gray-400 shrink-0" />
                      <p className="text-[10px] text-gray-400">
                        {agentActions.length} tools active — consider reducing for better reliability
                      </p>
                    </div>
                  )}

                  <div className="space-y-1 mt-2">
                    {agentActions.map((action) => {
                      const isActive = enabledActions.length === 0 || enabledActions.includes(action);
                      return (
                        <label
                          key={action}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors",
                            isActive
                              ? "border-orange-500/30 bg-orange-500/5"
                              : "border-zinc-800 bg-zinc-900/30 opacity-60"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isActive}
                            onChange={() => {
                              if (enabledActions.length === 0) {
                                // First toggle: enable all except this one
                                setEnabledActions(agentActions.filter((a) => a !== action));
                              } else if (enabledActions.includes(action)) {
                                const next = enabledActions.filter((a) => a !== action);
                                setEnabledActions(next.length === 0 ? [] : next);
                              } else {
                                const next = [...enabledActions, action];
                                // If all are selected, reset to empty (= all)
                                setEnabledActions(next.length === agentActions.length ? [] : next);
                              }
                            }}
                            className="rounded border-zinc-600 bg-zinc-800 text-orange-500 focus:ring-orange-500/50 h-3 w-3"
                          />
                          <span className="text-xs text-zinc-300">
                            {action.replace(/_/g, " ")}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Trigger Team (Inter-Team Communication) ── */}
              {role !== "APPROVAL_GATE" && (
                <div className="space-y-3 border-t border-zinc-800 pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                        <Network className="h-3 w-3" />
                        Trigger Workflow
                      </label>
                      <p className="mt-1 text-[10px] text-zinc-500">
                        After this agent completes, trigger another workflow&apos;s execution.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTriggerTeamEnabled(!triggerTeamEnabled)}
                      className={cn(
                        "relative h-5 w-9 rounded-full transition-colors",
                        triggerTeamEnabled ? "bg-orange-500" : "bg-zinc-700"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                          triggerTeamEnabled ? "left-4.5" : "left-0.5"
                        )}
                      />
                    </button>
                  </div>

                  {triggerTeamEnabled && (
                    <div className="space-y-3 ml-1">
                      <div>
                        <label className="text-[10px] text-zinc-500 mb-1 block">Target Workflow</label>
                        <select
                          value={triggerTeamTargetId}
                          onChange={(e) => setTriggerTeamTargetId(e.target.value)}
                          className="w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60"
                        >
                          <option value="">Select workflow...</option>
                          {availableTeams.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] text-zinc-500 mb-1 block">Mode</label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setTriggerTeamMode("async")}
                            className={cn(
                              "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                              triggerTeamMode === "async"
                                ? "border-orange-500/40 bg-orange-500/10 text-orange-400"
                                : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600"
                            )}
                          >
                            Async (fire &amp; forget)
                          </button>
                          <button
                            type="button"
                            onClick={() => setTriggerTeamMode("sync")}
                            className={cn(
                              "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                              triggerTeamMode === "sync"
                                ? "border-blue-500/40 bg-white/[0.05] text-gray-400"
                                : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600"
                            )}
                          >
                            Sync (wait for result)
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] text-zinc-500 mb-1 block">
                          Goal Template <span className="text-zinc-600">(optional, use {`{{field}}`} for context)</span>
                        </label>
                        <input
                          value={triggerTeamGoal}
                          onChange={(e) => setTriggerTeamGoal(e.target.value)}
                          placeholder="e.g. Onboard the lead {{leadName}} from {{company}}"
                          className="w-full bg-zinc-800/60 border border-zinc-700 rounded-lg text-xs text-zinc-200 outline-none px-3 py-2 placeholder:text-zinc-600 focus:border-orange-500/50"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Execution Mode ── */}
              <div className="space-y-1.5 border-t border-zinc-800 pt-4">
                <label className="text-xs font-medium text-zinc-400">Execution Mode</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setExecutionMode("sequential")}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                      executionMode === "sequential"
                        ? "border-orange-500/40 bg-orange-500/10 text-orange-400"
                        : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600"
                    )}
                  >
                    Sequential
                  </button>
                  <button
                    type="button"
                    onClick={() => setExecutionMode("parallel")}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                      executionMode === "parallel"
                        ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-400"
                        : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600"
                    )}
                  >
                    ⚡ Parallel
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500">
                  {executionMode === "parallel"
                    ? "This agent runs simultaneously with sibling agents that share the same parent and are also set to parallel."
                    : "This agent runs sequentially in the execution order."}
                </p>
              </div>

              {role !== "APPROVAL_GATE" && (
                <div className="space-y-3 border-t border-zinc-800 pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-medium text-zinc-400">Fallback Runtime</label>
                      <p className="mt-1 text-[10px] text-zinc-500">
                        Retry the primary agent first, then switch to a fallback agent or cheaper model.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFallbackEnabled((value) => !value)}
                      className={cn(
                        "relative h-5 w-9 rounded-full transition-colors",
                        fallbackEnabled ? "bg-orange-500" : "bg-zinc-700"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                          fallbackEnabled ? "left-4.5" : "left-0.5"
                        )}
                      />
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-400">Fallback Agent</label>
                      <div className="relative">
                        <select
                          value={fallbackAgentId}
                          onChange={(e) => setFallbackAgentId(e.target.value)}
                          disabled={!fallbackEnabled}
                          className="w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors pr-8 disabled:opacity-50"
                        >
                          <option value="">None</option>
                          {availableFallbackAgents.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                              {agent.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-400">Fallback Model</label>
                      <div className="relative">
                        <select
                          value={fallbackModel}
                          onChange={(e) => setFallbackModel(e.target.value)}
                          disabled={!fallbackEnabled}
                          className="w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors pr-8 disabled:opacity-50"
                        >
                          <option value="">None</option>
                          {fallbackModelOptions.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.label}
                              {model.badge ? ` — ${model.badge}` : ""}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-400">Max Retries Before Fallback</label>
                    <input
                      type="number"
                      min={0}
                      max={5}
                      value={maxRetries}
                      onChange={(e) => setMaxRetries(Math.max(0, Math.min(5, Number(e.target.value) || 0)))}
                      disabled={!fallbackEnabled}
                      className="w-28 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors disabled:opacity-50"
                    />
                  </div>

                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                    <p className="text-[10px] text-zinc-500">
                      {fallbackEnabled
                        ? `Primary attempts: ${maxRetries + 1}. ${
                            fallbackAgentId || fallbackModel
                              ? "If those fail, the runtime switches automatically."
                              : "Add a fallback agent or model to activate the last-resort path."
                          }`
                        : "Fallbacks are disabled for this member."}
                    </p>
                  </div>
                </div>
              )}

              {/* ── Feedback Loop ── */}
              <div className="space-y-1.5 border-t border-zinc-800 pt-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-400">Feedback Loop</label>
                  <button
                    type="button"
                    onClick={() => setLoopEnabled(!loopEnabled)}
                    className={cn(
                      "relative w-8 h-4.5 rounded-full transition-colors",
                      loopEnabled ? "bg-orange-500" : "bg-zinc-700"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
                        loopEnabled ? "left-4" : "left-0.5"
                      )}
                    />
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500">
                  Route output back to another agent for revision until quality threshold is met.
                </p>

                {loopEnabled && (
                  <div className="space-y-2 mt-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-500">Target Agent (to revise)</label>
                      <select
                        value={loopTargetMemberId}
                        onChange={(e) => setLoopTargetMemberId(e.target.value)}
                        className="w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-md text-xs text-zinc-100 px-2 py-1.5 outline-none focus:border-orange-500/60"
                      >
                        <option value="">— Select agent —</option>
                        {allMembers
                          .filter((m) => m.id !== member.id && m.role !== "APPROVAL_GATE")
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.agent?.name || "Unassigned"} ({m.role})
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500">Quality Field</label>
                        <input
                          value={loopQualityField}
                          onChange={(e) => setLoopQualityField(e.target.value)}
                          placeholder="e.g. quality_score"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-md text-xs text-zinc-100 px-2 py-1.5 outline-none focus:border-orange-500/60 font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500">Threshold</label>
                        <input
                          type="number"
                          value={loopQualityThreshold}
                          onChange={(e) => setLoopQualityThreshold(Number(e.target.value) || 0)}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-md text-xs text-zinc-100 px-2 py-1.5 outline-none focus:border-orange-500/60"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-zinc-500">Max Iterations</label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={loopMaxIterations}
                        onChange={(e) => setLoopMaxIterations(Math.max(1, Math.min(10, Number(e.target.value) || 3)))}
                        className="w-20 bg-zinc-800 border border-zinc-700 rounded-md text-xs text-zinc-100 px-2 py-1.5 outline-none focus:border-orange-500/60"
                      />
                    </div>

                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2 mt-1">
                      <p className="text-[9px] text-zinc-500">
                        After this agent evaluates, if <code className="text-orange-400">{loopQualityField || "field"}</code> {"<"} {loopQualityThreshold}, output is routed back to the target agent with feedback for revision (max {loopMaxIterations} iterations).
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Panel footer */}
        <div className="px-5 py-4 border-t border-border shrink-0 space-y-2">
          <Button
            onClick={handleSave}
            disabled={saving || loadingAgent}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white"
            size="sm"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {saving ? "Saving..." : "Save Changes"}
          </Button>

          {confirmRemove ? (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmRemove(false)}
                className="flex-1 text-zinc-400"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleRemove}
                disabled={removing}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                {removing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
                Confirm Remove
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmRemove(true)}
              className="w-full text-gray-400 hover:text-red-300 hover:bg-white/[0.05]"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove Node
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

/* ========== Add Member Modal ========== */
interface AddMemberModalProps {
  teamId: string;
  allMembers: TeamMember[];
  onClose: () => void;
  onAdded: () => void;
}

function AddMemberModal({ teamId, allMembers, onClose, onAdded }: AddMemberModalProps) {
  const [agentName, setAgentName] = useState("");
  const [role, setRole] = useState<"HEAD" | "COORDINATOR" | "EXECUTOR" | "REPORTER" | "APPROVAL_GATE">("EXECUTOR");
  const [agentMode, setAgentMode] = useState<"CHAT" | "TASK">("CHAT");
  const [provider, setProvider] = useState<ProviderKey>("ANTHROPIC");
  const [llmModel, setLlmModel] = useState("claude-sonnet-4-6");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [reportsToMemberId, setReportsToMemberId] = useState("");
  const [responsibilities, setResponsibilities] = useState("");
  const [approverEmail, setApproverEmail] = useState("");
  const [approvalMessage, setApprovalMessage] = useState("");
  const [timeoutHours, setTimeoutHours] = useState(24);
  const [timeoutAction, setTimeoutAction] = useState<ApprovalTimeoutAction>("skip");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableModels = useMemo(() => getModelsForProvider(provider), [provider]);

  const handleProviderChange = (p: ProviderKey) => {
    setProvider(p);
    const models = getModelsForProvider(p);
    setLlmModel(models[0]?.id || "");
  };

  const handleCreate = async () => {
    if (!agentName.trim() || creating) return;
    if (role !== "APPROVAL_GATE" && !systemPrompt.trim()) return;
    setCreating(true);
    setError(null);
    try {
      let agent: { id: string } | null = null;
      if (role !== "APPROVAL_GATE") {
        const slug = agentName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now();
        const agentRes = await fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: agentName.trim(),
            slug,
            systemPrompt: systemPrompt.trim(),
            llmModel,
            modelProvider: provider,
            agentMode,
          }),
        });
        if (!agentRes.ok) {
          const d = await agentRes.json().catch(() => ({}));
          throw new Error(d.error || "Failed to create agent");
        }
        agent = await agentRes.json();
      }

      // 2. Add as team member
      const memberRes = await fetch(`/api/teams/${teamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent?.id,
          name: role === "APPROVAL_GATE" ? agentName.trim() : undefined,
          role,
          responsibilities: responsibilities.trim() || undefined,
          reportsToMemberId: reportsToMemberId || undefined,
          level: 0,
          config:
            role === "APPROVAL_GATE"
              ? {
                  approverEmail: approverEmail.trim(),
                  approvalMessage: approvalMessage.trim(),
                  timeoutHours,
                  timeoutAction,
                }
              : undefined,
        }),
      });
      if (!memberRes.ok) {
        const d = await memberRes.json().catch(() => ({}));
        throw new Error(d.error || "Failed to add node");
      }

      onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-zinc-900 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-zinc-100 font-[family-name:var(--font-instrument)]">
            Add Node
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Agent name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Agent Name</label>
            <input
              autoFocus
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="e.g. Research Analyst"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors placeholder:text-zinc-600"
            />
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Role</label>
            <div className="relative">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
                className="w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors pr-8"
              >
                <option value="HEAD">HEAD</option>
                <option value="COORDINATOR">COORDINATOR</option>
                <option value="EXECUTOR">EXECUTOR</option>
                <option value="REPORTER">REPORTER</option>
                <option value="APPROVAL_GATE">APPROVAL_GATE</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
            </div>
          </div>

          {/* Agent mode */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Agent Mode</label>
            <div className="flex gap-2">
              {(["CHAT", "TASK"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setAgentMode(mode)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition-colors",
                    agentMode === mode
                      ? mode === "CHAT"
                        ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                        : "bg-green-500/20 border-green-500/40 text-green-300"
                      : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {mode === "CHAT" ? <MessageSquare className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
                  {mode === "CHAT" ? "Chat" : "Task"}
                </button>
              ))}
            </div>
          </div>

          {/* Provider */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Provider</label>
            <div className="relative">
              <select
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value as ProviderKey)}
                className="w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors pr-8"
              >
                {(Object.keys(PROVIDERS) as ProviderKey[]).map((p) => (
                  <option key={p} value={p}>{PROVIDERS[p].label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
            </div>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Model</label>
            <div className="relative">
              <select
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                className="w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors pr-8"
              >
                {availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}{m.badge ? ` — ${m.badge}` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
            </div>
          </div>

          {/* System prompt */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">System Prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={4}
              placeholder="Define the agent's behavior and expertise..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors resize-none placeholder:text-zinc-600"
            />
          </div>

          {/* Responsibilities */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">Responsibilities</label>
            <textarea
              value={responsibilities}
              onChange={(e) => setResponsibilities(e.target.value)}
              rows={2}
              placeholder="e.g. Research and summarize competitor analysis..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors resize-none placeholder:text-zinc-600"
            />
          </div>

          {role === "APPROVAL_GATE" && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Approver Email</label>
                <input
                  value={approverEmail}
                  onChange={(e) => setApproverEmail(e.target.value)}
                  placeholder="approver@example.com"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors placeholder:text-zinc-600"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Approval Message</label>
                <textarea
                  value={approvalMessage}
                  onChange={(e) => setApprovalMessage(e.target.value)}
                  rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Timeout Hours</label>
                  <input
                    type="number"
                    min={1}
                    value={timeoutHours}
                    onChange={(e) => setTimeoutHours(Math.max(1, Number(e.target.value) || 24))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-400">Timeout Action</label>
                  <select
                    value={timeoutAction}
                    onChange={(e) => setTimeoutAction(e.target.value as ApprovalTimeoutAction)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors"
                  >
                    <option value="auto_approve">Auto approve</option>
                    <option value="auto_reject">Auto reject</option>
                    <option value="skip">Skip gate</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {/* Reports to */}
          {allMembers.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-400">Reports To</label>
              <div className="relative">
                <select
                  value={reportsToMemberId}
                  onChange={(e) => setReportsToMemberId(e.target.value)}
                  className="w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-orange-500/60 transition-colors pr-8"
                >
                  <option value="">— None (root) —</option>
                  {allMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {getMemberDisplayName(m)} ({m.role})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-gray-400 bg-white/[0.05] border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Modal footer */}
        <div className="px-5 py-4 border-t border-border shrink-0 flex justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-zinc-400">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={creating || !agentName.trim() || (role !== "APPROVAL_GATE" && !systemPrompt.trim())}
            className="bg-orange-600 hover:bg-orange-700 text-white min-w-[100px]"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            {creating ? "Creating..." : "Add Node"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ========== Main inner component (needs ReactFlowProvider above) ========== */
function TeamDetailInner() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.id as string;

  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("hierarchy");
  const [focusedExecutionId, setFocusedExecutionId] = useState<string | null>(null);
  const [sharedContextPreview, setSharedContextPreview] = useState<Record<string, unknown>>({});

  // Inline name editing
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");

  // Settings dropdown
  const [showSettings, setShowSettings] = useState(false);

  // Error handler config
  const [errorHandlerConfig, setErrorHandlerConfig] = useState<ErrorHandlerConfig>({
    onUnhandledError: "stop",
  });

  // Assign task dialog
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assignGoal, setAssignGoal] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Debug / profiling tools
  const [debugExecutionId, setDebugExecutionId] = useState<string | null>(null);
  const [showDebugRunner, setShowDebugRunner] = useState(false);
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [logViewerExecId, setLogViewerExecId] = useState<string | null>(null);
  const [showExecDiff, setShowExecDiff] = useState(false);
  const [showProfiler, setShowProfiler] = useState(false);
  const [profilerExecId, setProfilerExecId] = useState<string | null>(null);
  const [debugRunning, setDebugRunning] = useState(false);

  // New task inline form
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<string>("MEDIUM");
  const [creatingTask, setCreatingTask] = useState(false);

  // Toggling status
  const [toggling, setToggling] = useState(false);

  // Generate members
  const [generatingMembers, setGeneratingMembers] = useState(false);
  const [convertingToTask, setConvertingToTask] = useState(false);

  // Member edit panel
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const selectedMember = useMemo(
    () => (team && selectedMemberId ? team.members.find((m) => m.id === selectedMemberId) || null : null),
    [team, selectedMemberId]
  );

  // Add member modal
  const [showAddMember, setShowAddMember] = useState(false);

  // Visual editor view toggle
  const [hierarchyView, setHierarchyView] = useState<"visual" | "list">("visual");
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [teamKnowledgeCount, setTeamKnowledgeCount] = useState(0);

  // Health score
  const [healthScore, setHealthScore] = useState<{
    overall: number;
    color: "green" | "yellow" | "red";
    categories: { name: string; score: number; weight: number; explanation: string }[];
    weakestLink: { agentName: string; memberId: string; errorRate: number; suggestion: string } | null;
    trend: { current: number; previous: number; direction: "up" | "down" | "stable" };
    suggestions: string[];
  } | null>(null);
  const [showHealthBreakdown, setShowHealthBreakdown] = useState(false);

  // Clone team
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [cloning, setCloning] = useState(false);

  // Queue & Priorität
  const [maxConcurrent, setMaxConcurrent] = useState(5);
  const [queueStatus, setQueueStatus] = useState<{ running: number; queued: number; maxConcurrent: number } | null>(null);
  const [savingQueue, setSavingQueue] = useState(false);

  // Workflow node config is now handled inside VisualTeamEditor

  // Workflow execution state (canvas Run button)
  const [wfExecStatus, setWfExecStatus] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [wfExecDuration, setWfExecDuration] = useState<number | undefined>();
  const [wfExecCredits, setWfExecCredits] = useState<number | undefined>();
  const [wfNodeResults, setWfNodeResults] = useState<Record<string, { input?: unknown; output?: unknown; status?: "completed" | "failed" | "running" }>>({});
  const wfExecPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Data mapper panel
  const [dataMapperEdgeId, setDataMapperEdgeId] = useState<string | null>(null);
  const [dataMapperSourceId, setDataMapperSourceId] = useState("");
  const [dataMapperTargetId, setDataMapperTargetId] = useState("");

  // Workflow nodes/edges stored in team config
  const workflowNodes = useMemo(() => {
    const cfg = team?.config as Record<string, unknown> | null;
    const wf = cfg?.workflow as Record<string, unknown> | undefined;
    return (wf?.nodes as { id: string; type: WorkflowNodeType; label: string; position: { x: number; y: number }; config: Record<string, unknown> }[]) || [];
  }, [team?.config]);

  const workflowEdges = useMemo(() => {
    const cfg = team?.config as Record<string, unknown> | null;
    const wf = cfg?.workflow as Record<string, unknown> | undefined;
    return (wf?.edges as { sourceId: string; targetId: string; condition?: string; sourceHandle?: string; mappings?: FieldMapping[] }[]) || [];
  }, [team?.config]);

  /* Fetch team data */
  const fetchTeam = useCallback(async () => {
    try {
      const res = await fetch(`/api/teams/${teamId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load workflow");
      }
      const data: Team = await res.json();
      setTeam(data);
      setNameValue(data.name);
      if (data.config?.nodePositions) {
        setNodePositions(data.config.nodePositions);
      }
      // Fetch team knowledge count for visual editor
      fetch(`/api/teams/${teamId}/knowledge`)
        .then((r) => (r.ok ? r.json() : []))
        .then((entries: unknown[]) => setTeamKnowledgeCount(entries.length))
        .catch(() => {});
      // Initialize maxConcurrent from config
      if (data.config?.maxConcurrent && typeof data.config.maxConcurrent === "number") {
        setMaxConcurrent(data.config.maxConcurrent);
      }
      // Initialize error handler config
      if (data.config?.errorHandler) {
        setErrorHandlerConfig(data.config.errorHandler as ErrorHandlerConfig);
      }
      // Fetch queue status
      fetch(`/api/teams/${teamId}/queue-status`)
        .then((r) => (r.ok ? r.json() : null))
        .then((qs) => { if (qs) setQueueStatus(qs); })
        .catch(() => {});
      // Fetch health score
      fetch(`/api/teams/${teamId}/health`)
        .then((r) => (r.ok ? r.json() : null))
        .then((hs) => { if (hs && typeof hs.overall === "number") setHealthScore(hs); })
        .catch(() => {});
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  /* Toggle team status */
  const toggleStatus = async () => {
    if (!team || toggling) return;
    setToggling(true);
    try {
      const newStatus = team.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
      const res = await fetch(`/api/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setTeam((prev) => (prev ? { ...prev, status: newStatus } : prev));
      }
    } finally {
      setToggling(false);
    }
  };

  /* Save name */
  const saveName = async () => {
    if (!team || !nameValue.trim() || nameValue === team.name) {
      setEditingName(false);
      return;
    }
    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameValue.trim() }),
      });
      if (res.ok) {
        setTeam((prev) => (prev ? { ...prev, name: nameValue.trim() } : prev));
      }
    } finally {
      setEditingName(false);
    }
  };

  /* Delete team */
  const deleteTeam = async () => {
    if (!confirm("Are you sure you want to delete this workflow?")) return;
    try {
      const res = await fetch(`/api/teams/${teamId}`, { method: "DELETE" });
      if (res.ok) router.push("/dashboard/teams");
    } catch {
      // noop
    }
  };

  /* Clone team */
  const cloneTeam = async () => {
    if (cloning) return;
    setCloning(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/clone`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setShowCloneModal(false);
        router.push(`/dashboard/teams/${data.id}`);
      }
    } finally {
      setCloning(false);
    }
  };

  /* Execute goal (assign task via Claude decomposition) */
  const executeGoal = async () => {
    if (!assignGoal.trim() || assigning) return;
    setAssigning(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: assignGoal.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowAssignDialog(false);
        setAssignGoal("");
        setFocusedExecutionId(data.executionId || null);
        setActiveTab("executions");
        await fetchTeam();
      }
    } finally {
      setAssigning(false);
    }
  };

  /* Debug execution (step-by-step) */
  const executeDebug = async () => {
    if (!assignGoal.trim() || debugRunning) return;
    setDebugRunning(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/execute-debug`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: assignGoal.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setDebugExecutionId(data.executionId);
        setShowDebugRunner(true);
        setShowAssignDialog(false);
        setAssignGoal("");
      }
    } finally {
      setDebugRunning(false);
    }
  };

  /* Generate members from goal via Claude */
  const generateMembers = async () => {
    if (!team || generatingMembers) return;
    setGeneratingMembers(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/generate-members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data: Team = await res.json();
        setTeam(data);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to generate workflow nodes");
      }
    } catch {
      setError("Failed to generate workflow nodes");
    } finally {
      setGeneratingMembers(false);
    }
  };

  /* Check for non-Task agents that should be Task */
  const chatModeWarning = useMemo(() => {
    if (!team) return false;
    return team.members.some((m) => {
      const mode = m.agent?.agentMode;
      const role = m.role;
      // HEAD, COORDINATOR, REPORTER should always be Task
      if ((role === "HEAD" || role === "COORDINATOR" || role === "REPORTER") && mode === "CHAT") return true;
      return false;
    });
  }, [team]);

  /* Convert HEAD/COORDINATOR/REPORTER agents to Task mode */
  const convertToTask = async () => {
    if (!team || convertingToTask) return;
    setConvertingToTask(true);
    try {
      const toConvert = team.members.filter(
        (m) =>
          (m.role === "HEAD" || m.role === "COORDINATOR" || m.role === "REPORTER") &&
          m.agent?.agentMode === "CHAT" &&
          m.agentId
      );
      await Promise.all(
        toConvert.map((m) =>
          fetch(`/api/agents/${m.agentId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agentMode: "TASK" }),
          })
        )
      );
      await fetchTeam();
    } finally {
      setConvertingToTask(false);
    }
  };

  /* Create new task */
  const createTask = async () => {
    if (!newTaskTitle.trim() || creatingTask) return;
    setCreatingTask(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          description: newTaskDesc.trim() || undefined,
          priority: newTaskPriority,
        }),
      });
      if (res.ok) {
        setNewTaskTitle("");
        setNewTaskDesc("");
        setNewTaskPriority("MEDIUM");
        setShowNewTask(false);
        await fetchTeam();
      }
    } finally {
      setCreatingTask(false);
    }
  };

  /* Save node positions to team config */
  const saveNodePositions = useCallback(async (positions: Record<string, { x: number; y: number }>) => {
    setNodePositions(positions);
    try {
      await fetch(`/api/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: { nodePositions: positions } }),
      });
    } catch {
      // Silently fail — positions are still in local state
    }
  }, [teamId]);

  /* Save maxConcurrent to team config */
  const saveMaxConcurrent = useCallback(async (value: number) => {
    setSavingQueue(true);
    try {
      await fetch(`/api/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: { maxConcurrent: value } }),
      });
      // Refresh queue status
      const qs = await fetch(`/api/teams/${teamId}/queue-status`).then((r) => r.ok ? r.json() : null).catch(() => null);
      if (qs) setQueueStatus(qs);
    } catch {
      // Silently fail
    } finally {
      setSavingQueue(false);
    }
  }, [teamId]);

  /* Handle connection creation (update reportsTo) */
  const handleConnectionCreate = useCallback(async (sourceMemberId: string, targetMemberId: string) => {
    try {
      await fetch(`/api/teams/${teamId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: targetMemberId, reportsToMemberId: sourceMemberId }),
      });
      await fetchTeam();
    } catch {
      // Revert will happen on next fetchTeam
    }
  }, [teamId, fetchTeam]);

  /* Handle connection deletion (remove reportsTo) */
  const handleConnectionDelete = useCallback(async (_sourceMemberId: string, targetMemberId: string) => {
    try {
      await fetch(`/api/teams/${teamId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: targetMemberId, reportsToMemberId: null }),
      });
      await fetchTeam();
    } catch {
      // Revert will happen on next fetchTeam
    }
  }, [teamId, fetchTeam]);

  /* --- Workflow node/edge config handlers --- */
  const updateTeamConfig = useCallback(async (patch: Record<string, unknown>) => {
    const cfg = (team?.config || {}) as Record<string, unknown>;
    const merged = { ...cfg, ...patch };
    try {
      await fetch(`/api/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: merged }),
      });
      await fetchTeam();
    } catch { /* fetchTeam will correct state */ }
  }, [team?.config, teamId, fetchTeam]);

  const handleWorkflowNodesChange = useCallback((nodes: typeof workflowNodes) => {
    const cfg = (team?.config || {}) as Record<string, unknown>;
    const wf = (cfg.workflow || {}) as Record<string, unknown>;
    updateTeamConfig({ workflow: { ...wf, nodes } });
  }, [team?.config, updateTeamConfig]);

  const handleWorkflowEdgesChange = useCallback((edges: typeof workflowEdges) => {
    const cfg = (team?.config || {}) as Record<string, unknown>;
    const wf = (cfg.workflow || {}) as Record<string, unknown>;
    updateTeamConfig({ workflow: { ...wf, edges } });
  }, [team?.config, updateTeamConfig]);

  // handleWorkflowNodeClick, Save, Delete, LabelChange are now handled inside VisualTeamEditor

  // Run workflow from canvas — calls execute-debug API and polls for results
  const handleRunWorkflow = useCallback(async () => {
    if (wfExecStatus === "running") return;

    setWfExecStatus("running");
    setWfExecDuration(undefined);
    setWfExecCredits(undefined);
    setWfNodeResults({});

    // Mark all workflow nodes as "running" initially
    const initialResults: Record<string, { status: "running" }> = {};
    for (const wn of workflowNodes) {
      initialResults[wn.id] = { status: "running" };
    }
    setWfNodeResults(initialResults);

    const startTime = Date.now();

    try {
      const res = await fetch(`/api/teams/${teamId}/execute-debug`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: team?.goal || "Run Workflow" }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const { executionId } = await res.json();

      // Poll for execution results
      const poll = async () => {
        try {
          const execRes = await fetch(`/api/teams/${teamId}/executions/${executionId}`);
          if (!execRes.ok) return;
          const execData = await execRes.json();
          const exec = execData.execution;
          const timeline = execData.timeline as Array<{
            nodeId: string | null;
            nodeType: string | null;
            latestStatus: string;
            latestOutput: string | null;
            latestError: string | null;
            attempts: Array<{ input: unknown; output: string | null; structuredOutput: unknown }>;
          }>;

          // Build node results from execution logs
          const results: Record<string, { input?: unknown; output?: unknown; status?: "completed" | "failed" | "running" }> = {};
          for (const entry of timeline) {
            if (!entry.nodeId) continue;
            const lastAttempt = entry.attempts[entry.attempts.length - 1];
            results[entry.nodeId] = {
              status: entry.latestStatus === "COMPLETED" ? "completed"
                : entry.latestStatus === "FAILED" ? "failed"
                : "running",
              input: lastAttempt?.input,
              output: lastAttempt?.structuredOutput || lastAttempt?.output,
            };
          }
          setWfNodeResults(results);

          const duration = exec.durationMs || (Date.now() - startTime);

          if (exec.status === "COMPLETED" || exec.status === "FAILED") {
            // Done
            if (wfExecPollRef.current) {
              clearInterval(wfExecPollRef.current);
              wfExecPollRef.current = null;
            }
            setWfExecStatus(exec.status === "COMPLETED" ? "completed" : "failed");
            setWfExecDuration(duration);
            setWfExecCredits(exec.completedTasks || 0);
          }
        } catch {
          // Polling error — keep trying
        }
      };

      // Start polling every 2 seconds
      wfExecPollRef.current = setInterval(poll, 2000);
      // Also poll immediately once
      await poll();
    } catch (err) {
      setWfExecStatus("failed");
      setWfExecDuration(Date.now() - startTime);
      console.error("Workflow execution failed:", err);
    }
  }, [teamId, team?.goal, wfExecStatus, workflowNodes]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (wfExecPollRef.current) clearInterval(wfExecPollRef.current);
    };
  }, []);

  const handleEdgeClick = useCallback((edgeId: string, sourceNodeId: string, targetNodeId: string) => {
    setDataMapperEdgeId(edgeId);
    setDataMapperSourceId(sourceNodeId);
    setDataMapperTargetId(targetNodeId);
  }, []);

  const handleDataMapperSave = useCallback((_edgeId: string, mappings: FieldMapping[]) => {
    const updated = workflowEdges.map((e) => {
      const eid = `wfe-${e.sourceId}-${e.targetId}`;
      if (eid === dataMapperEdgeId) return { ...e, mappings };
      return e;
    });
    handleWorkflowEdgesChange(updated);
    setDataMapperEdgeId(null);
  }, [workflowEdges, dataMapperEdgeId, handleWorkflowEdgesChange]);

  /* Hierarchy graph (list view) */
  const { nodes, edges } = useMemo(() => {
    if (!team) return { nodes: [], edges: [] };
    return buildHierarchyGraph(team.members, team.tasks, Object.keys(sharedContextPreview));
  }, [sharedContextPreview, team]);

  /* Derived analytics */
  const analytics = useMemo(() => {
    if (!team) return { total: 0, completed: 0, avgTime: "N/A", activeMembers: 0 };
    const total = team.tasks.length;
    const completed = team.tasks.filter((t) => t.status === "COMPLETED").length;
    const completedTasks = team.tasks.filter((t) => t.status === "COMPLETED");
    let avgTime = "N/A";
    if (completedTasks.length > 0) {
      const totalMs = completedTasks.reduce((sum, t) => {
        return sum + (new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime());
      }, 0);
      const avgMs = totalMs / completedTasks.length;
      const avgMinutes = Math.round(avgMs / 60000);
      avgTime = avgMinutes < 60 ? `${avgMinutes}m` : `${Math.round(avgMinutes / 60)}h ${avgMinutes % 60}m`;
    }
    const activeMembers = team.members.length;
    return { total, completed, avgTime, activeMembers };
  }, [team]);

  /* Activity feed derived from tasks */
  const activityFeed = useMemo(() => {
    if (!team) return [];
    const items: { id: string; timestamp: string; description: string; memberName: string }[] = [];
    const memberMap = new Map(team.members.map((m) => [m.id, getMemberDisplayName(m)]));

    team.tasks.forEach((t) => {
      const normalizedStatus = normalizeTaskStatus(t.status);
      items.push({
        id: `${t.id}-created`,
        timestamp: t.createdAt,
        description: `Task "${t.title}" created`,
        memberName: t.assignedToId ? (memberMap.get(t.assignedToId) || "Unassigned") : "Unassigned",
      });
      if (normalizedStatus !== "PENDING") {
        items.push({
          id: `${t.id}-status`,
          timestamp: t.updatedAt,
          description: `Task "${t.title}" moved to ${statusLabels[normalizedStatus]?.label || normalizedStatus}`,
          memberName: t.assignedToId ? (memberMap.get(t.assignedToId) || "Unassigned") : "System",
        });
      }
    });

    return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [team]);

  /* Format relative time */
  const formatTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  /* ---- Loading / Error states ---- */
  if (loading) {
    return (
      <div className="h-full overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5" />
            <div className="space-y-1.5">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <Skeleton className="h-[400px] w-full rounded-xl" />
          <SkeletonTab />
        </div>
      </div>
    );
  }

  if (error || !team) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] gap-4">
        <ErrorState message={error || "Workflow not found"} />
        <Link href="/dashboard/teams">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Workflows
          </Button>
        </Link>
      </div>
    );
  }

  /* ---- Render ---- */
  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-64px)]">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/teams" className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>

          {/* Editable team name */}
          {editingName ? (
            <input
              autoFocus
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") {
                  setNameValue(team.name);
                  setEditingName(false);
                }
              }}
              className="bg-transparent border-b border-orange-500 text-xl font-semibold text-zinc-100 outline-none px-1 font-[family-name:var(--font-instrument)]"
            />
          ) : (
            <h1
              onClick={() => setEditingName(true)}
              className="text-xl font-semibold text-zinc-100 cursor-pointer hover:text-orange-400 transition-colors font-[family-name:var(--font-instrument)]"
            >
              {team.name}
            </h1>
          )}

          {/* Cloned/Forked badge */}
          {team.parentTeamId && (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] text-zinc-400 border border-zinc-700">
              <GitFork className="h-3 w-3" />
              {team.parentTeamName ? `Forked from ${team.parentTeamName}` : "Forked"}
            </span>
          )}

          {/* Status badge */}
          <span
            className={cn(
              "text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full",
              team.status === "ACTIVE"
                ? "bg-green-500/20 text-gray-400 border border-green-500/30"
                : "bg-zinc-700/60 text-zinc-400 border border-zinc-600/30"
            )}
          >
            {team.status}
          </span>

          {team.schedulePreview?.description ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-white/[0.05] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-300">
              <CalendarDays className="h-3 w-3" />
              {team.schedulePreview.description}
            </span>
          ) : null}

          {/* Health badge */}
          {healthScore && (
            <button
              onClick={() => setShowHealthBreakdown(!showHealthBreakdown)}
              className={cn(
                "flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all hover:scale-105",
                healthScore.color === "green" && "bg-green-500/15 text-gray-400 border-green-500/30",
                healthScore.color === "yellow" && "bg-amber-500/15 text-gray-400 border-amber-500/30",
                healthScore.color === "red" && "bg-red-500/15 text-gray-400 border-red-500/30"
              )}
            >
              <Heart className="h-3 w-3" />
              {healthScore.overall}%
              {healthScore.trend.direction === "up" && <TrendingUp className="h-3 w-3" />}
              {healthScore.trend.direction === "down" && <TrendingDown className="h-3 w-3" />}
            </button>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleStatus}
            disabled={toggling}
            className="border-border text-zinc-300 hover:text-zinc-100"
          >
            {toggling ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : team.status === "ACTIVE" ? (
              <Pause className="h-4 w-4 mr-2" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {team.status === "ACTIVE" ? "Pause" : "Start"}
          </Button>

          <Button
            size="sm"
            onClick={() => setShowAssignDialog(true)}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            <Target className="h-4 w-4 mr-2" />
            Assign Task
          </Button>

          {/* Settings dropdown */}
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
              className="text-zinc-400 hover:text-zinc-200"
            >
              <Settings className="h-4 w-4" />
            </Button>
            {showSettings && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSettings(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-xl border border-border bg-zinc-900 shadow-xl py-1">
                  <button
                    onClick={() => {
                      setShowSettings(false);
                      window.location.href = `/api/teams/${teamId}/export?format=yaml`;
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" /> Export YAML
                  </button>
                  <button
                    onClick={() => {
                      setShowSettings(false);
                      setShowCloneModal(true);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"
                  >
                    <Copy className="h-4 w-4" /> Clone Workflow
                  </button>
                  <button
                    onClick={() => {
                      setShowSettings(false);
                      router.push(`/dashboard/teams/ab-tests?teamA=${teamId}`);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"
                  >
                    <FlaskConical className="h-4 w-4" /> A/B Test
                  </button>
                  <button
                    onClick={async () => {
                      setShowSettings(false);
                      try {
                        const res = await fetch("/api/marketplace/submit-template", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ teamId }),
                        });
                        if (!res.ok) throw new Error("Fehler beim Einreichen");
                        alert("Template erfolgreich eingereicht!");
                      } catch {
                        alert("Template konnte nicht eingereicht werden.");
                      }
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"
                  >
                    <Share2 className="h-4 w-4" /> Als Template teilen
                  </button>
                  <div className="my-1 border-t border-zinc-800" />
                  <button
                    onClick={() => {
                      setShowSettings(false);
                      deleteTeam();
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-400 hover:bg-white/[0.05] flex items-center gap-2"
                  >
                    <Trash2 className="h-4 w-4" /> Delete Workflow
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ===== Health Score Breakdown ===== */}
      {showHealthBreakdown && healthScore && (
        <div className="mx-6 mt-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Heart className="h-4 w-4 text-orange-400" />
              Workflow Health Score
            </h3>
            <button onClick={() => setShowHealthBreakdown(false)} className="text-zinc-500 hover:text-zinc-300">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-5 gap-3 mb-3">
            {healthScore.categories.map((cat) => {
              const catColor = cat.score >= 80 ? "green" : cat.score >= 50 ? "amber" : "red";
              return (
                <div key={cat.name} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-medium text-zinc-400 truncate">{cat.name}</span>
                    <span className="text-[10px] text-zinc-500">{Math.round(cat.weight * 100)}%</span>
                  </div>
                  <div className={cn(
                    "text-lg font-bold",
                    catColor === "green" && "text-gray-400",
                    catColor === "amber" && "text-gray-400",
                    catColor === "red" && "text-gray-400"
                  )}>{cat.score}</div>
                  <div className="mt-1.5 h-1 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        catColor === "green" && "bg-green-500",
                        catColor === "amber" && "bg-amber-500",
                        catColor === "red" && "bg-red-500"
                      )}
                      style={{ width: `${cat.score}%` }}
                    />
                  </div>
                  <p className="text-[9px] text-zinc-500 mt-1.5 line-clamp-2">{cat.explanation}</p>
                </div>
              );
            })}
          </div>
          {healthScore.weakestLink && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 mb-2">
              <p className="text-[11px] text-gray-400">
                <AlertTriangle className="h-3 w-3 inline mr-1" />
                <strong>Schwachstelle:</strong> {healthScore.weakestLink.suggestion}
              </p>
            </div>
          )}
          {healthScore.suggestions.length > 0 && (
            <div className="space-y-1">
              {healthScore.suggestions.map((s, i) => (
                <p key={i} className="text-[10px] text-zinc-400 flex items-start gap-1.5">
                  <Sparkles className="h-3 w-3 text-orange-400 mt-0.5 shrink-0" />
                  {s}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== Tab navigation ===== */}
      <div className="flex items-center gap-1 px-6 pt-3 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-px",
              activeTab === tab.key
                ? "text-orange-400 border-b-2 border-orange-500 bg-orange-500/5"
                : "text-zinc-500 hover:text-zinc-300 border-b-2 border-transparent"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}

        {/* Hierarchy tab controls */}
        {activeTab === "hierarchy" && (
          <div className="ml-auto pb-1 flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-lg border border-zinc-700 overflow-hidden">
              <button
                onClick={() => setHierarchyView("visual")}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                  hierarchyView === "visual"
                    ? "bg-orange-500/15 text-orange-400"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <LayoutGrid className="h-3 w-3" />
                Visual
              </button>
              <button
                onClick={() => setHierarchyView("list")}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium transition-colors border-l border-zinc-700",
                  hierarchyView === "list"
                    ? "bg-orange-500/15 text-orange-400"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <List className="h-3 w-3" />
                Tree
              </button>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddMember(true)}
              className="border-dashed border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 h-8"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Node
            </Button>
          </div>
        )}
      </div>

      {/* ===== Tab content ===== */}
      <div className="flex-1 overflow-hidden">
        {/* ---- Hierarchy Tab ---- */}
        {activeTab === "hierarchy" && (
          <div className="h-full w-full flex flex-col">
            {/* Chat mode warning banner */}
            {chatModeWarning && (
              <div className="mx-4 mt-3 flex items-center gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-2.5 shrink-0">
                <Info className="h-4 w-4 text-gray-400 shrink-0" />
                <p className="flex-1 text-xs text-zinc-300">
                  Some agents in this workflow are set to Chat mode. For autonomous task execution, convert them to Task Agents.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={convertToTask}
                  disabled={convertingToTask}
                  className="shrink-0 border-blue-500/30 text-gray-400 hover:bg-white/[0.05] hover:text-blue-300 h-7 text-[11px]"
                >
                  {convertingToTask ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
                  Convert All to Task
                </Button>
              </div>
            )}
            {Object.keys(sharedContextPreview).length > 0 && (
              <div className="mx-4 mt-3 flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 shrink-0">
                <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.05]">
                  <Database className="h-4 w-4 text-gray-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-amber-200/80">
                    Shared Memory
                  </p>
                  <p className="mt-1 text-sm text-zinc-200">
                    {Object.keys(sharedContextPreview).length} context field(s) currently flow between workflow nodes.
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    {Object.entries(sharedContextPreview)
                      .slice(0, 4)
                      .map(([key, value]) => `${key}: ${String(value)}`)
                      .join(" · ")}
                  </p>
                </div>
              </div>
            )}
            {team.members.length === 0 && hierarchyView === "list" ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4 py-16">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-orange-500/10">
                  <Users className="h-10 w-10 text-orange-500/50" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-zinc-300 mb-1">No members in this workflow yet</p>
                  <p className="text-xs text-zinc-600 max-w-sm">
                    {team.goal
                      ? "Build your workflow visually on the canvas, generate agents from your goal, or add them manually."
                      : "Open the visual canvas to drag & drop nodes, or add a goal to generate agents."}
                  </p>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <Button
                    size="default"
                    onClick={() => setHierarchyView("visual")}
                    className="bg-orange-600 hover:bg-orange-700 text-white"
                  >
                    <LayoutGrid className="h-4 w-4 mr-2" />
                    Open Visual Canvas
                  </Button>
                  <div className="flex gap-2">
                    {team.goal && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={generateMembers}
                        disabled={generatingMembers}
                        className="border-zinc-700 text-zinc-300 hover:text-zinc-100"
                      >
                        {generatingMembers ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Generating agents...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-2" />
                            Generate Nodes from Goal
                          </>
                        )}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowAddMember(true)}
                      className="border-zinc-700 text-zinc-300 hover:text-zinc-100"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Manually
                    </Button>
                  </div>
                </div>
              </div>
            ) : hierarchyView === "visual" ? (
              /* ---- Visual Editor ---- */
              <div className="flex-1 min-h-0">
                <VisualTeamEditor
                  teamId={teamId}
                  members={team.members}
                  onNodeClick={(memberId) => setSelectedMemberId(memberId)}
                  onConnectionCreate={handleConnectionCreate}
                  onConnectionDelete={handleConnectionDelete}
                  savedPositions={nodePositions}
                  onPositionsChange={saveNodePositions}
                  teamKnowledgeCount={teamKnowledgeCount}
                  workflowNodes={workflowNodes}
                  workflowEdges={workflowEdges}
                  onWorkflowNodesChange={handleWorkflowNodesChange}
                  onWorkflowEdgesChange={handleWorkflowEdgesChange}
                  onEdgeClick={handleEdgeClick}
                  onRunWorkflow={handleRunWorkflow}
                  executionStatus={wfExecStatus}
                  executionDuration={wfExecDuration}
                  executionCredits={wfExecCredits}
                  nodeResults={wfNodeResults}
                />
              </div>
            ) : (
              /* ---- Tree View (original ReactFlow) ---- */
              <div className="flex-1 min-h-0">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  fitView
                  fitViewOptions={{ padding: 0.3 }}
                  minZoom={0.2}
                  maxZoom={1.5}
                  proOptions={{ hideAttribution: true }}
                  className="bg-[#1a1918]"
                  onNodeClick={(_event, node) => {
                    setSelectedMemberId(node.id);
                  }}
                >
                  <Background color="#27272a" gap={20} size={1} />
                  <MiniMap
                    nodeColor={(node) => {
                      const role = (node.data as TeamMemberNodeData)?.role;
                      return roleColors[role]?.hex || "#52525b";
                    }}
                    maskColor="rgba(0,0,0,0.7)"
                    className="!bg-zinc-900 !border-border rounded-lg"
                  />
                </ReactFlow>
              </div>
            )}
          </div>
        )}

        {/* ---- Tasks Tab ---- */}
        {activeTab === "tasks" && (
          <div className="p-6 h-full overflow-auto">
            {/* New task button / form */}
            <div className="mb-6">
              {showNewTask ? (
                <div className="rounded-xl border border-border bg-card p-4 space-y-3 max-w-lg">
                  <input
                    autoFocus
                    placeholder="Task title..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="w-full bg-transparent border-b border-zinc-700 text-sm text-zinc-100 outline-none pb-2 placeholder:text-zinc-600"
                  />
                  <textarea
                    placeholder="Description (optional)..."
                    value={newTaskDesc}
                    onChange={(e) => setNewTaskDesc(e.target.value)}
                    rows={2}
                    className="w-full bg-transparent border border-zinc-800 rounded-lg text-sm text-zinc-300 outline-none p-2 placeholder:text-zinc-600 resize-none"
                  />
                  <div className="flex items-center gap-3">
                    <select
                      value={newTaskPriority}
                      onChange={(e) => setNewTaskPriority(e.target.value)}
                      className="bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 px-3 py-1.5 outline-none"
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                    <div className="flex-1" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowNewTask(false)}
                      className="text-zinc-500"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={createTask}
                      disabled={creatingTask || !newTaskTitle.trim()}
                      className="bg-orange-600 hover:bg-orange-700 text-white"
                    >
                      {creatingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNewTask(true)}
                  className="border-dashed border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500"
                >
                  <Plus className="h-4 w-4 mr-2" /> New Task
                </Button>
              )}
            </div>

            {/* Kanban columns */}
            <div className="grid grid-cols-1 gap-4 min-h-[400px] md:grid-cols-2 2xl:grid-cols-5">
              {statusColumns.map((status) => {
                const col = statusLabels[status];
                const colTasks = team.tasks.filter((t) => normalizeTaskStatus(t.status) === status);
                const memberMap = new Map(team.members.map((m) => [m.id, getMemberDisplayName(m)]));

                return (
                  <div key={status} className="flex flex-col">
                    <div className={cn("flex items-center gap-2 mb-3 text-sm font-medium", col.color)}>
                      {col.icon}
                      <span>{col.label}</span>
                      <span className="text-xs bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded-full ml-auto">
                        {colTasks.length}
                      </span>
                    </div>

                    <div className="flex-1 space-y-2">
                      {colTasks.map((task) => (
                        <div
                          key={task.id}
                          className="rounded-xl border border-border bg-card p-3 hover:border-zinc-600 transition-colors"
                        >
                          <p className="text-sm font-medium text-zinc-200 mb-2">{task.title}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-500">
                              {task.assignedToId
                                ? memberMap.get(task.assignedToId) || "Unassigned"
                                : "Unassigned"}
                            </span>
                            <span
                              className={cn(
                                "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                                priorityColors[task.priority]?.bg,
                                priorityColors[task.priority]?.text
                              )}
                            >
                              {task.priority}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-600 mt-2">{formatTime(task.createdAt)}</p>
                        </div>
                      ))}

                      {colTasks.length === 0 && (
                        <div className="rounded-xl border border-dashed border-zinc-800 p-4 flex items-center justify-center">
                          <p className="text-xs text-zinc-700">No tasks</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ---- Activity Tab ---- */}
        {activeTab === "activity" && (
          <div className="p-6 h-full overflow-auto">
            {activityFeed.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-zinc-500 gap-3">
                <Activity className="h-10 w-10 text-zinc-700" />
                <p>No activity yet.</p>
              </div>
            ) : (
              <div className="max-w-2xl space-y-1">
                {activityFeed.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-4 px-4 py-3 rounded-lg hover:bg-zinc-800/40 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-zinc-400">
                        {item.memberName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-300">{item.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-zinc-600">{item.memberName}</span>
                        <span className="text-zinc-700">·</span>
                        <span className="text-xs text-zinc-600">{formatTime(item.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- Analytics Tab ---- */}
        {activeTab === "analytics" && (
          <div className="p-6 h-full overflow-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl">
              {[
                { label: "Total Tasks", value: analytics.total, icon: <Target className="h-5 w-5 text-orange-400" /> },
                { label: "Completed Tasks", value: analytics.completed, icon: <CheckCircle2 className="h-5 w-5 text-gray-400" /> },
                { label: "Avg Completion Time", value: analytics.avgTime, icon: <Clock className="h-5 w-5 text-gray-400" /> },
                { label: "Active Nodes", value: analytics.activeMembers, icon: <Users className="h-5 w-5 text-gray-400" /> },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-border bg-card p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-zinc-500">{stat.label}</span>
                    {stat.icon}
                  </div>
                  <p className="text-3xl font-bold text-zinc-100 font-[family-name:var(--font-dm-mono)]">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "knowledge" && (
          <div className="p-6 h-full overflow-auto">
            <TeamKnowledgeTab teamId={teamId} />
          </div>
        )}

        {activeTab === "cost" && (
          <div className="p-6 h-full overflow-auto space-y-6">
            <TeamCostCalculator teamId={teamId} />
            <TeamCostDashboard teamId={teamId} />
          </div>
        )}

        {activeTab === "executions" && (
          <TeamExecutionsTab
            teamId={teamId}
            focusExecutionId={focusedExecutionId}
            onRefreshTeam={fetchTeam}
            onExecutionContextChange={setSharedContextPreview}
            onOpenLogs={(execId) => {
              setLogViewerExecId(execId);
              setShowLogViewer(true);
            }}
            onOpenProfiler={(execId) => {
              setProfilerExecId(execId);
              setShowProfiler(true);
            }}
            onOpenDiff={() => setShowExecDiff(true)}
          />
        )}

        {activeTab === "versions" && (
          <div className="p-6 h-full overflow-auto">
            <div className="max-w-3xl space-y-8">
              <VersionHistoryPanel
                teamId={teamId}
                onRollback={fetchTeam}
              />
              <div className="border-t border-zinc-800 pt-6">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-100">
                  <GitCompare className="h-4 w-4 text-orange-500" />
                  Changelog
                </h3>
                <WorkflowChangelog teamId={teamId} />
              </div>
              <div className="border-t border-zinc-800 pt-6">
                <WorkflowActivityFeed teamId={teamId} />
              </div>
            </div>
          </div>
        )}

        {activeTab === "schedule" && (
          <div className="h-full overflow-auto">
            <TeamScheduleTab
              teamId={teamId}
              initialSchedule={team.config?.schedule || null}
              initialPreview={team.schedulePreview || null}
              onSaved={fetchTeam}
            />

            {/* Queue & Priorität */}
            <div className="mx-auto max-w-5xl px-6 pb-6">
            <div className="rounded-xl border border-border bg-card/50 p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10">
                  <Layers className="h-4 w-4 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Queue & Priorität</h3>
                  <p className="text-xs text-muted-foreground">Parallelität und Prioritäts-Regeln konfigurieren.</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-zinc-400">Max. gleichzeitige Ausführungen</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={maxConcurrent}
                      onChange={(e) => setMaxConcurrent(Math.max(1, Math.min(20, parseInt(e.target.value) || 5)))}
                      className="w-24 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:border-orange-500/50 focus:outline-none"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={savingQueue}
                      onClick={() => saveMaxConcurrent(maxConcurrent)}
                      className="text-xs"
                    >
                      {savingQueue ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                      Speichern
                    </Button>
                  </div>
                </div>

                {queueStatus && (
                  <div className="flex items-center gap-4 text-xs text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                      {queueStatus.running} laufend
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-cyan-500" />
                      {queueStatus.queued} wartend
                    </span>
                    <span className="text-zinc-600">/ {queueStatus.maxConcurrent} max</span>
                  </div>
                )}

                {/* Prioritäts-Regeln (nur Anzeige) */}
                <div className="pt-2 border-t border-zinc-800">
                  <p className="text-xs font-medium text-zinc-400 mb-2">Prioritäts-Regeln</p>
                  <div className="space-y-1.5">
                    {(["URGENT", "HIGH", "MEDIUM", "LOW"] as const).map((p) => (
                      <div key={p} className="flex items-center gap-2 text-xs">
                        <span className={cn("inline-block h-2 w-2 rounded-full", priorityColors[p].bg.replace("/20", "/60"))} />
                        <span className={priorityColors[p].text}>{p}</span>
                        <span className="text-zinc-600">— wird {p === "URGENT" ? "sofort" : p === "HIGH" ? "bevorzugt" : p === "MEDIUM" ? "normal" : "nachrangig"} verarbeitet</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>
        )}

        {activeTab === "webhooks" && (
          <div className="p-6 h-full overflow-auto">
            <TeamWebhooksTab teamId={teamId} />
          </div>
        )}

        {activeTab === "permissions" && (
          <div className="p-6 h-full overflow-auto">
            <TeamPermissionsTab teamId={teamId} isOwner={team.isOwner !== false} />
          </div>
        )}

        {activeTab === "settings" && (
          <div className="p-6 h-full overflow-auto max-w-2xl">
            <ErrorHandlerConfigPanel
              config={errorHandlerConfig}
              onChange={async (newConfig) => {
                setErrorHandlerConfig(newConfig);
                try {
                  await fetch(`/api/teams/${teamId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      config: { ...team.config, errorHandler: newConfig },
                    }),
                  });
                } catch {
                  // Silently fail — will sync on next save
                }
              }}
            />
          </div>
        )}
      </div>

      {/* ===== Member Edit Panel ===== */}
      <EditMemberPanel
        member={selectedMember}
        allMembers={team.members}
        teamId={teamId}
        onClose={() => setSelectedMemberId(null)}
        onSaved={fetchTeam}
      />

      {/* Workflow Node Config Panel is now handled inside VisualTeamEditor */}

      {/* ===== Data Mapper Panel ===== */}
      {(() => {
        const edge = workflowEdges.find((e) => `wfe-${e.sourceId}-${e.targetId}` === dataMapperEdgeId);
        const sourceNode = workflowNodes.find((n) => n.id === dataMapperSourceId);
        const targetNode = workflowNodes.find((n) => n.id === dataMapperTargetId);
        // Also check team members as nodes
        const sourceMember = team.members.find((m) => m.id === dataMapperSourceId);
        const targetMember = team.members.find((m) => m.id === dataMapperTargetId);
        const sourceType: WorkflowNodeType = sourceNode?.type || (sourceMember ? "agent" : "trigger_manual");
        const targetType: WorkflowNodeType = targetNode?.type || (targetMember ? "agent" : "trigger_manual");
        const sourceLabel = sourceNode?.label || sourceMember?.agent?.name || "Source";
        const targetLabel = targetNode?.label || targetMember?.agent?.name || "Target";
        return (
          <DataMapper
            edgeId={dataMapperEdgeId}
            sourceNodeId={dataMapperSourceId}
            targetNodeId={dataMapperTargetId}
            sourceNodeType={sourceType}
            targetNodeType={targetType}
            sourceLabel={sourceLabel}
            targetLabel={targetLabel}
            mappings={edge?.mappings || []}
            onSave={handleDataMapperSave}
            onClose={() => setDataMapperEdgeId(null)}
          />
        );
      })()}

      {/* ===== Add Member Modal ===== */}
      {showAddMember && (
        <AddMemberModal
          teamId={teamId}
          allMembers={team.members}
          onClose={() => setShowAddMember(false)}
          onAdded={fetchTeam}
        />
      )}

      {/* ===== Assign Task Dialog (overlay) ===== */}
      {showAssignDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-zinc-900 shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-zinc-100 font-[family-name:var(--font-instrument)]">
                Assign Task to Workflow
              </h2>
              <button
                onClick={() => {
                  setShowAssignDialog(false);
                  setAssignGoal("");
                }}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-zinc-500 mb-4">
              Describe the goal or task. Claude will decompose it into subtasks and assign them to workflow nodes.
            </p>

            <textarea
              autoFocus
              placeholder="e.g. Research competitors and create a summary report..."
              value={assignGoal}
              onChange={(e) => setAssignGoal(e.target.value)}
              rows={4}
              className="w-full bg-zinc-800/60 border border-zinc-700 rounded-xl text-sm text-zinc-200 outline-none p-4 placeholder:text-zinc-600 resize-none focus:border-orange-500/50 transition-colors"
            />

            <div className="flex justify-end gap-3 mt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowAssignDialog(false);
                  setAssignGoal("");
                }}
                className="text-zinc-400"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={executeDebug}
                disabled={debugRunning || assigning || !assignGoal.trim()}
                className="border-violet-500/30 text-gray-400 hover:bg-white/[0.05] min-w-[100px]"
              >
                {debugRunning ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Starting...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <FlaskConical className="h-4 w-4" />
                    <span>Debug Run</span>
                  </div>
                )}
              </Button>
              <Button
                size="sm"
                onClick={executeGoal}
                disabled={assigning || debugRunning || !assignGoal.trim()}
                className="bg-orange-600 hover:bg-orange-700 text-white min-w-[100px]"
              >
                {assigning ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Executing...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    <span>Execute</span>
                  </div>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Clone confirmation modal */}
      {showCloneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2 font-[family-name:var(--font-instrument)]">
                <Copy className="h-5 w-5 text-orange-400" />
                Clone Workflow
              </h2>
              <button onClick={() => setShowCloneModal(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-zinc-400 mb-6">
              This will create a copy of this workflow with all agents, knowledge bases, and settings. The cloned workflow will be independent from the original.
            </p>

            <div className="flex justify-end gap-3">
              <Button variant="ghost" size="sm" onClick={() => setShowCloneModal(false)} className="text-zinc-400">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={cloneTeam}
                disabled={cloning}
                className="bg-orange-600 hover:bg-orange-700 text-white min-w-[100px]"
              >
                {cloning ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Cloning...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Copy className="h-4 w-4" />
                    <span>Clone</span>
                  </div>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Debug Runner overlay */}
      <DebugRunner
        open={showDebugRunner}
        teamId={teamId}
        executionId={debugExecutionId}
        onClose={() => {
          setShowDebugRunner(false);
          setDebugExecutionId(null);
          fetchTeam();
        }}
      />

      {/* Log Viewer panel */}
      <LogViewer
        teamId={teamId}
        executionId={logViewerExecId}
        open={showLogViewer}
        onClose={() => {
          setShowLogViewer(false);
          setLogViewerExecId(null);
        }}
      />

      {/* Execution Diff modal */}
      <ExecutionDiff
        teamId={teamId}
        open={showExecDiff}
        onClose={() => setShowExecDiff(false)}
      />

      {/* Performance Profiler panel */}
      <PerformanceProfiler
        teamId={teamId}
        executionId={profilerExecId}
        open={showProfiler}
        onClose={() => {
          setShowProfiler(false);
          setProfilerExecId(null);
        }}
      />
    </div>
  );
}

/* ========== Page wrapper with ReactFlowProvider ========== */
export default function TeamDetailPage() {
  return (
    <ReactFlowProvider>
      <TeamDetailInner />
    </ReactFlowProvider>
  );
}
