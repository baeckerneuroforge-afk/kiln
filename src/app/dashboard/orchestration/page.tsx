"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  MarkerType,
  Node,
  Edge,
  Handle,
  Position,
  NodeProps,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Bot,
  Trash2,
  Play,
  Pause,
  Zap,
  GitBranch,
  User,
  Code,
  ArrowRight,
  Loader2,
  Network,
  Sparkles,
  LayoutTemplate,
  Save,
  ChevronDown,
  Split,
  X,
  MessageSquare,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { useAdvancedMode } from "@/hooks/use-advanced-mode";

/* ---------- Types ---------- */
interface AgentData {
  id: string;
  name: string;
  slug: string;
  status: string;
  description?: string;
  _count?: { conversations: number };
}

interface OrchConnection {
  id: string;
  sourceAgentId: string;
  targetAgentId: string;
  condition: string;
  enabled: boolean;
  handoffCount?: number;
  sourceAgent: { id: string; name: string; status: string; slug: string };
  targetAgent: { id: string; name: string; status: string; slug: string };
}

/* ---------- Status config ---------- */
const statusConfig: Record<string, { dot: string; border: string; label: string }> = {
  LIVE: { dot: "bg-kiln-green", border: "border-l-kiln-green", label: "Live" },
  DRAFT: { dot: "bg-muted-foreground", border: "border-l-muted-foreground", label: "Draft" },
  PAUSED: { dot: "bg-kiln-orange", border: "border-l-amber-500", label: "Paused" },
};

/* ---------- Custom Node: Agent ---------- */
function AgentNode({ data, selected }: NodeProps) {
  const d = data as { label: string; status: string; description: string; conversations: number };
  const sc = statusConfig[d.status] || statusConfig.DRAFT;
  const isLive = d.status === "LIVE";

  return (
    <div
      className={cn(
        "glass-node group relative min-w-[220px] rounded-xl border border-border/60 p-4 shadow-lg transition-all duration-200",
        "border-l-[3px]",
        sc.border,
        selected && "ring-1 ring-kiln-orange/40",
        isLive && "node-active-ring"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!-left-[7px] !h-3.5 !w-3.5 !rounded-full !border-2 !border-kiln-orange/60 !bg-background transition-all hover:!border-kiln-orange hover:!shadow-[0_0_0_3px_hsl(24_95%_53%/0.25)]"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!-right-[7px] !h-3.5 !w-3.5 !rounded-full !border-2 !border-kiln-orange/60 !bg-background transition-all hover:!border-kiln-orange hover:!shadow-[0_0_0_3px_hsl(24_95%_53%/0.25)]"
      />

      <div className="flex items-center gap-3">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-kiln-orange/10">
          <Bot className="h-4.5 w-4.5 text-kiln-orange" />
          {isLive && (
            <div className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-kiln-green status-pulse" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground leading-tight">{d.label}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <div className={cn("h-1.5 w-1.5 rounded-full", sc.dot)} />
            <span className="text-[10px] font-medium text-muted-foreground">{sc.label}</span>
          </div>
        </div>
      </div>

      {d.description && (
        <p className="mt-2.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/80">{d.description}</p>
      )}

      <div className="mt-2.5 flex items-center gap-3 border-t border-border/40 pt-2">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <MessageSquare className="h-3 w-3" />
          <span>{d.conversations}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Shared advanced node wrapper ---------- */
function AdvancedNodeShell({
  children,
  borderColor,
  selected,
  hasTarget = true,
  hasSource = true,
  handleColor,
}: {
  children: React.ReactNode;
  borderColor: string;
  selected?: boolean;
  hasTarget?: boolean;
  hasSource?: boolean;
  handleColor: string;
}) {
  return (
    <div
      className={cn(
        "glass-node group relative min-w-[170px] rounded-xl border p-3.5 shadow-md transition-all duration-200",
        borderColor,
        selected && "ring-1 ring-white/10"
      )}
    >
      {hasTarget && (
        <Handle
          type="target"
          position={Position.Left}
          className={cn("!-left-[7px] !h-3.5 !w-3.5 !rounded-full !border-2 !bg-background transition-all", handleColor)}
        />
      )}
      {hasSource && (
        <Handle
          type="source"
          position={Position.Right}
          className={cn("!-right-[7px] !h-3.5 !w-3.5 !rounded-full !border-2 !bg-background transition-all", handleColor)}
        />
      )}
      {children}
    </div>
  );
}

function ConditionNode({ data, selected }: NodeProps) {
  const d = data as { label: string; condition: string };
  return (
    <AdvancedNodeShell borderColor="border-kiln-blue/30" selected={selected} handleColor="!border-kiln-blue/60 hover:!border-kiln-blue">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-kiln-blue/10">
          <GitBranch className="h-3.5 w-3.5 text-kiln-blue" />
        </div>
        <span className="text-xs font-semibold text-kiln-blue">{d.label}</span>
      </div>
      {d.condition && (
        <p className="mt-2 text-[10px] leading-snug text-muted-foreground/80">{d.condition}</p>
      )}
    </AdvancedNodeShell>
  );
}

function TriggerNode({ data, selected }: NodeProps) {
  const d = data as { label: string };
  return (
    <AdvancedNodeShell borderColor="border-kiln-green/30" selected={selected} hasTarget={false} handleColor="!border-kiln-green/60 hover:!border-kiln-green">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-kiln-green/10">
          <Zap className="h-3.5 w-3.5 text-kiln-green" />
        </div>
        <span className="text-xs font-semibold text-kiln-green">{d.label}</span>
      </div>
    </AdvancedNodeShell>
  );
}

function CodeNode({ data, selected }: NodeProps) {
  const d = data as { label: string };
  return (
    <AdvancedNodeShell borderColor="border-purple-500/30" selected={selected} handleColor="!border-purple-500/60 hover:!border-purple-500">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10">
          <Code className="h-3.5 w-3.5 text-purple-400" />
        </div>
        <span className="text-xs font-semibold text-purple-400">{d.label}</span>
      </div>
    </AdvancedNodeShell>
  );
}

function HumanHandoffNode({ data, selected }: NodeProps) {
  const d = data as { label: string };
  return (
    <AdvancedNodeShell borderColor="border-kiln-ember/30" selected={selected} hasSource={false} handleColor="!border-kiln-ember/60 hover:!border-kiln-ember">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-kiln-ember/10">
          <User className="h-3.5 w-3.5 text-kiln-ember" />
        </div>
        <span className="text-xs font-semibold text-kiln-ember">{d.label}</span>
      </div>
    </AdvancedNodeShell>
  );
}

function RouterNode({ data, selected }: NodeProps) {
  const d = data as { label: string };
  return (
    <AdvancedNodeShell borderColor="border-amber-500/30" selected={selected} handleColor="!border-amber-500/60 hover:!border-amber-500">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10">
          <Split className="h-3.5 w-3.5 text-amber-400" />
        </div>
        <span className="text-xs font-semibold text-amber-400">{d.label}</span>
      </div>
    </AdvancedNodeShell>
  );
}

const nodeTypes = {
  agent: AgentNode,
  condition: ConditionNode,
  trigger: TriggerNode,
  code: CodeNode,
  humanHandoff: HumanHandoffNode,
  router: RouterNode,
};

/* ---------- Templates ---------- */
const templates = [
  { id: "sales-funnel", name: "Sales Funnel", description: "Lead Qualifier → Sales Closer → Onboarding", icon: Sparkles, color: "text-kiln-orange", bg: "bg-kiln-orange/10" },
  { id: "support-escalation", name: "Support Escalation", description: "L1 Support → L2 Technical → Human Handoff", icon: ArrowRight, color: "text-kiln-blue", bg: "bg-kiln-blue/10" },
  { id: "lead-nurture", name: "Lead Nurture", description: "Lead Capture → Lead Scorer → Follow-Up", icon: Zap, color: "text-kiln-green", bg: "bg-kiln-green/10" },
];

/* ---------- Advanced node palette ---------- */
const advancedNodePalette = [
  { type: "condition", label: "Condition", icon: GitBranch, color: "text-kiln-blue", bg: "bg-kiln-blue/10", border: "border-kiln-blue/20 hover:border-kiln-blue/40" },
  { type: "trigger", label: "Trigger", icon: Zap, color: "text-kiln-green", bg: "bg-kiln-green/10", border: "border-kiln-green/20 hover:border-kiln-green/40" },
  { type: "code", label: "Code", icon: Code, color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20 hover:border-purple-500/40" },
  { type: "humanHandoff", label: "Human Handoff", icon: User, color: "text-kiln-ember", bg: "bg-kiln-ember/10", border: "border-kiln-ember/20 hover:border-kiln-ember/40" },
  { type: "router", label: "Router", icon: Split, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20 hover:border-amber-500/40" },
];

/* ---------- Edge styles ---------- */
function makeEdgeStyle(enabled: boolean) {
  return {
    stroke: enabled ? "hsl(24, 95%, 53%)" : "hsl(0, 0%, 25%)",
    strokeWidth: enabled ? 2 : 1.5,
    strokeDasharray: enabled ? "6 3" : "4 4",
  };
}

function makeEdgeMarker(enabled: boolean) {
  return { type: MarkerType.ArrowClosed, color: enabled ? "hsl(24, 95%, 53%)" : "hsl(0, 0%, 25%)", width: 16, height: 16 };
}

/* ---------- Main Page ---------- */
export default function OrchestrationPage() {
  const { toast } = useToast();
  const { advancedMode } = useAdvancedMode();

  const [agents, setAgents] = useState<AgentData[]>([]);
  const [connections, setConnections] = useState<OrchConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [conditionInput, setConditionInput] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState<string | null>(null);

  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<{
    totalHandoffs: number;
    handoffsLast30Days: number;
    routes: { ruleId: string; sourceName: string; targetName: string; condition: string; count: number }[];
    avgHandoffsPerConversation: number;
  } | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([] as Edge[]);

  /* ---------- Load data ---------- */
  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/orchestration");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAgents(data.agents || []);
      setConnections(data.connections || []);
    } catch {
      toast("Failed to load orchestration data", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch("/api/orchestration/analytics");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAnalyticsData(data);
    } catch {
      toast("Failed to load analytics", "error");
    } finally {
      setAnalyticsLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ---------- Build nodes & edges from data ---------- */
  useEffect(() => {
    if (loading) return;

    const agentNodes: Node[] = agents.map((agent, i) => ({
      id: agent.id,
      type: "agent",
      position: { x: 120 + (i % 3) * 340, y: 120 + Math.floor(i / 3) * 220 },
      data: {
        label: agent.name,
        status: agent.status,
        description: agent.description || "",
        conversations: agent._count?.conversations || 0,
      },
    }));

    const connectionEdges: Edge[] = connections.map((conn) => {
      const countLabel = conn.handoffCount ? ` (${conn.handoffCount})` : "";
      const label = (conn.condition || "") + countLabel || undefined;
      return {
        id: conn.id,
        source: conn.sourceAgentId,
        target: conn.targetAgentId,
        label,
        type: "smoothstep",
        animated: conn.enabled,
        style: makeEdgeStyle(conn.enabled),
        labelStyle: { fill: "hsl(0, 0%, 64%)", fontSize: 10, fontWeight: 500 },
        labelBgStyle: { fill: "hsl(12, 6%, 7%)", fillOpacity: 0.92 },
        labelBgPadding: [8, 4] as [number, number],
        labelBgBorderRadius: 6,
        markerEnd: makeEdgeMarker(conn.enabled),
      };
    });

    setNodes(agentNodes);
    setEdges(connectionEdges);
  }, [agents, connections, loading, setNodes, setEdges]);

  /* ---------- Create connection ---------- */
  const onConnect = useCallback(
    async (params: Connection) => {
      if (!params.source || !params.target || params.source === params.target) return;

      const tempId = `temp-${Date.now()}`;
      setEdges((eds) =>
        addEdge(
          { ...params, id: tempId, type: "smoothstep", animated: true, style: makeEdgeStyle(true), markerEnd: makeEdgeMarker(true) },
          eds
        )
      );

      try {
        const res = await fetch("/api/orchestration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceAgentId: params.source, targetAgentId: params.target }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setEdges((eds) => eds.map((e) => (e.id === tempId ? { ...e, id: data.id, label: data.condition || undefined } : e)));
        setConnections((prev) => [...prev, data]);
        toast("Connection created");
      } catch {
        setEdges((eds) => eds.filter((e) => e.id !== tempId));
        toast("Failed to create connection", "error");
      }
    },
    [setEdges, toast]
  );

  /* ---------- Delete connection ---------- */
  const deleteConnection = useCallback(
    async (edgeId: string) => {
      if (edgeId.startsWith("temp-")) return;
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      setSelectedEdge(null);

      try {
        const res = await fetch("/api/orchestration", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: edgeId }) });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setConnections((prev) => prev.filter((c) => c.id !== edgeId));
        toast("Connection deleted");
      } catch {
        loadData();
        toast("Failed to delete connection", "error");
      }
    },
    [setEdges, toast, loadData]
  );

  /* ---------- Update condition ---------- */
  const updateCondition = useCallback(
    async (edgeId: string, condition: string) => {
      if (edgeId.startsWith("temp-")) return;
      setSaving(true);
      try {
        const res = await fetch("/api/orchestration", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: edgeId, condition }) });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setEdges((eds) => eds.map((e) => (e.id === edgeId ? { ...e, label: condition || undefined } : e)));
        setConnections((prev) => prev.map((c) => (c.id === edgeId ? { ...c, condition } : c)));
        toast("Condition saved");
      } catch {
        toast("Failed to update condition", "error");
      } finally {
        setSaving(false);
      }
    },
    [setEdges, toast]
  );

  /* ---------- Toggle connection ---------- */
  const toggleConnection = useCallback(
    async (edgeId: string) => {
      const conn = connections.find((c) => c.id === edgeId);
      if (!conn) return;
      const newEnabled = !conn.enabled;

      setEdges((eds) =>
        eds.map((e) =>
          e.id === edgeId ? { ...e, animated: newEnabled, style: makeEdgeStyle(newEnabled), markerEnd: makeEdgeMarker(newEnabled) } : e
        )
      );

      try {
        await fetch("/api/orchestration", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: edgeId, enabled: newEnabled }) });
        setConnections((prev) => prev.map((c) => (c.id === edgeId ? { ...c, enabled: newEnabled } : c)));
      } catch {
        loadData();
        toast("Failed to update connection", "error");
      }
    },
    [connections, setEdges, loadData, toast]
  );

  /* ---------- Apply template ---------- */
  const applyTemplate = useCallback(
    async (templateId: string) => {
      setCreatingTemplate(templateId);
      try {
        const res = await fetch("/api/orchestration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: templateId }) });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        toast("Template applied — agents and connections created");
        setShowTemplates(false);
        await loadData();
      } catch {
        toast("Failed to apply template", "error");
      } finally {
        setCreatingTemplate(null);
      }
    },
    [toast, loadData]
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setSelectedEdge(edge.id);
      const conn = connections.find((c) => c.id === edge.id);
      setConditionInput(conn?.condition || "");
    },
    [connections]
  );

  const addAdvancedNode = useCallback(
    (type: string, label: string) => {
      const id = `${type}-${Date.now()}`;
      setNodes((nds) => [...nds, { id, type, position: { x: 300 + Math.random() * 200, y: 200 + Math.random() * 200 }, data: { label, condition: "" } }]);
    },
    [setNodes]
  );

  const memoizedNodeTypes = useMemo(() => nodeTypes, []);
  const selectedConn = selectedEdge ? connections.find((c) => c.id === selectedEdge) : null;

  /* ---------- Loading ---------- */
  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="skeleton h-9 w-9 rounded-xl" />
            <div className="space-y-1.5">
              <div className="skeleton h-4 w-32 rounded" />
              <div className="skeleton h-3 w-48 rounded" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="skeleton h-9 w-28 rounded-lg" />
            <div className="skeleton h-9 w-9 rounded-lg" />
          </div>
        </div>
        <div className="flex-1 p-6">
          <div className="skeleton h-full w-full rounded-xl" />
        </div>
      </div>
    );
  }

  /* ---------- Empty state ---------- */
  if (agents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-lg text-center">
          {/* Decorative connected nodes illustration */}
          <div className="mx-auto mb-8 flex items-center justify-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-kiln-orange/20 bg-kiln-orange/5">
              <Bot className="h-6 w-6 text-kiln-orange/60" />
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <div className="h-px w-10 bg-gradient-to-r from-kiln-orange/40 to-kiln-blue/40" />
              <div className="h-px w-10 bg-gradient-to-r from-kiln-orange/20 to-kiln-blue/20" />
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-kiln-blue/20 bg-kiln-blue/5">
              <GitBranch className="h-6 w-6 text-kiln-blue/60" />
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <div className="h-px w-10 bg-gradient-to-r from-kiln-blue/40 to-kiln-green/40" />
              <div className="h-px w-10 bg-gradient-to-r from-kiln-blue/20 to-kiln-green/20" />
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-kiln-green/20 bg-kiln-green/5">
              <Bot className="h-6 w-6 text-kiln-green/60" />
            </div>
          </div>

          <h2 className="text-xl font-semibold text-foreground">Build your first agent team</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Create agents in the AI Agent Studio, then connect them here to build powerful multi-agent workflows with handoff rules.
          </p>

          <div className="mt-6 flex flex-col items-center gap-3">
            <a
              href="/dashboard/agents"
              className="inline-flex items-center gap-2 rounded-lg bg-kiln-orange px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-kiln-orange/90"
            >
              <Bot className="h-4 w-4" />
              Go to Agent Studio
            </a>
            <span className="text-xs text-muted-foreground">or start from a template</span>
            <div className="flex gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t.id)}
                  disabled={creatingTemplate !== null}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  <t.icon className={cn("h-3.5 w-3.5", t.color)} />
                  {t.name}
                  {creatingTemplate === t.id && <Loader2 className="h-3 w-3 animate-spin" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- Render ---------- */
  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border bg-card/50 px-4 py-2.5 backdrop-blur-sm lg:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-kiln-orange/10">
            <Network className="h-4 w-4 text-kiln-orange" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-sm font-semibold text-foreground leading-tight">Orchestration</h1>
            <p className="text-[10px] text-muted-foreground">
              {agents.length} agent{agents.length !== 1 ? "s" : ""} · {connections.length} connection{connections.length !== 1 ? "s" : ""} · {connections.filter((c) => c.enabled).length} active
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Templates dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted",
                showTemplates ? "bg-muted text-foreground" : "text-muted-foreground"
              )}
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Templates</span>
              <ChevronDown className={cn("h-3 w-3 transition-transform", showTemplates && "rotate-180")} />
            </button>

            {showTemplates && (
              <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-border bg-card p-1.5 shadow-2xl animate-in slide-in-from-top-2 fade-in duration-150">
                <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quick Start Templates</p>
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t.id)}
                    disabled={creatingTemplate !== null}
                    className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    <div className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", t.bg)}>
                      <t.icon className={cn("h-3.5 w-3.5", t.color)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground">{t.name}</p>
                      <p className="text-[10px] text-muted-foreground">{t.description}</p>
                    </div>
                    {creatingTemplate === t.id && <Loader2 className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Analytics toggle */}
          <button
            onClick={() => { setShowAnalytics(!showAnalytics); if (!showAnalytics && !analyticsData) loadAnalytics(); }}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted",
              showAnalytics ? "bg-muted text-foreground" : "text-muted-foreground"
            )}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Analytics</span>
          </button>

          {/* Advanced mode badge */}
          {advancedMode && (
            <span className="flex items-center gap-1 rounded-full bg-purple-500/10 px-2.5 py-1 text-[10px] font-semibold text-purple-400">
              <Sparkles className="h-3 w-3" />
              Advanced
            </span>
          )}
        </div>
      </div>

      {/* Analytics Panel */}
      {showAnalytics && (
        <div className="border-b border-border bg-card/50 px-4 py-4 lg:px-6">
          {analyticsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : analyticsData ? (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-kiln-orange" />
                <h3 className="text-sm font-semibold text-foreground">Orchestration Analytics</h3>
              </div>

              {/* KPI cards */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[10px] font-medium text-muted-foreground">Total Handoffs</p>
                  <p className="mt-1 text-xl font-bold text-foreground">{analyticsData.totalHandoffs}</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[10px] font-medium text-muted-foreground">Last 30 Days</p>
                  <p className="mt-1 text-xl font-bold text-foreground">{analyticsData.handoffsLast30Days}</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[10px] font-medium text-muted-foreground">Active Routes</p>
                  <p className="mt-1 text-xl font-bold text-foreground">{connections.filter((c) => c.enabled).length}</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[10px] font-medium text-muted-foreground">Avg per Conversation</p>
                  <p className="mt-1 text-xl font-bold text-foreground">{analyticsData.avgHandoffsPerConversation}</p>
                </div>
              </div>

              {/* Most active routes */}
              {analyticsData.routes.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Most Active Routes</p>
                  <div className="space-y-1.5">
                    {analyticsData.routes.slice(0, 5).map((route) => (
                      <div key={route.ruleId} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                        <div className="flex items-center gap-1.5 text-xs">
                          <Bot className="h-3.5 w-3.5 text-kiln-orange" />
                          <span className="font-medium text-foreground">{route.sourceName}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <Bot className="h-3.5 w-3.5 text-kiln-orange" />
                          <span className="font-medium text-foreground">{route.targetName}</span>
                        </div>
                        <span className="ml-auto rounded-full bg-kiln-orange/10 px-2 py-0.5 text-[10px] font-semibold text-kiln-orange">
                          {route.count} handoff{route.count !== 1 ? "s" : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analyticsData.totalHandoffs === 0 && (
                <p className="text-center text-xs text-muted-foreground py-2">
                  No handoffs yet. Handoffs happen automatically when orchestration conditions are met during conversations.
                </p>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Canvas */}
      <div className="relative flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
          onPaneClick={() => setSelectedEdge(null)}
          nodeTypes={memoizedNodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          defaultEdgeOptions={{
            type: "smoothstep",
            animated: true,
            style: makeEdgeStyle(true),
            markerEnd: makeEdgeMarker(true),
          }}
          proOptions={{ hideAttribution: true }}
          className="!bg-background"
        >
          <Background color="hsl(0 0% 16%)" gap={20} size={1.2} />
          <Controls
            showInteractive={false}
            className="!rounded-xl !border-border !bg-card/90 !shadow-xl !backdrop-blur-sm [&>button]:!border-border/50 [&>button]:!bg-transparent [&>button]:!text-muted-foreground [&>button:hover]:!bg-muted [&>button:hover]:!text-foreground"
          />
          <MiniMap
            nodeColor={(n) => {
              if (n.type === "agent") {
                const status = (n.data as { status?: string }).status;
                if (status === "LIVE") return "hsl(142, 71%, 45%)";
                if (status === "PAUSED") return "hsl(24, 95%, 53%)";
                return "hsl(0, 0%, 40%)";
              }
              return "hsl(217, 91%, 60%)";
            }}
            maskColor="hsl(12 6% 4% / 0.85)"
            className="!rounded-xl !border-border !bg-card/80 !shadow-lg"
            pannable
            zoomable
          />

          {/* Advanced Mode: Node palette */}
          {advancedMode && (
            <Panel position="top-left" className="!m-3">
              <div className="rounded-xl border border-border bg-card/90 p-2 shadow-xl backdrop-blur-sm">
                <p className="mb-2 px-2 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Add Nodes</p>
                <div className="flex flex-col gap-1">
                  {advancedNodePalette.map((item) => (
                    <button
                      key={item.type}
                      onClick={() => addAdvancedNode(item.type, item.label)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all",
                        item.border
                      )}
                    >
                      <div className={cn("flex h-6 w-6 items-center justify-center rounded-md", item.bg)}>
                        <item.icon className={cn("h-3 w-3", item.color)} />
                      </div>
                      <span className={item.color}>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </Panel>
          )}

          {/* Hint for empty canvas */}
          {connections.length === 0 && agents.length > 0 && (
            <Panel position="bottom-center" className="!mb-6">
              <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card/90 px-5 py-3 shadow-xl backdrop-blur-sm">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-kiln-orange/10">
                  <ArrowRight className="h-3 w-3 text-kiln-orange" />
                </div>
                <span className="text-xs text-muted-foreground">
                  Drag from one agent&apos;s <span className="font-medium text-foreground">handle</span> to another to create a connection
                </span>
              </div>
            </Panel>
          )}
        </ReactFlow>

        {/* Slide-in config panel */}
        {selectedEdge && selectedConn && (
          <div className="slide-panel-enter absolute bottom-0 right-0 top-0 z-10 w-80 border-l border-border bg-card/95 backdrop-blur-md lg:w-96">
            <div className="flex h-full flex-col">
              {/* Panel header */}
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground">Connection Settings</h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleConnection(selectedEdge)}
                    className={cn(
                      "rounded-lg p-1.5 transition-colors",
                      selectedConn.enabled ? "text-kiln-green hover:bg-kiln-green/10" : "text-muted-foreground hover:bg-muted"
                    )}
                    title={selectedConn.enabled ? "Disable" : "Enable"}
                  >
                    {selectedConn.enabled ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => deleteConnection(selectedEdge)}
                    className="rounded-lg p-1.5 text-red-400 transition-colors hover:bg-red-500/10"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setSelectedEdge(null)}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Panel body */}
              <div className="flex-1 overflow-y-auto p-4">
                {/* Source → Target */}
                <div className="mb-5">
                  <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Flow</label>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                      <Bot className="h-3.5 w-3.5 text-kiln-orange" />
                      <span className="text-xs font-medium text-foreground">{selectedConn.sourceAgent.name}</span>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-kiln-orange" />
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                      <Bot className="h-3.5 w-3.5 text-kiln-orange" />
                      <span className="text-xs font-medium text-foreground">{selectedConn.targetAgent.name}</span>
                    </div>
                  </div>
                </div>

                {/* Status + Handoff count */}
                <div className="mb-5">
                  <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</label>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className={cn("h-2 w-2 rounded-full", selectedConn.enabled ? "bg-kiln-green" : "bg-muted-foreground")} />
                      <span className="text-xs text-foreground">{selectedConn.enabled ? "Active" : "Disabled"}</span>
                    </div>
                    {(selectedConn.handoffCount ?? 0) > 0 && (
                      <div className="flex items-center gap-1.5 rounded-full bg-kiln-orange/10 px-2.5 py-0.5">
                        <ArrowRight className="h-3 w-3 text-kiln-orange" />
                        <span className="text-[10px] font-semibold text-kiln-orange">{selectedConn.handoffCount} handoff{selectedConn.handoffCount !== 1 ? "s" : ""}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Condition */}
                <div>
                  <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Handoff Condition
                  </label>
                  <p className="mb-2 text-[10px] text-muted-foreground">
                    Describe in natural language when this handoff should trigger.
                  </p>
                  <textarea
                    value={conditionInput}
                    onChange={(e) => setConditionInput(e.target.value)}
                    placeholder="e.g. When lead score is above 7, hand off to sales..."
                    rows={4}
                    className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/20"
                  />
                  <button
                    onClick={() => updateCondition(selectedEdge, conditionInput)}
                    disabled={saving}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-kiln-orange px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-kiln-orange/90 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Condition
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
