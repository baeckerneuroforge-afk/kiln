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
} from "lucide-react";

/* ========== Types ========== */
interface TeamAgent {
  id: string;
  name: string;
  slug: string;
  description?: string;
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
  [key: string]: unknown;
};

function TeamMemberNode({ data }: NodeProps<Node<TeamMemberNodeData>>) {
  const role = data.role as string;
  const rc = roleColors[role] || roleColors.EXECUTOR;

  return (
    <div
      className={cn(
        "rounded-xl border bg-zinc-900/90 backdrop-blur-sm px-4 py-3 shadow-lg min-w-[200px] max-w-[260px]",
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

      <p className="text-sm font-semibold text-zinc-100 truncate">{data.agentName}</p>

      {data.responsibilities && (
        <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{data.responsibilities}</p>
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
      </div>

      {/* ===== Tab content ===== */}
      <div className="flex-1 overflow-hidden">
        {/* ---- Hierarchy Tab ---- */}
        {activeTab === "hierarchy" && (
          <div className="h-full w-full">
            {team.members.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
                <Users className="h-12 w-12 text-zinc-700" />
                <p>No members in this team yet.</p>
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
