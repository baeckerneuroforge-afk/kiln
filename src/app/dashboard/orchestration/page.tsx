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
  Activity,
  ChevronDown,
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
  sourceAgent: { id: string; name: string; status: string; slug: string };
  targetAgent: { id: string; name: string; status: string; slug: string };
}

/* ---------- Status helpers ---------- */
const statusDot: Record<string, string> = {
  LIVE: "bg-kiln-green",
  DRAFT: "bg-muted-foreground",
  PAUSED: "bg-kiln-orange",
};

/* ---------- Custom Node: Agent ---------- */
function AgentNode({ data }: NodeProps) {
  const d = data as { label: string; status: string; description: string; conversations: number };
  return (
    <div className="group relative min-w-[200px] rounded-xl border border-border bg-card p-4 shadow-lg transition-shadow hover:shadow-xl">
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-kiln-orange !bg-background" />
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-kiln-orange !bg-background" />
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-kiln-orange/15">
          <Bot className="h-4 w-4 text-kiln-orange" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{d.label}</p>
          <div className="flex items-center gap-1.5">
            <div className={cn("h-1.5 w-1.5 rounded-full", statusDot[d.status] || "bg-muted-foreground")} />
            <span className="text-[10px] text-muted-foreground">{d.status}</span>
          </div>
        </div>
      </div>
      {d.description && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{d.description}</p>
      )}
      {d.conversations > 0 && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
          <Activity className="h-3 w-3" />
          {d.conversations} conversations
        </div>
      )}
    </div>
  );
}

/* ---------- Custom Node: Condition ---------- */
function ConditionNode({ data }: NodeProps) {
  const d = data as { label: string; condition: string };
  return (
    <div className="min-w-[160px] rounded-lg border border-kiln-blue/30 bg-kiln-blue/5 p-3 shadow-md">
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-kiln-blue !bg-background" />
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-kiln-blue !bg-background" />
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-kiln-blue" />
        <span className="text-xs font-medium text-kiln-blue">{d.label}</span>
      </div>
      {d.condition && (
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{d.condition}</p>
      )}
    </div>
  );
}

/* ---------- Custom Node: Trigger ---------- */
function TriggerNode({ data }: NodeProps) {
  const d = data as { label: string };
  return (
    <div className="min-w-[140px] rounded-lg border border-kiln-green/30 bg-kiln-green/5 p-3 shadow-md">
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-kiln-green !bg-background" />
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-kiln-green" />
        <span className="text-xs font-medium text-kiln-green">{d.label}</span>
      </div>
    </div>
  );
}

/* ---------- Custom Node: Code ---------- */
function CodeNode({ data }: NodeProps) {
  const d = data as { label: string };
  return (
    <div className="min-w-[140px] rounded-lg border border-purple-500/30 bg-purple-500/5 p-3 shadow-md">
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-purple-500 !bg-background" />
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-purple-500 !bg-background" />
      <div className="flex items-center gap-2">
        <Code className="h-4 w-4 text-purple-400" />
        <span className="text-xs font-medium text-purple-400">{d.label}</span>
      </div>
    </div>
  );
}

/* ---------- Custom Node: Human Handoff ---------- */
function HumanHandoffNode({ data }: NodeProps) {
  const d = data as { label: string };
  return (
    <div className="min-w-[140px] rounded-lg border border-kiln-ember/30 bg-kiln-ember/5 p-3 shadow-md">
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-kiln-ember !bg-background" />
      <div className="flex items-center gap-2">
        <User className="h-4 w-4 text-kiln-ember" />
        <span className="text-xs font-medium text-kiln-ember">{d.label}</span>
      </div>
    </div>
  );
}

/* ---------- Custom Node: Router ---------- */
function RouterNode({ data }: NodeProps) {
  const d = data as { label: string };
  return (
    <div className="min-w-[140px] rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 shadow-md">
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-amber-500 !bg-background" />
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-amber-500 !bg-background" />
      <div className="flex items-center gap-2">
        <Network className="h-4 w-4 text-amber-400" />
        <span className="text-xs font-medium text-amber-400">{d.label}</span>
      </div>
    </div>
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
  {
    id: "sales-funnel",
    name: "Sales Funnel",
    description: "Lead Qualifier → Sales Closer → Onboarding",
    icon: Sparkles,
    color: "text-kiln-orange",
  },
  {
    id: "support-escalation",
    name: "Support Escalation",
    description: "L1 Support → L2 Technical → Human Handoff",
    icon: ArrowRight,
    color: "text-kiln-blue",
  },
  {
    id: "lead-nurture",
    name: "Lead Nurture",
    description: "Lead Capture → Lead Scorer → Follow-Up",
    icon: Zap,
    color: "text-kiln-green",
  },
];

/* ---------- Advanced node palette ---------- */
const advancedNodePalette = [
  { type: "condition", label: "Condition", icon: GitBranch, color: "text-kiln-blue border-kiln-blue/30" },
  { type: "trigger", label: "Trigger", icon: Zap, color: "text-kiln-green border-kiln-green/30" },
  { type: "code", label: "Code", icon: Code, color: "text-purple-400 border-purple-500/30" },
  { type: "humanHandoff", label: "Human Handoff", icon: User, color: "text-kiln-ember border-kiln-ember/30" },
  { type: "router", label: "Router", icon: Network, color: "text-amber-400 border-amber-500/30" },
];

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

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ---------- Build nodes & edges from data ---------- */
  useEffect(() => {
    if (loading) return;

    // Position agents in a grid
    const agentNodes: Node[] = agents.map((agent, i) => ({
      id: agent.id,
      type: "agent",
      position: { x: 100 + (i % 3) * 320, y: 100 + Math.floor(i / 3) * 200 },
      data: {
        label: agent.name,
        status: agent.status,
        description: agent.description || "",
        conversations: agent._count?.conversations || 0,
      },
    }));

    const connectionEdges: Edge[] = connections.map((conn) => ({
      id: conn.id,
      source: conn.sourceAgentId,
      target: conn.targetAgentId,
      label: conn.condition || undefined,
      type: "smoothstep",
      animated: conn.enabled,
      style: { stroke: conn.enabled ? "hsl(24, 95%, 53%)" : "hsl(0, 0%, 30%)", strokeWidth: 2 },
      labelStyle: { fill: "hsl(0, 0%, 64%)", fontSize: 11 },
      labelBgStyle: { fill: "hsl(12, 6%, 7%)", fillOpacity: 0.9 },
      labelBgPadding: [6, 4] as [number, number],
      labelBgBorderRadius: 4,
      markerEnd: { type: MarkerType.ArrowClosed, color: conn.enabled ? "hsl(24, 95%, 53%)" : "hsl(0, 0%, 30%)" },
    }));

    setNodes(agentNodes);
    setEdges(connectionEdges);
  }, [agents, connections, loading, setNodes, setEdges]);

  /* ---------- Create connection on edge connect ---------- */
  const onConnect = useCallback(
    async (params: Connection) => {
      if (!params.source || !params.target || params.source === params.target) return;

      // Optimistically add edge
      const tempId = `temp-${Date.now()}`;
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            id: tempId,
            type: "smoothstep",
            animated: true,
            style: { stroke: "hsl(24, 95%, 53%)", strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(24, 95%, 53%)" },
          },
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

        // Replace temp edge with real one
        setEdges((eds) =>
          eds.map((e) =>
            e.id === tempId
              ? {
                  ...e,
                  id: data.id,
                  label: data.condition || undefined,
                }
              : e
          )
        );
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
      // Skip temp edges
      if (edgeId.startsWith("temp-")) return;

      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      setSelectedEdge(null);

      try {
        const res = await fetch("/api/orchestration", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: edgeId }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setConnections((prev) => prev.filter((c) => c.id !== edgeId));
        toast("Connection deleted");
      } catch {
        loadData(); // Reload on failure
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
        const res = await fetch("/api/orchestration", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: edgeId, condition }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setEdges((eds) =>
          eds.map((e) => (e.id === edgeId ? { ...e, label: condition || undefined } : e))
        );
        setConnections((prev) =>
          prev.map((c) => (c.id === edgeId ? { ...c, condition } : c))
        );
        toast("Condition updated");
      } catch {
        toast("Failed to update condition", "error");
      } finally {
        setSaving(false);
      }
    },
    [setEdges, toast]
  );

  /* ---------- Toggle connection enabled ---------- */
  const toggleConnection = useCallback(
    async (edgeId: string) => {
      const conn = connections.find((c) => c.id === edgeId);
      if (!conn) return;
      const newEnabled = !conn.enabled;

      setEdges((eds) =>
        eds.map((e) =>
          e.id === edgeId
            ? {
                ...e,
                animated: newEnabled,
                style: {
                  stroke: newEnabled ? "hsl(24, 95%, 53%)" : "hsl(0, 0%, 30%)",
                  strokeWidth: 2,
                },
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  color: newEnabled ? "hsl(24, 95%, 53%)" : "hsl(0, 0%, 30%)",
                },
              }
            : e
        )
      );

      try {
        await fetch("/api/orchestration", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: edgeId, enabled: newEnabled }),
        });
        setConnections((prev) =>
          prev.map((c) => (c.id === edgeId ? { ...c, enabled: newEnabled } : c))
        );
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
        const res = await fetch("/api/orchestration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template: templateId }),
        });
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

  /* ---------- Edge click handler ---------- */
  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setSelectedEdge(edge.id);
      const conn = connections.find((c) => c.id === edge.id);
      setConditionInput(conn?.condition || "");
    },
    [connections]
  );

  /* ---------- Add advanced node ---------- */
  const addAdvancedNode = useCallback(
    (type: string, label: string) => {
      const id = `${type}-${Date.now()}`;
      const newNode: Node = {
        id,
        type,
        position: { x: 300 + Math.random() * 200, y: 200 + Math.random() * 200 },
        data: { label, condition: "" },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes]
  );

  /* ---------- Memoize node types to avoid re-renders ---------- */
  const memoizedNodeTypes = useMemo(() => nodeTypes, []);

  // Selected connection info
  const selectedConn = selectedEdge ? connections.find((c) => c.id === selectedEdge) : null;

  /* ---------- Loading state ---------- */
  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="skeleton h-8 w-8 rounded-lg" />
            <div className="skeleton h-5 w-40 rounded" />
          </div>
          <div className="flex gap-2">
            <div className="skeleton h-9 w-28 rounded-lg" />
            <div className="skeleton h-9 w-28 rounded-lg" />
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
        <div className="max-w-md text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-kiln-orange/10">
            <Network className="h-10 w-10 text-kiln-orange" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">No agents yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create your first agents in the AI Agent Studio, then connect them here to build
            powerful multi-agent workflows.
          </p>
          <a
            href="/dashboard/agents"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-kiln-orange px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-kiln-orange/90"
          >
            <Bot className="h-4 w-4" />
            Go to Agent Studio
          </a>
        </div>
      </div>
    );
  }

  /* ---------- Render ---------- */
  return (
    <div className="flex h-full flex-col">
      {/* Header / Status Bar */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-kiln-orange/15">
            <Network className="h-4 w-4 text-kiln-orange" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">Orchestration</h1>
            <p className="text-xs text-muted-foreground">
              {agents.length} agent{agents.length !== 1 ? "s" : ""} · {connections.length} connection{connections.length !== 1 ? "s" : ""} ·{" "}
              {connections.filter((c) => c.enabled).length} active
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Templates dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LayoutTemplate className="h-4 w-4" />
              Templates
              <ChevronDown className={cn("h-3 w-3 transition-transform", showTemplates && "rotate-180")} />
            </button>

            {showTemplates && (
              <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-border bg-card p-2 shadow-xl animate-in slide-in-from-top-2 fade-in duration-150">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t.id)}
                    disabled={creatingTemplate !== null}
                    className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    <t.icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.color)} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.description}</p>
                    </div>
                    {creatingTemplate === t.id && (
                      <Loader2 className="ml-auto h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Advanced mode indicator */}
          {advancedMode && (
            <span className="flex items-center gap-1.5 rounded-full bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-400">
              <Sparkles className="h-3 w-3" />
              Advanced
            </span>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="relative flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
          nodeTypes={memoizedNodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          defaultEdgeOptions={{
            type: "smoothstep",
            animated: true,
            style: { stroke: "hsl(24, 95%, 53%)", strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(24, 95%, 53%)" },
          }}
          proOptions={{ hideAttribution: true }}
          className="!bg-background"
        >
          <Background color="hsl(0 0% 20%)" gap={24} size={1} />
          <Controls
            className="!rounded-lg !border-border !bg-card !shadow-lg [&>button]:!border-border [&>button]:!bg-card [&>button]:!text-muted-foreground [&>button:hover]:!bg-muted [&>button:hover]:!text-foreground"
          />
          <MiniMap
            nodeColor={() => "hsl(24, 95%, 53%)"}
            maskColor="hsl(12 6% 4% / 0.8)"
            className="!rounded-lg !border-border !bg-card/80"
          />

          {/* Advanced Mode: Node palette */}
          {advancedMode && (
            <Panel position="top-left" className="!m-3">
              <div className="rounded-xl border border-border bg-card p-2 shadow-lg">
                <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Add Nodes
                </p>
                <div className="flex flex-col gap-1">
                  {advancedNodePalette.map((item) => (
                    <button
                      key={item.type}
                      onClick={() => addAdvancedNode(item.type, item.label)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted",
                        item.color
                      )}
                    >
                      <item.icon className="h-3.5 w-3.5" />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </Panel>
          )}

          {/* Instructions hint */}
          {connections.length === 0 && agents.length > 0 && (
            <Panel position="bottom-center" className="!mb-6">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card/90 px-4 py-2.5 shadow-lg backdrop-blur-sm">
                <ArrowRight className="h-4 w-4 text-kiln-orange" />
                <span className="text-xs text-muted-foreground">
                  Drag from one agent&apos;s handle to another to create a connection
                </span>
              </div>
            </Panel>
          )}
        </ReactFlow>

        {/* Edge detail panel */}
        {selectedEdge && selectedConn && (
          <div className="absolute bottom-4 right-4 z-10 w-80 rounded-xl border border-border bg-card p-4 shadow-xl animate-in slide-in-from-right-4 fade-in duration-200">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Connection</h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleConnection(selectedEdge)}
                  className={cn(
                    "rounded-md p-1.5 transition-colors",
                    selectedConn.enabled
                      ? "text-kiln-green hover:bg-kiln-green/10"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                  title={selectedConn.enabled ? "Pause connection" : "Enable connection"}
                >
                  {selectedConn.enabled ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => deleteConnection(selectedEdge)}
                  className="rounded-md p-1.5 text-red-400 transition-colors hover:bg-red-500/10"
                  title="Delete connection"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded bg-muted px-2 py-1 font-medium text-foreground">
                {selectedConn.sourceAgent.name}
              </span>
              <ArrowRight className="h-3 w-3 shrink-0 text-kiln-orange" />
              <span className="rounded bg-muted px-2 py-1 font-medium text-foreground">
                {selectedConn.targetAgent.name}
              </span>
            </div>

            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Handoff Condition (natural language)
            </label>
            <textarea
              value={conditionInput}
              onChange={(e) => setConditionInput(e.target.value)}
              placeholder="e.g. When lead score is above 7, hand off to sales..."
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/30"
            />
            <button
              onClick={() => updateCondition(selectedEdge, conditionInput)}
              disabled={saving}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-kiln-orange px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-kiln-orange/90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Condition
            </button>

            <button
              onClick={() => setSelectedEdge(null)}
              className="mt-2 w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
