"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
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
  useReactFlow,
  ReactFlowProvider,
  BaseEdge,
  EdgeProps,
  getBezierPath,
  EdgeLabelRenderer,
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
  PanelLeftClose,
  PanelLeftOpen,
  GripVertical,
  ZoomIn,
  ZoomOut,
  Maximize2,
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
const statusConfig: Record<string, { dot: string; label: string }> = {
  LIVE: { dot: "bg-kiln-green", label: "Live" },
  DRAFT: { dot: "bg-stone-500", label: "Draft" },
  PAUSED: { dot: "bg-amber-500", label: "Paused" },
};

/* ---------- Custom Node: Agent ---------- */
function AgentNode({ data, selected }: NodeProps) {
  const d = data as { label: string; status: string; description: string; conversations: number };
  const sc = statusConfig[d.status] || statusConfig.DRAFT;
  const isLive = d.status === "LIVE";

  return (
    <div
      className={cn(
        "group relative w-[240px] rounded-xl border border-stone-800 bg-stone-900/80 backdrop-blur-sm transition-all duration-200",
        selected && "ring-1 ring-kiln-orange/40 border-stone-700",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!-left-[4px] !h-2 !w-2 !rounded-full !border-[1.5px] !border-stone-600 !bg-stone-900 opacity-0 transition-opacity group-hover:opacity-100 hover:!border-kiln-orange hover:!bg-stone-800"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!-right-[4px] !h-2 !w-2 !rounded-full !border-[1.5px] !border-stone-600 !bg-stone-900 opacity-0 transition-opacity group-hover:opacity-100 hover:!border-kiln-orange hover:!bg-stone-800"
      />

      <div className="px-3.5 py-3">
        {/* Row 1: Icon + Name */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-kiln-orange/10">
            <Bot className="h-3.5 w-3.5 text-kiln-orange" />
            {isLive && (
              <div className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-stone-900 bg-kiln-green" />
            )}
          </div>
          <p className="truncate text-[13px] font-semibold text-foreground">{d.label}</p>
        </div>

        {/* Row 2: Status */}
        <div className="mt-2 flex items-center gap-1.5">
          <div className={cn("h-1.5 w-1.5 rounded-full", sc.dot)} />
          <span className="text-[10px] font-medium text-muted-foreground">{sc.label}</span>
        </div>

        {/* Row 3: Conversations */}
        <div className="mt-2 flex items-center gap-1.5 border-t border-stone-800/60 pt-2">
          <MessageSquare className="h-3 w-3 text-stone-500" />
          <span className="text-[10px] text-stone-500">{d.conversations} conversations</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Shared advanced node wrapper ---------- */
function AdvancedNodeShell({
  children,
  accentColor,
  selected,
  hasTarget = true,
  hasSource = true,
}: {
  children: React.ReactNode;
  accentColor: string;
  selected?: boolean;
  hasTarget?: boolean;
  hasSource?: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative w-[240px] rounded-xl border border-stone-800 bg-stone-900/80 backdrop-blur-sm transition-all duration-200",
        "border-l-2",
        accentColor,
        selected && "ring-1 ring-white/10 border-stone-700",
      )}
    >
      {hasTarget && (
        <Handle
          type="target"
          position={Position.Left}
          className="!-left-[4px] !h-2 !w-2 !rounded-full !border-[1.5px] !border-stone-600 !bg-stone-900 opacity-0 transition-opacity group-hover:opacity-100"
        />
      )}
      {hasSource && (
        <Handle
          type="source"
          position={Position.Right}
          className="!-right-[4px] !h-2 !w-2 !rounded-full !border-[1.5px] !border-stone-600 !bg-stone-900 opacity-0 transition-opacity group-hover:opacity-100"
        />
      )}
      <div className="px-3.5 py-3">
        {children}
      </div>
    </div>
  );
}

function AdvancedNodeContent({ icon: Icon, label, color }: { icon: React.ElementType; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", color.replace("text-", "bg-").replace(/\/\d+$/, "") + "/10")}>
        <Icon className={cn("h-3.5 w-3.5", color)} />
      </div>
      <span className={cn("text-[13px] font-semibold", color)}>{label}</span>
      <span className="ml-auto rounded bg-stone-800 px-1.5 py-0.5 text-[8px] font-bold text-stone-400">BETA</span>
    </div>
  );
}

function ConditionNode({ data, selected }: NodeProps) {
  const d = data as { label: string; condition: string };
  return (
    <AdvancedNodeShell accentColor="!border-l-blue-500" selected={selected}>
      <AdvancedNodeContent icon={GitBranch} label={d.label} color="text-blue-400" />
      {d.condition && <p className="mt-2 text-[10px] leading-snug text-stone-500">{d.condition}</p>}
    </AdvancedNodeShell>
  );
}

function TriggerNode({ data, selected }: NodeProps) {
  const d = data as { label: string };
  return (
    <AdvancedNodeShell accentColor="!border-l-green-500" selected={selected} hasTarget={false}>
      <AdvancedNodeContent icon={Zap} label={d.label} color="text-green-400" />
    </AdvancedNodeShell>
  );
}

function CodeNode({ data, selected }: NodeProps) {
  const d = data as { label: string };
  return (
    <AdvancedNodeShell accentColor="!border-l-purple-500" selected={selected}>
      <AdvancedNodeContent icon={Code} label={d.label} color="text-purple-400" />
    </AdvancedNodeShell>
  );
}

function HumanHandoffNode({ data, selected }: NodeProps) {
  const d = data as { label: string };
  return (
    <AdvancedNodeShell accentColor="!border-l-red-500" selected={selected} hasSource={false}>
      <AdvancedNodeContent icon={User} label={d.label} color="text-red-400" />
    </AdvancedNodeShell>
  );
}

function RouterNode({ data, selected }: NodeProps) {
  const d = data as { label: string };
  return (
    <AdvancedNodeShell accentColor="!border-l-amber-500" selected={selected}>
      <AdvancedNodeContent icon={Split} label={d.label} color="text-amber-400" />
    </AdvancedNodeShell>
  );
}

/* ---------- Custom animated edge ---------- */
function AnimatedFlowEdge({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
  label,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const isActive = (data as Record<string, unknown>)?.enabled !== false;

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      {isActive && (
        <circle r="2.5" fill="hsl(24, 95%, 53%)" opacity="0.8">
          <animateMotion dur="3s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: "all" }}
            className="nodrag nopan absolute rounded-full border border-stone-700 bg-stone-900/95 px-2 py-0.5 text-[9px] font-medium text-stone-400 backdrop-blur-sm"
          >
            {label as string}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
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

const edgeTypes = {
  animated: AnimatedFlowEdge,
};

/* ---------- Templates ---------- */
const templates = [
  { id: "sales-funnel", name: "Sales Funnel", description: "Lead Qualifier → Sales Closer → Onboarding", icon: Sparkles, color: "text-kiln-orange", bg: "bg-kiln-orange/10" },
  { id: "support-escalation", name: "Support Escalation", description: "L1 Support → L2 Technical → Human Handoff", icon: ArrowRight, color: "text-blue-400", bg: "bg-blue-500/10" },
  { id: "lead-nurture", name: "Lead Nurture", description: "Lead Capture → Lead Scorer → Follow-Up", icon: Zap, color: "text-green-400", bg: "bg-green-500/10" },
];

/* ---------- Advanced node palette ---------- */
const advancedNodePalette = [
  { type: "condition", label: "Condition", desc: "Branch based on rules", icon: GitBranch, color: "text-blue-400", bg: "bg-blue-500/10" },
  { type: "trigger", label: "Trigger", desc: "Start a flow", icon: Zap, color: "text-green-400", bg: "bg-green-500/10" },
  { type: "code", label: "Code", desc: "Run custom logic", icon: Code, color: "text-purple-400", bg: "bg-purple-500/10" },
  { type: "humanHandoff", label: "Human Handoff", desc: "Escalate to human", icon: User, color: "text-red-400", bg: "bg-red-500/10" },
  { type: "router", label: "Router", desc: "Split to multiple paths", icon: Split, color: "text-amber-400", bg: "bg-amber-500/10" },
];

/* ---------- Edge styles ---------- */
function makeEdgeStyle(enabled: boolean) {
  return {
    stroke: enabled ? "hsl(24, 95%, 53%)" : "hsl(0, 0%, 25%)",
    strokeWidth: 1.5,
  };
}

function makeEdgeMarker(enabled: boolean) {
  return { type: MarkerType.ArrowClosed, color: enabled ? "hsl(24, 95%, 53%)" : "hsl(0, 0%, 25%)", width: 14, height: 14 };
}

/* ---------- Zoom controls ---------- */
function ZoomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  return (
    <div className="flex items-center gap-0.5 rounded-full border border-stone-800 bg-stone-900/90 px-1.5 py-1 shadow-lg backdrop-blur-sm">
      <button onClick={() => zoomIn()} className="rounded-full p-1.5 text-stone-500 transition-colors hover:bg-stone-800 hover:text-stone-300" title="Zoom in">
        <ZoomIn className="h-3.5 w-3.5" />
      </button>
      <button onClick={() => zoomOut()} className="rounded-full p-1.5 text-stone-500 transition-colors hover:bg-stone-800 hover:text-stone-300" title="Zoom out">
        <ZoomOut className="h-3.5 w-3.5" />
      </button>
      <div className="mx-0.5 h-4 w-px bg-stone-800" />
      <button onClick={() => fitView({ padding: 0.3, duration: 300 })} className="rounded-full p-1.5 text-stone-500 transition-colors hover:bg-stone-800 hover:text-stone-300" title="Fit view">
        <Maximize2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ---------- Node panel sidebar ---------- */
function NodePanel({
  agents,
  advancedMode,
  onAddAdvancedNode,
}: {
  agents: AgentData[];
  advancedMode: boolean;
  onAddAdvancedNode: (type: string, label: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Collapsed: small toggle button on left edge */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="absolute left-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-stone-800 bg-stone-900/90 text-stone-500 shadow-lg backdrop-blur-sm transition-colors hover:bg-stone-800 hover:text-stone-300"
          title="Open node panel"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}

      {/* Open: overlay panel on top of canvas */}
      <div
        className={cn(
          "absolute left-0 top-0 z-20 flex h-full w-56 flex-col border-r border-stone-800 bg-stone-950/95 backdrop-blur-md shadow-2xl transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header with close button */}
        <div className="flex items-center justify-between border-b border-stone-800 px-3 py-2.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Nodes</span>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md p-1 text-stone-500 transition-colors hover:bg-stone-800 hover:text-stone-300"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

      <div className="flex-1 overflow-y-auto">
        {/* Agent nodes */}
        <div className="px-2 pt-3">
          <p className="mb-2 px-2 text-[9px] font-bold uppercase tracking-widest text-stone-600">Agents</p>
        </div>
        <div className="flex flex-col gap-0.5 px-2">
          {agents.map((agent) => {
            const sc = statusConfig[agent.status] || statusConfig.DRAFT;
            return (
              <div
                key={agent.id}
                className="group flex cursor-default items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-stone-900"
              >
                <GripVertical className="h-3 w-3 shrink-0 text-stone-700 opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-kiln-orange/10">
                  <Bot className="h-3 w-3 text-kiln-orange" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium text-stone-300">{agent.name}</p>
                  <div className="flex items-center gap-1">
                    <div className={cn("h-1 w-1 rounded-full", sc.dot)} />
                    <span className="text-[9px] text-stone-600">{sc.label}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Advanced nodes */}
        {advancedMode && (
          <>
            <div className="px-2 pt-4">
              <div className="mb-2 flex items-center gap-2 px-2">
                <p className="text-[9px] font-bold uppercase tracking-widest text-stone-600">Advanced</p>
                <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[7px] font-bold text-amber-500">BETA</span>
              </div>
            </div>
            <div className="flex flex-col gap-0.5 px-2">
              {advancedNodePalette.map((item) => (
                <button
                  key={item.type}
                  onClick={() => onAddAdvancedNode(item.type, item.label)}
                  className="group flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-stone-900"
                >
                  <GripVertical className="h-3 w-3 shrink-0 text-stone-700 opacity-0 transition-opacity group-hover:opacity-100" />
                  <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", item.bg)}>
                    <item.icon className={cn("h-3 w-3", item.color)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[11px] font-medium", item.color)}>{item.label}</p>
                    <p className="text-[9px] text-stone-600">{item.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      </div>
    </>
  );
}

/* ---------- Inner canvas (needs ReactFlow context) ---------- */
function OrchestrationCanvas() {
  const { toast } = useToast();
  const { advancedMode } = useAdvancedMode();
  const { fitView } = useReactFlow();
  const hintDismissed = useRef(false);

  const [agents, setAgents] = useState<AgentData[]>([]);
  const [connections, setConnections] = useState<OrchConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [conditionInput, setConditionInput] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);

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

    // Auto-layout: arrange agents in a clean horizontal grid
    const cols = Math.min(agents.length, 4);
    const spacingX = 320;
    const spacingY = 180;

    const agentNodes: Node[] = agents.map((agent, i) => ({
      id: agent.id,
      type: "agent",
      position: {
        x: 100 + (i % cols) * spacingX,
        y: 80 + Math.floor(i / cols) * spacingY,
      },
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
        type: "animated",
        style: makeEdgeStyle(conn.enabled),
        markerEnd: makeEdgeMarker(conn.enabled),
        data: { enabled: conn.enabled },
      };
    });

    setNodes(agentNodes);
    setEdges(connectionEdges);

    // Show hint on first visit if no connections
    if (connections.length === 0 && agents.length > 0 && !hintDismissed.current) {
      setShowHint(true);
      const timer = setTimeout(() => setShowHint(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [agents, connections, loading, setNodes, setEdges]);

  // Fit view after nodes are set
  useEffect(() => {
    if (!loading && agents.length > 0) {
      setTimeout(() => fitView({ padding: 0.3, duration: 400 }), 100);
    }
  }, [loading, agents.length, fitView]);

  /* ---------- Create connection ---------- */
  const onConnect = useCallback(
    async (params: Connection) => {
      if (!params.source || !params.target || params.source === params.target) return;

      const tempId = `temp-${Date.now()}`;
      setEdges((eds) =>
        addEdge(
          { ...params, id: tempId, type: "animated", style: makeEdgeStyle(true), markerEnd: makeEdgeMarker(true), data: { enabled: true } },
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
          e.id === edgeId ? { ...e, style: makeEdgeStyle(newEnabled), markerEnd: makeEdgeMarker(newEnabled), data: { enabled: newEnabled } } : e
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
  const memoizedEdgeTypes = useMemo(() => edgeTypes, []);
  const selectedConn = selectedEdge ? connections.find((c) => c.id === selectedEdge) : null;

  /* ---------- Loading ---------- */
  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-stone-800 px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="skeleton h-8 w-8 rounded-lg" />
            <div className="skeleton h-4 w-32 rounded" />
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
          <div className="mx-auto mb-8 flex items-center justify-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-stone-800 bg-stone-900">
              <Bot className="h-6 w-6 text-kiln-orange/60" />
            </div>
            <div className="h-px w-10 bg-gradient-to-r from-kiln-orange/30 to-blue-500/30" />
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-stone-800 bg-stone-900">
              <GitBranch className="h-6 w-6 text-blue-400/60" />
            </div>
            <div className="h-px w-10 bg-gradient-to-r from-blue-500/30 to-green-500/30" />
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-stone-800 bg-stone-900">
              <Bot className="h-6 w-6 text-green-400/60" />
            </div>
          </div>

          <h2 className="text-xl font-semibold text-foreground">Build your first agent team</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-stone-400">
            Create agents in the AI Agent Studio, then connect them here to build multi-agent workflows.
          </p>

          <div className="mt-6 flex flex-col items-center gap-3">
            <a
              href="/dashboard/agents"
              className="inline-flex items-center gap-2 rounded-lg bg-kiln-orange px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-kiln-orange/90"
            >
              <Bot className="h-4 w-4" />
              Go to Agent Studio
            </a>
            <span className="text-xs text-stone-500">or start from a template</span>
            <div className="flex gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t.id)}
                  disabled={creatingTemplate !== null}
                  className="flex items-center gap-1.5 rounded-lg border border-stone-800 px-3 py-2 text-xs font-medium text-stone-400 transition-colors hover:bg-stone-900 hover:text-stone-200 disabled:opacity-50"
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
      <div className="flex items-center justify-between border-b border-stone-800 px-4 py-2 lg:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-kiln-orange/10">
            <Network className="h-3.5 w-3.5 text-kiln-orange" />
          </div>
          <h1 className="text-sm font-semibold text-foreground">Orchestration</h1>
          <span className="hidden text-[11px] text-stone-500 sm:inline">
            {agents.length} agent{agents.length !== 1 ? "s" : ""} · {connections.length} connection{connections.length !== 1 ? "s" : ""} · {connections.filter((c) => c.enabled).length} active
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Templates */}
          <div className="relative">
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                showTemplates ? "bg-stone-800 text-stone-200" : "text-stone-500 hover:bg-stone-900 hover:text-stone-300"
              )}
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Templates</span>
              <ChevronDown className={cn("h-3 w-3 transition-transform", showTemplates && "rotate-180")} />
            </button>

            {showTemplates && (
              <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-stone-800 bg-stone-950 p-1.5 shadow-2xl animate-in slide-in-from-top-2 fade-in duration-150">
                <p className="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-stone-600">Quick Start</p>
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t.id)}
                    disabled={creatingTemplate !== null}
                    className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-stone-900 disabled:opacity-50"
                  >
                    <div className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", t.bg)}>
                      <t.icon className={cn("h-3.5 w-3.5", t.color)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-stone-200">{t.name}</p>
                      <p className="text-[10px] text-stone-500">{t.description}</p>
                    </div>
                    {creatingTemplate === t.id && <Loader2 className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-stone-500" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Analytics */}
          <button
            onClick={() => { setShowAnalytics(!showAnalytics); if (!showAnalytics && !analyticsData) loadAnalytics(); }}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              showAnalytics ? "bg-stone-800 text-stone-200" : "text-stone-500 hover:bg-stone-900 hover:text-stone-300"
            )}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Analytics</span>
          </button>

          {advancedMode && (
            <span className="flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-1 text-[10px] font-semibold text-purple-400">
              <Sparkles className="h-3 w-3" />
              Advanced
            </span>
          )}
        </div>
      </div>

      {/* Analytics Panel */}
      {showAnalytics && (
        <div className="border-b border-stone-800 px-4 py-4 lg:px-6">
          {analyticsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-stone-500" />
            </div>
          ) : analyticsData ? (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-kiln-orange" />
                <h3 className="text-sm font-semibold text-foreground">Analytics</h3>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Total Handoffs", value: analyticsData.totalHandoffs },
                  { label: "Last 30 Days", value: analyticsData.handoffsLast30Days },
                  { label: "Active Routes", value: connections.filter((c) => c.enabled).length },
                  { label: "Avg per Conversation", value: analyticsData.avgHandoffsPerConversation },
                ].map((kpi) => (
                  <div key={kpi.label} className="rounded-lg border border-stone-800 bg-stone-900/50 p-3">
                    <p className="text-[10px] font-medium text-stone-500">{kpi.label}</p>
                    <p className="mt-1 text-xl font-bold text-foreground">{kpi.value}</p>
                  </div>
                ))}
              </div>

              {analyticsData.routes.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-stone-600">Most Active Routes</p>
                  <div className="space-y-1.5">
                    {analyticsData.routes.slice(0, 5).map((route) => (
                      <div key={route.ruleId} className="flex items-center gap-2 rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2">
                        <div className="flex items-center gap-1.5 text-xs">
                          <Bot className="h-3.5 w-3.5 text-kiln-orange" />
                          <span className="font-medium text-stone-200">{route.sourceName}</span>
                          <ArrowRight className="h-3 w-3 text-stone-600" />
                          <Bot className="h-3.5 w-3.5 text-kiln-orange" />
                          <span className="font-medium text-stone-200">{route.targetName}</span>
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
                <p className="text-center text-xs text-stone-500 py-2">No handoffs yet.</p>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Canvas area */}
      <div className="relative flex-1">
        {/* Node panel sidebar */}
        <NodePanel agents={agents} advancedMode={advancedMode} onAddAdvancedNode={addAdvancedNode} />

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
          onPaneClick={() => setSelectedEdge(null)}
          nodeTypes={memoizedNodeTypes}
          edgeTypes={memoizedEdgeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          defaultEdgeOptions={{
            type: "animated",
            style: makeEdgeStyle(true),
            markerEnd: makeEdgeMarker(true),
            data: { enabled: true },
          }}
          proOptions={{ hideAttribution: true }}
          className="!bg-stone-950"
          minZoom={0.2}
          maxZoom={2}
          panOnScroll
        >
          <Background color="rgba(255,255,255,0.08)" gap={24} size={1} />
          <MiniMap
            nodeColor={(n) => {
              if (n.type === "agent") {
                const status = (n.data as { status?: string }).status;
                if (status === "LIVE") return "hsl(142, 71%, 45%)";
                if (status === "PAUSED") return "hsl(35, 95%, 53%)";
                return "hsl(0, 0%, 35%)";
              }
              return "hsl(217, 91%, 55%)";
            }}
            maskColor="rgba(12, 10, 9, 0.88)"
            className="!rounded-xl !border-stone-800 !bg-stone-950/90 !shadow-lg"
            style={{ width: 160, height: 100 }}
            pannable
            zoomable
          />

          {/* Zoom controls — bottom left */}
          <Panel position="bottom-left" className="!m-4">
            <ZoomControls />
          </Panel>

          {/* Tooltip hint — auto-dismiss */}
          {showHint && (
            <Panel position="bottom-center" className="!mb-4">
              <div
                className="flex items-center gap-2 rounded-full border border-stone-800 bg-stone-900/95 px-4 py-2 shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-300 cursor-pointer"
                onClick={() => { setShowHint(false); hintDismissed.current = true; }}
              >
                <ArrowRight className="h-3 w-3 text-kiln-orange" />
                <span className="text-[11px] text-stone-400">
                  Drag from a node handle to create a connection
                </span>
                <X className="h-3 w-3 text-stone-600" />
              </div>
            </Panel>
          )}
        </ReactFlow>

        {/* Connection settings panel */}
        {selectedEdge && selectedConn && (
          <div className="absolute bottom-0 right-0 top-0 z-10 w-80 border-l border-stone-800 bg-stone-950/95 backdrop-blur-md animate-in slide-in-from-right-2 duration-200 lg:w-96">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-stone-800 px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground">Connection</h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleConnection(selectedEdge)}
                    className={cn(
                      "rounded-lg p-1.5 transition-colors",
                      selectedConn.enabled ? "text-kiln-green hover:bg-green-500/10" : "text-stone-500 hover:bg-stone-800"
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
                    className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-800 hover:text-stone-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <div className="mb-5">
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-stone-600">Flow</label>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 rounded-lg border border-stone-800 bg-stone-900 px-3 py-2">
                      <Bot className="h-3.5 w-3.5 text-kiln-orange" />
                      <span className="text-xs font-medium text-stone-200">{selectedConn.sourceAgent.name}</span>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-stone-600" />
                    <div className="flex items-center gap-2 rounded-lg border border-stone-800 bg-stone-900 px-3 py-2">
                      <Bot className="h-3.5 w-3.5 text-kiln-orange" />
                      <span className="text-xs font-medium text-stone-200">{selectedConn.targetAgent.name}</span>
                    </div>
                  </div>
                </div>

                <div className="mb-5">
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-stone-600">Status</label>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className={cn("h-2 w-2 rounded-full", selectedConn.enabled ? "bg-kiln-green" : "bg-stone-600")} />
                      <span className="text-xs text-stone-300">{selectedConn.enabled ? "Active" : "Disabled"}</span>
                    </div>
                    {(selectedConn.handoffCount ?? 0) > 0 && (
                      <span className="rounded-full bg-kiln-orange/10 px-2.5 py-0.5 text-[10px] font-semibold text-kiln-orange">
                        {selectedConn.handoffCount} handoff{selectedConn.handoffCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-stone-600">
                    Handoff Condition
                  </label>
                  <p className="mb-2 text-[10px] text-stone-500">
                    Describe when this handoff should trigger.
                  </p>
                  <textarea
                    value={conditionInput}
                    onChange={(e) => setConditionInput(e.target.value)}
                    placeholder="e.g. When lead score is above 7..."
                    rows={4}
                    className="w-full resize-none rounded-lg border border-stone-800 bg-stone-900 px-3 py-2.5 text-sm text-foreground placeholder:text-stone-600 focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/20"
                  />
                  <button
                    onClick={() => updateCondition(selectedEdge, conditionInput)}
                    disabled={saving}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-kiln-orange px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-kiln-orange/90 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save
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

/* ---------- Main Page (wraps with ReactFlowProvider) ---------- */
export default function OrchestrationPage() {
  return (
    <ReactFlowProvider>
      <OrchestrationCanvas />
    </ReactFlowProvider>
  );
}
