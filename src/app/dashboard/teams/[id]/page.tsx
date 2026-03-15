"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { cn } from "@/lib/utils";
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
} from "lucide-react";
import {
  PROVIDERS,
  getModelsForProvider,
  getModelDef,
  type ProviderKey,
} from "@/lib/ai";

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

interface TeamMember {
  id: string;
  agentId: string;
  agent: TeamAgent;
  role: "HEAD" | "COORDINATOR" | "EXECUTOR" | "REPORTER";
  level: number;
  responsibilities?: string;
  reportsToMemberId?: string | null;
  reportsTo?: { id: string; agent: { id: string; name: string } } | null;
  subordinates?: { id: string; agent: { id: string; name: string } }[];
  createdAt: string;
}

interface TeamTask {
  id: string;
  teamId: string;
  assignedToId?: string | null;
  title: string;
  description?: string | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  result?: string | null;
  parentTaskId?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Team {
  id: string;
  name: string;
  description?: string;
  goal?: string;
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
  COORDINATOR: { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/40", hex: "#3B82F6" },
  EXECUTOR: { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/40", hex: "#22C55E" },
  REPORTER: { bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/40", hex: "#A855F7" },
};

const priorityColors: Record<string, { bg: string; text: string }> = {
  LOW: { bg: "bg-zinc-700/60", text: "text-zinc-400" },
  MEDIUM: { bg: "bg-blue-500/20", text: "text-blue-400" },
  HIGH: { bg: "bg-orange-500/20", text: "text-orange-400" },
  URGENT: { bg: "bg-red-500/20", text: "text-red-400" },
};

const statusColumns = ["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"] as const;
const statusLabels: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  PENDING: { label: "Pending", icon: <Clock className="h-4 w-4" />, color: "text-zinc-400" },
  IN_PROGRESS: { label: "In Progress", icon: <Loader2 className="h-4 w-4 animate-spin" />, color: "text-blue-400" },
  COMPLETED: { label: "Completed", icon: <CheckCircle2 className="h-4 w-4" />, color: "text-green-400" },
  FAILED: { label: "Failed", icon: <AlertTriangle className="h-4 w-4" />, color: "text-red-400" },
};

/* ========== Custom ReactFlow Node ========== */
type TeamMemberNodeData = {
  label: string;
  role: string;
  agentName: string;
  responsibilities: string;
  taskCount: number;
  llmModel?: string;
  agentMode?: string;
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
      {data.agentMode && (
        <div className="mt-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full",
              data.agentMode === "CHAT"
                ? "bg-blue-500/15 text-blue-400"
                : "bg-green-500/15 text-green-400"
            )}
          >
            {data.agentMode === "CHAT" ? (
              <MessageSquare className="h-2.5 w-2.5" />
            ) : (
              <Zap className="h-2.5 w-2.5" />
            )}
            {data.agentMode === "CHAT" ? "Chat" : "Task"}
          </span>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-zinc-600 !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { teamMember: TeamMemberNode };

/* ========== Tree layout helper ========== */
function buildHierarchyGraph(members: TeamMember[], tasks: TeamTask[]) {
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
  const roleYMap: Record<string, number> = { HEAD: 0, COORDINATOR: 200, EXECUTOR: 400, REPORTER: 600 };
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
      label: m.agent.name,
      role: m.role,
      agentName: m.agent.name,
      responsibilities: m.responsibilities || "",
      taskCount: taskCounts[m.id] || 0,
      llmModel: m.agent.llmModel || undefined,
      agentMode: m.agent.agentMode || undefined,
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
type TabKey = "hierarchy" | "tasks" | "activity" | "analytics";

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "hierarchy", label: "Hierarchy", icon: <Users className="h-4 w-4" /> },
  { key: "tasks", label: "Tasks", icon: <Target className="h-4 w-4" /> },
  { key: "activity", label: "Activity", icon: <Activity className="h-4 w-4" /> },
  { key: "analytics", label: "Analytics", icon: <BarChart3 className="h-4 w-4" /> },
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
  const [loadingAgent, setLoadingAgent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  // Editable fields
  const [agentName, setAgentName] = useState("");
  const [role, setRole] = useState<"HEAD" | "COORDINATOR" | "EXECUTOR" | "REPORTER">("EXECUTOR");
  const [responsibilities, setResponsibilities] = useState("");
  const [reportsToMemberId, setReportsToMemberId] = useState<string>("");
  const [provider, setProvider] = useState<ProviderKey>("ANTHROPIC");
  const [llmModel, setLlmModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [triggerType, setTriggerType] = useState("");
  const [outputType, setOutputType] = useState("");

  // Fetch full agent data when member changes
  useEffect(() => {
    if (!member) return;

    // Seed form from member data immediately
    setAgentName(member.agent.name);
    setRole(member.role);
    setResponsibilities(member.responsibilities || "");
    setReportsToMemberId(member.reportsToMemberId || "");
    setProvider((member.agent.modelProvider as ProviderKey) || "ANTHROPIC");
    setLlmModel(member.agent.llmModel || "");
    setSystemPrompt(member.agent.systemPrompt || "");
    setTriggerType(member.agent.triggerType || "");
    setOutputType(member.agent.outputType || "");
    setConfirmRemove(false);

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

  const availableModels = useMemo(() => getModelsForProvider(provider), [provider]);

  const handleProviderChange = (p: ProviderKey) => {
    setProvider(p);
    const models = getModelsForProvider(p);
    setLlmModel(models[0]?.id || "");
  };

  const handleSave = async () => {
    if (!member || saving) return;
    setSaving(true);
    try {
      // 1. Update agent fields
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

      // 2. Update member fields (role, responsibilities, reportsTo)
      await fetch(`/api/teams/${teamId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: member.id,
          role,
          responsibilities: responsibilities.trim() || undefined,
          reportsToMemberId: reportsToMemberId || null,
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

  const agentMode = agentData?.agentMode || member?.agent.agentMode;
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
            <h3 className="text-sm font-semibold text-zinc-100">Edit Member</h3>
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
                        agentMode === "CHAT"
                          ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                          : "bg-green-500/15 text-green-400 border border-green-500/30"
                      )}
                    >
                      {agentMode === "CHAT" ? (
                        <MessageSquare className="h-3 w-3" />
                      ) : (
                        <Zap className="h-3 w-3" />
                      )}
                      {agentMode === "CHAT" ? "Chat Agent" : "Task Agent"}
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
                          {m.agent.name} ({m.role})
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
              className="w-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove Member
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
  const [role, setRole] = useState<"HEAD" | "COORDINATOR" | "EXECUTOR" | "REPORTER">("EXECUTOR");
  const [agentMode, setAgentMode] = useState<"CHAT" | "TASK">("CHAT");
  const [provider, setProvider] = useState<ProviderKey>("ANTHROPIC");
  const [llmModel, setLlmModel] = useState("claude-sonnet-4-20250514");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [reportsToMemberId, setReportsToMemberId] = useState("");
  const [responsibilities, setResponsibilities] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableModels = useMemo(() => getModelsForProvider(provider), [provider]);

  const handleProviderChange = (p: ProviderKey) => {
    setProvider(p);
    const models = getModelsForProvider(p);
    setLlmModel(models[0]?.id || "");
  };

  const handleCreate = async () => {
    if (!agentName.trim() || !systemPrompt.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      // 1. Create agent
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
      const agent = await agentRes.json();

      // 2. Add as team member
      const memberRes = await fetch(`/api/teams/${teamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
          role,
          responsibilities: responsibilities.trim() || undefined,
          reportsToMemberId: reportsToMemberId || undefined,
          level: 0,
        }),
      });
      if (!memberRes.ok) {
        const d = await memberRes.json().catch(() => ({}));
        throw new Error(d.error || "Failed to add member");
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
            Add Member
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
                      {m.agent.name} ({m.role})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
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
            disabled={creating || !agentName.trim() || !systemPrompt.trim()}
            className="bg-orange-600 hover:bg-orange-700 text-white min-w-[100px]"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            {creating ? "Creating..." : "Add Member"}
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

  // Inline name editing
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");

  // Settings dropdown
  const [showSettings, setShowSettings] = useState(false);

  // Assign task dialog
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assignGoal, setAssignGoal] = useState("");
  const [assigning, setAssigning] = useState(false);

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

  // Member edit panel
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const selectedMember = useMemo(
    () => (team && selectedMemberId ? team.members.find((m) => m.id === selectedMemberId) || null : null),
    [team, selectedMemberId]
  );

  // Add member modal
  const [showAddMember, setShowAddMember] = useState(false);

  /* Fetch team data */
  const fetchTeam = useCallback(async () => {
    try {
      const res = await fetch(`/api/teams/${teamId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load team");
      }
      const data: Team = await res.json();
      setTeam(data);
      setNameValue(data.name);
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
    if (!confirm("Are you sure you want to delete this team?")) return;
    try {
      const res = await fetch(`/api/teams/${teamId}`, { method: "DELETE" });
      if (res.ok) router.push("/dashboard/teams");
    } catch {
      // noop
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
        setShowAssignDialog(false);
        setAssignGoal("");
        setActiveTab("tasks");
        await fetchTeam();
      }
    } finally {
      setAssigning(false);
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
        setError(data.error || "Failed to generate members");
      }
    } catch {
      setError("Failed to generate members");
    } finally {
      setGeneratingMembers(false);
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

  /* Hierarchy graph */
  const { nodes, edges } = useMemo(() => {
    if (!team) return { nodes: [], edges: [] };
    return buildHierarchyGraph(team.members, team.tasks);
  }, [team]);

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
    const memberMap = new Map(team.members.map((m) => [m.id, m.agent.name]));

    team.tasks.forEach((t) => {
      items.push({
        id: `${t.id}-created`,
        timestamp: t.createdAt,
        description: `Task "${t.title}" created`,
        memberName: t.assignedToId ? (memberMap.get(t.assignedToId) || "Unassigned") : "Unassigned",
      });
      if (t.status !== "PENDING") {
        items.push({
          id: `${t.id}-status`,
          timestamp: t.updatedAt,
          description: `Task "${t.title}" moved to ${statusLabels[t.status]?.label || t.status}`,
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
      <div className="flex items-center justify-center h-[80vh]">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (error || !team) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] gap-4">
        <AlertTriangle className="h-10 w-10 text-red-500" />
        <p className="text-zinc-400">{error || "Team not found"}</p>
        <Link href="/dashboard/teams">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Teams
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

          {/* Status badge */}
          <span
            className={cn(
              "text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full",
              team.status === "ACTIVE"
                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : "bg-zinc-700/60 text-zinc-400 border border-zinc-600/30"
            )}
          >
            {team.status}
          </span>
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
                      deleteTeam();
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                  >
                    <Trash2 className="h-4 w-4" /> Delete Team
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

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

        {/* Add Member button — only shown in hierarchy tab */}
        {activeTab === "hierarchy" && (
          <div className="ml-auto pb-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddMember(true)}
              className="border-dashed border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 h-8"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Member
            </Button>
          </div>
        )}
      </div>

      {/* ===== Tab content ===== */}
      <div className="flex-1 overflow-hidden">
        {/* ---- Hierarchy Tab ---- */}
        {activeTab === "hierarchy" && (
          <div className="h-full w-full">
            {team.members.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4 py-16">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-orange-500/10">
                  <Users className="h-10 w-10 text-orange-500/50" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-zinc-300 mb-1">No members in this team yet</p>
                  <p className="text-xs text-zinc-600 max-w-sm">
                    {team.goal
                      ? "Generate agents based on your team's goal using AI, or add them manually."
                      : "Add a goal to your team, then generate agents or add them manually."}
                  </p>
                </div>
                <div className="flex gap-2">
                  {team.goal && (
                    <Button
                      size="sm"
                      onClick={generateMembers}
                      disabled={generatingMembers}
                      className="bg-orange-600 hover:bg-orange-700 text-white"
                    >
                      {generatingMembers ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Generating agents...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Generate Members from Goal
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
            ) : (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.3 }}
                minZoom={0.2}
                maxZoom={1.5}
                proOptions={{ hideAttribution: true }}
                className="bg-[#0C0A09]"
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
            <div className="grid grid-cols-4 gap-4 min-h-[400px]">
              {statusColumns.map((status) => {
                const col = statusLabels[status];
                const colTasks = team.tasks.filter((t) => t.status === status);
                const memberMap = new Map(team.members.map((m) => [m.id, m.agent.name]));

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
                { label: "Completed Tasks", value: analytics.completed, icon: <CheckCircle2 className="h-5 w-5 text-green-400" /> },
                { label: "Avg Completion Time", value: analytics.avgTime, icon: <Clock className="h-5 w-5 text-blue-400" /> },
                { label: "Active Members", value: analytics.activeMembers, icon: <Users className="h-5 w-5 text-purple-400" /> },
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
      </div>

      {/* ===== Member Edit Panel ===== */}
      <EditMemberPanel
        member={selectedMember}
        allMembers={team.members}
        teamId={teamId}
        onClose={() => setSelectedMemberId(null)}
        onSaved={fetchTeam}
      />

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
                Assign Task to Team
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
              Describe the goal or task. Claude will decompose it into subtasks and assign them to team members.
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
                onClick={executeGoal}
                disabled={assigning || !assignGoal.trim()}
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
