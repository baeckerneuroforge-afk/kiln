"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  ArrowLeft,
  Bot,
  GitBranch,
  Zap,
  Eye,
  Rocket,
  ChevronDown,
  ChevronRight,
  Briefcase,
  Headphones,
  PenTool,
  CalendarDays,
  Wrench,
  Building2,
  GraduationCap,
  CookingPot,
  Lock,
  Variable,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ──────────────────────── Types ──────────────────────── */

type WorkflowNode = {
  id: string;
  type: string;
  label: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
};

type WorkflowEdge = {
  sourceId: string;
  targetId: string;
  condition?: string;
  sourceHandle?: string;
};

type WorkflowVariable = {
  id: string;
  name: string;
  defaultValue: string;
  type: string;
  description: string;
  isSecret: boolean;
};

type TemplateSummary = {
  id: string;
  name: string;
  description: string;
  category: string;
  industry?: string;
  agentCount: number;
  agents: {
    key: string;
    name: string;
    role: string;
    mode: string;
  }[];
  orchestration: {
    mode: string;
    description: string;
    connections: { from: string; to: string; condition: string }[];
  };
  workflow?: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    variables?: WorkflowVariable[];
  };
};

/* ──────────────────────── Visuals ──────────────────────── */

const TEMPLATE_VISUALS: Record<
  string,
  { icon: typeof Briefcase; accent: string; bg: string; border: string }
> = {
  "sales-pipeline": {
    icon: Briefcase,
    accent: "text-gray-400",
    bg: "bg-white/[0.05]",
    border: "border-[#332f2b]",
  },
  "customer-support-tiers": {
    icon: Headphones,
    accent: "text-gray-400",
    bg: "bg-white/[0.05]",
    border: "border-blue-500/25",
  },
  "content-creation-pipeline": {
    icon: PenTool,
    accent: "text-gray-400",
    bg: "bg-white/[0.05]",
    border: "border-emerald-500/25",
  },
  "lead-qualification-booking": {
    icon: CalendarDays,
    accent: "text-gray-400",
    bg: "bg-white/[0.05]",
    border: "border-violet-500/25",
  },
  "shk-betrieb-lead-pipeline": {
    icon: Wrench,
    accent: "text-gray-400",
    bg: "bg-white/[0.05]",
    border: "border-amber-500/25",
  },
  "immobilienmakler-pipeline": {
    icon: Building2,
    accent: "text-gray-400",
    bg: "bg-white/[0.05]",
    border: "border-sky-500/25",
  },
  "coach-erstgespraech-pipeline": {
    icon: GraduationCap,
    accent: "text-gray-400",
    bg: "bg-white/[0.05]",
    border: "border-pink-500/25",
  },
  "kuechenstudio-pipeline": {
    icon: CookingPot,
    accent: "text-gray-400",
    bg: "bg-white/[0.05]",
    border: "border-rose-500/25",
  },
};

const DEFAULT_VISUAL = {
  icon: Zap,
  accent: "text-zinc-400",
  bg: "bg-zinc-500/10",
  border: "border-zinc-500/25",
};

/* ──────────────────────── Helpers ──────────────────────── */

function getTemplateCategory(t: TemplateSummary): string {
  if (
    t.id.includes("sales") ||
    t.id.includes("lead") ||
    t.id.includes("shk") ||
    t.id.includes("immobilien") ||
    t.id.includes("coach") ||
    t.id.includes("kuechenstudio")
  )
    return "Sales";
  if (t.id.includes("support")) return "Support";
  if (t.id.includes("content")) return "Content";
  return "Operations";
}

function getIndustry(t: TemplateSummary): string {
  if (t.industry) return t.industry;
  if (t.id.includes("shk")) return "Handwerk";
  if (t.id.includes("immobilien")) return "Immobilien";
  if (t.id.includes("coach")) return "Beratung";
  if (t.id.includes("kuechenstudio")) return "Handwerk";
  return "All Industries";
}

function getComplexity(t: TemplateSummary): string {
  const nodeCount = t.workflow?.nodes?.length ?? t.agentCount;
  if (nodeCount <= 3) return "Simple";
  if (nodeCount <= 6) return "Medium";
  return "Complex";
}

const NODE_COLORS: Record<string, string> = {
  trigger: "#F59E0B",
  agent: "#F97316",
  logic: "#8B5CF6",
  action: "#3B82F6",
  control: "#06B6D4",
  condition: "#8B5CF6",
  router: "#8B5CF6",
  webhook: "#3B82F6",
  email: "#3B82F6",
  delay: "#06B6D4",
  branch: "#8B5CF6",
};

function getNodeColor(type: string): string {
  const lower = type.toLowerCase();
  for (const [key, color] of Object.entries(NODE_COLORS)) {
    if (lower.includes(key)) return color;
  }
  // Default: agent-orange
  return "#F97316";
}

/* ──────────────────── Mini Flow Diagram ──────────────────── */

function MiniFlowDiagram({
  nodes,
  edges,
  height = 120,
  showLabels = false,
}: {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  height?: number;
  showLabels?: boolean;
}) {
  if (!nodes || nodes.length === 0) return null;

  // Berechne Bounding-Box
  const xs = nodes.map((n) => n.position.x);
  const ys = nodes.map((n) => n.position.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const padding = showLabels ? 60 : 30;
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const viewWidth = 400;
  const viewHeight = height;

  // Skaliere Positionen
  const scale = (node: WorkflowNode) => ({
    x: padding + ((node.position.x - minX) / rangeX) * (viewWidth - padding * 2),
    y: padding + ((node.position.y - minY) / rangeY) * (viewHeight - padding * 2),
  });

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const nodeW = showLabels ? 20 : 12;
  const nodeH = showLabels ? 12 : 8;

  return (
    <svg
      viewBox={`0 0 ${viewWidth} ${viewHeight}`}
      className="w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Edges */}
      {edges.map((edge, i) => {
        const source = nodeMap.get(edge.sourceId);
        const target = nodeMap.get(edge.targetId);
        if (!source || !target) return null;
        const s = scale(source);
        const t = scale(target);
        return (
          <line
            key={`edge-${i}`}
            x1={s.x}
            y1={s.y}
            x2={t.x}
            y2={t.y}
            stroke="#3f3f46"
            strokeWidth={showLabels ? 1.5 : 1}
            strokeOpacity={0.6}
          />
        );
      })}

      {/* Nodes */}
      {nodes.map((node) => {
        const pos = scale(node);
        const color = getNodeColor(node.type);
        return (
          <g key={node.id}>
            <rect
              x={pos.x - nodeW / 2}
              y={pos.y - nodeH / 2}
              width={nodeW}
              height={nodeH}
              rx={3}
              fill={color}
              fillOpacity={0.85}
            />
            {showLabels && (
              <text
                x={pos.x}
                y={pos.y + nodeH / 2 + 12}
                textAnchor="middle"
                fill="#a1a1aa"
                fontSize={8}
                fontFamily="DM Sans, sans-serif"
              >
                {node.label.length > 18
                  ? node.label.slice(0, 16) + "..."
                  : node.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ──────────────────── Preview Modal ──────────────────── */

function PreviewModal({
  template,
  onClose,
}: {
  template: TemplateSummary;
  onClose: () => void;
}) {
  const router = useRouter();
  const visual = TEMPLATE_VISUALS[template.id] ?? DEFAULT_VISUAL;
  const Icon = visual.icon;

  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  const toggleAgent = (key: string) => {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Nicht-Agent-Nodes
  const nonAgentNodes = useMemo(() => {
    if (!template.workflow?.nodes) return [];
    return template.workflow.nodes.filter(
      (n) => !n.type.toLowerCase().includes("agent")
    );
  }, [template.workflow?.nodes]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative mx-4 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Scrollbarer Inhalt */}
        <div className="overflow-y-auto p-8">
          {/* Header */}
          <div className="mb-6 flex items-start gap-4">
            <div
              className={cn(
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border",
                visual.bg,
                visual.border
              )}
            >
              <Icon className={cn("h-7 w-7", visual.accent)} />
            </div>
            <div>
              <h2 className="font-serif text-2xl text-white">{template.name}</h2>
              <p className="mt-1 text-sm text-zinc-400">{template.description}</p>
              <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <Bot className="h-3.5 w-3.5" />
                  {template.agentCount} Agents
                </span>
                <span className="flex items-center gap-1">
                  <GitBranch className="h-3.5 w-3.5" />
                  {template.workflow?.nodes?.length ?? 0} Nodes
                </span>
                <span className="rounded-full bg-zinc-800 px-2 py-0.5">
                  {getTemplateCategory(template)}
                </span>
              </div>
            </div>
          </div>

          {/* Flow Diagramm */}
          {template.workflow?.nodes && template.workflow.nodes.length > 0 && (
            <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <h3 className="mb-3 text-sm font-medium text-zinc-300">
                Workflow-Diagramm
              </h3>
              <MiniFlowDiagram
                nodes={template.workflow.nodes}
                edges={template.workflow.edges ?? []}
                height={300}
                showLabels
              />
            </div>
          )}

          {/* Agents */}
          <div className="mb-6">
            <h3 className="mb-3 text-sm font-medium text-zinc-300">
              Agents ({template.agents.length})
            </h3>
            <div className="space-y-2">
              {template.agents.map((agent) => (
                <div
                  key={agent.key}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/50"
                >
                  <button
                    onClick={() => toggleAgent(agent.key)}
                    className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-zinc-800/50"
                  >
                    {expandedAgents.has(agent.key) ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />
                    )}
                    <Bot className="h-4 w-4 shrink-0 text-gray-400" />
                    <span className="font-medium text-white">{agent.name}</span>
                    <span className="ml-auto rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                      {agent.role}
                    </span>
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">
                      {agent.mode}
                    </span>
                  </button>
                  {expandedAgents.has(agent.key) && (
                    <div className="border-t border-zinc-800 px-3 py-3 pl-11">
                      <p className="text-xs text-zinc-500">
                        Rolle: <span className="text-zinc-400">{agent.role}</span>
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Modus:{" "}
                        <span className="text-zinc-400">{agent.mode}</span>
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Non-Agent Nodes */}
          {nonAgentNodes.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3 text-sm font-medium text-zinc-300">
                Weitere Nodes ({nonAgentNodes.length})
              </h3>
              <div className="space-y-2">
                {nonAgentNodes.map((node) => (
                  <div
                    key={node.id}
                    className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
                  >
                    <div
                      className="h-3 w-3 rounded-sm"
                      style={{ backgroundColor: getNodeColor(node.type) }}
                    />
                    <span className="text-sm font-medium text-white">
                      {node.label}
                    </span>
                    <span className="ml-auto text-xs text-zinc-500">{node.type}</span>
                    {Object.keys(node.config).length > 0 && (
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">
                        {Object.keys(node.config).length} config
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Variables */}
          {template.workflow?.variables && template.workflow.variables.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-300">
                <Variable className="h-4 w-4" />
                Variablen ({template.workflow.variables.length})
              </h3>
              <div className="space-y-2">
                {template.workflow.variables.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
                  >
                    {v.isSecret ? (
                      <Lock className="h-4 w-4 shrink-0 text-gray-400" />
                    ) : (
                      <Variable className="h-4 w-4 shrink-0 text-zinc-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-white">
                        {v.name}
                      </span>
                      {v.description && (
                        <p className="mt-0.5 truncate text-xs text-zinc-500">
                          {v.description}
                        </p>
                      )}
                    </div>
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">
                      {v.type}
                    </span>
                    {v.defaultValue && (
                      <span className="max-w-[120px] truncate rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                        {v.defaultValue}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <Button
            onClick={() =>
              router.push(`/dashboard/teams/new?template=${template.id}`)
            }
            className="w-full bg-kiln-orange text-white hover:bg-kiln-orange/90"
            size="lg"
          >
            <Rocket className="mr-2 h-4 w-4" />
            Deploy This Workflow
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────── Filter Chip ──────────────────── */

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
        active
          ? "border-kiln-orange/50 bg-white/[0.08] text-gray-400"
          : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300"
      )}
    >
      {label}
    </button>
  );
}

/* ──────────────────── Template Card ──────────────────── */

function TemplateCard({
  template,
  onPreview,
}: {
  template: TemplateSummary;
  onPreview: () => void;
}) {
  const router = useRouter();
  const visual = TEMPLATE_VISUALS[template.id] ?? DEFAULT_VISUAL;
  const Icon = visual.icon;
  const industry = getIndustry(template);
  const nodeCount = template.workflow?.nodes?.length ?? 0;

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 transition-all hover:border-zinc-700 hover:bg-zinc-900/80">
      {/* Icon + Name */}
      <div className="flex items-start gap-3 p-5 pb-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
            visual.bg,
            visual.border
          )}
        >
          <Icon className={cn("h-5 w-5", visual.accent)} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-white">{template.name}</h3>
          <p className="mt-0.5 line-clamp-2 text-sm text-zinc-400">
            {template.description}
          </p>
        </div>
      </div>

      {/* Mini Flow Diagram */}
      {template.workflow?.nodes && template.workflow.nodes.length > 0 && (
        <div className="mx-5 rounded-lg border border-zinc-800/50 bg-zinc-950/50 p-2">
          <MiniFlowDiagram
            nodes={template.workflow.nodes}
            edges={template.workflow.edges ?? []}
            height={120}
          />
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-3 px-5 pt-3 text-xs text-zinc-500">
        <span className="flex items-center gap-1">
          <Bot className="h-3.5 w-3.5" />
          {template.agentCount} agents
        </span>
        <span className="flex items-center gap-1">
          <GitBranch className="h-3.5 w-3.5" />
          {nodeCount} nodes
        </span>
        {industry !== "All Industries" && (
          <span className="ml-auto rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-400">
            {industry}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="mt-auto flex gap-2 p-5 pt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={onPreview}
          className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
        >
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          Preview
        </Button>
        <Button
          size="sm"
          onClick={() =>
            router.push(`/dashboard/teams/new?template=${template.id}`)
          }
          className="flex-1 bg-kiln-orange text-white hover:bg-kiln-orange/90"
        >
          <Rocket className="mr-1.5 h-3.5 w-3.5" />
          Deploy
        </Button>
      </div>
    </div>
  );
}

/* ──────────────────── Main Page ──────────────────── */

const CATEGORIES = ["All", "Sales", "Support", "Content", "Operations"];
const INDUSTRIES = [
  "All Industries",
  "Handwerk",
  "Immobilien",
  "Beratung",
  "E-Commerce",
];
const COMPLEXITIES = ["All", "Simple", "Medium", "Complex"];

export default function WorkflowTemplatesPage() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [industryFilter, setIndustryFilter] = useState("All Industries");
  const [complexityFilter, setComplexityFilter] = useState("All");
  const [previewTemplate, setPreviewTemplate] = useState<TemplateSummary | null>(
    null
  );

  // Daten laden
  useEffect(() => {
    async function fetchTemplates() {
      try {
        const res = await fetch("/api/teams/templates");
        if (!res.ok) throw new Error("Fehler beim Laden der Templates");
        const data = await res.json();
        setTemplates(data);
      } catch (err) {
        console.error("Template-Fetch fehlgeschlagen:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchTemplates();
  }, []);

  // Filtern
  const filtered = useMemo(() => {
    return templates.filter((t) => {
      // Search
      if (search) {
        const q = search.toLowerCase();
        if (
          !t.name.toLowerCase().includes(q) &&
          !t.description.toLowerCase().includes(q) &&
          !t.id.toLowerCase().includes(q)
        )
          return false;
      }

      // Category
      if (categoryFilter !== "All" && getTemplateCategory(t) !== categoryFilter)
        return false;

      // Industry
      if (industryFilter !== "All Industries" && getIndustry(t) !== industryFilter)
        return false;

      // Complexity
      if (complexityFilter !== "All" && getComplexity(t) !== complexityFilter)
        return false;

      return true;
    });
  }, [templates, search, categoryFilter, industryFilter, complexityFilter]);

  return (
    <div className="min-h-screen bg-[#1a1918]">
      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/dashboard/teams"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zu Teams
          </Link>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-serif text-4xl text-white">
                Workflow Templates
              </h1>
              <p className="mt-2 max-w-xl text-zinc-400">
                Vorgefertigte Workflows mit mehreren AI-Agents. Wähle ein
                Template, passe es an und starte in Minuten.
              </p>
            </div>
            {/* Search */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Templates durchsuchen..."
                className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 pl-9 pr-4 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-8 space-y-3">
          {/* Category */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-medium uppercase tracking-wider text-zinc-600">
              Kategorie
            </span>
            {CATEGORIES.map((cat) => (
              <FilterChip
                key={cat}
                label={cat}
                active={categoryFilter === cat}
                onClick={() => setCategoryFilter(cat)}
              />
            ))}
          </div>

          {/* Industry */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-medium uppercase tracking-wider text-zinc-600">
              Branche
            </span>
            {INDUSTRIES.map((ind) => (
              <FilterChip
                key={ind}
                label={ind}
                active={industryFilter === ind}
                onClick={() => setIndustryFilter(ind)}
              />
            ))}
          </div>

          {/* Complexity */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-medium uppercase tracking-wider text-zinc-600">
              Komplexität
            </span>
            {COMPLEXITIES.map((c) => (
              <FilterChip
                key={c}
                label={
                  c === "Simple"
                    ? "Simple (≤3)"
                    : c === "Medium"
                      ? "Medium (4-6)"
                      : c === "Complex"
                        ? "Complex (7+)"
                        : c
                }
                active={complexityFilter === c}
                onClick={() => setComplexityFilter(c)}
              />
            ))}
          </div>
        </div>

        {/* Template Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-kiln-orange" />
              <p className="text-sm text-zinc-500">Templates werden geladen...</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-900">
              <Search className="h-7 w-7 text-zinc-600" />
            </div>
            <p className="text-lg font-medium text-white">
              Keine Templates gefunden
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Passe deine Filter an oder ändere den Suchbegriff.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 border-zinc-700 text-zinc-400 hover:text-white"
              onClick={() => {
                setSearch("");
                setCategoryFilter("All");
                setIndustryFilter("All Industries");
                setComplexityFilter("All");
              }}
            >
              Filter zurücksetzen
            </Button>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-zinc-500">
              {filtered.length}{" "}
              {filtered.length === 1 ? "Template" : "Templates"} gefunden
            </p>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onPreview={() => setPreviewTemplate(t)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Preview Modal */}
      {previewTemplate && (
        <PreviewModal
          template={previewTemplate}
          onClose={() => setPreviewTemplate(null)}
        />
      )}
    </div>
  );
}
