"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Crown,
  FileText,
  Globe,
  Lightbulb,
  Loader2,
  Package,
  Search,
  Tag,
  User,
  X,
  Calendar,
  Clock,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── Types ── */

type EntityType =
  | "Company"
  | "Person"
  | "Product"
  | "Website"
  | "Price"
  | "Event"
  | "Document"
  | "Insight";

interface EntitySource {
  agentId: string;
  executionId?: string;
  timestamp: string;
}

interface KGEntity {
  id: string;
  type: EntityType;
  name: string;
  properties: Record<string, unknown>;
  sources: EntitySource[];
  createdAt: string;
  updatedAt: string;
}

interface KGRelation {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  type: string;
  properties?: Record<string, unknown>;
}

interface KGEvent {
  id: string;
  entityId: string;
  entityName: string;
  entityType: EntityType;
  eventType: string;
  details: string;
  createdAt: string;
}

interface GraphData {
  entities: KGEntity[];
  relations: KGRelation[];
}

interface EntityDetail {
  entity: KGEntity;
  relations: KGRelation[];
  history: KGEvent[];
}

/* ── Simulated Node for the force layout ── */

interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  entity: KGEntity;
}

/* ── Entity type config ── */

const ENTITY_COLORS: Record<EntityType, string> = {
  Company: "#F97316",
  Person: "#3B82F6",
  Product: "#22C55E",
  Website: "#A855F7",
  Price: "#EAB308",
  Event: "#EC4899",
  Document: "#6B7280",
  Insight: "#14B8A6",
};

const ENTITY_ICONS: Record<EntityType, React.ComponentType<{ className?: string }>> = {
  Company: Building2,
  Person: User,
  Product: Package,
  Website: Globe,
  Price: Tag,
  Event: Calendar,
  Document: FileText,
  Insight: Lightbulb,
};

const ALL_TYPES: EntityType[] = [
  "Company",
  "Person",
  "Product",
  "Website",
  "Price",
  "Event",
  "Document",
  "Insight",
];

/* ── Helpers ── */

function relativeTime(timestamp: string) {
  const ms = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "gerade eben";
  if (mins < 60) return `vor ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours}h`;
  const days = Math.floor(hours / 24);
  return `vor ${days}d`;
}

/* ── Force-directed layout ── */

function initNodes(entities: KGEntity[], width: number, height: number): SimNode[] {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.35;
  return entities.map((entity, i) => {
    const angle = (2 * Math.PI * i) / entities.length;
    return {
      id: entity.id,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      vx: 0,
      vy: 0,
      entity,
    };
  });
}

function simulateForces(
  nodes: SimNode[],
  relations: KGRelation[],
  width: number,
  height: number
) {
  const cx = width / 2;
  const cy = height / 2;
  const damping = 0.85;
  const repulsionStrength = 2000;
  const attractionStrength = 0.005;
  const centerGravity = 0.01;

  // Repulsion zwischen allen Knoten
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[j].x - nodes[i].x;
      const dy = nodes[j].y - nodes[i].y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = repulsionStrength / (dist * dist);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      nodes[i].vx -= fx;
      nodes[i].vy -= fy;
      nodes[j].vx += fx;
      nodes[j].vy += fy;
    }
  }

  // Anziehung entlang der Kanten
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  for (const rel of relations) {
    const a = nodeMap.get(rel.fromEntityId);
    const b = nodeMap.get(rel.toEntityId);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const force = dist * attractionStrength;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  // Schwerkraft zum Zentrum
  for (const node of nodes) {
    node.vx += (cx - node.x) * centerGravity;
    node.vy += (cy - node.y) * centerGravity;
  }

  // Position aktualisieren + Damping
  for (const node of nodes) {
    node.vx *= damping;
    node.vy *= damping;
    node.x += node.vx;
    node.y += node.vy;
    // Boundaries
    node.x = Math.max(30, Math.min(width - 30, node.x));
    node.y = Math.max(30, Math.min(height - 30, node.y));
  }
}

/* ── Component Props ── */

interface KnowledgeGraphViewProps {
  planHasGraph: boolean;
  planHasVisual: boolean;
}

/* ── Main Component ── */

export default function KnowledgeGraphView({
  planHasGraph,
  planHasVisual,
}: KnowledgeGraphViewProps) {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [activeTypes, setActiveTypes] = useState<Set<EntityType>>(
    new Set(ALL_TYPES)
  );

  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [entityDetail, setEntityDetail] = useState<EntityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Debounce-Suche
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  // Daten laden
  useEffect(() => {
    if (!planHasGraph) {
      setLoading(false);
      return;
    }

    async function loadData() {
      setLoading(true);
      try {
        let url: string;
        if (searchQuery) {
          url = `/api/knowledge?q=${encodeURIComponent(searchQuery)}`;
        } else {
          url = `/api/knowledge/entities?limit=100`;
        }
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error("Fehler beim Laden der Daten");
        const data = await response.json();
        setGraphData({
          entities: data.entities || [],
          relations: data.relations || [],
        });
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Fehler beim Laden der Daten"
        );
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [planHasGraph, searchQuery]);

  // Entity-Detail laden
  useEffect(() => {
    if (!selectedEntityId) {
      setEntityDetail(null);
      return;
    }

    async function loadDetail() {
      setDetailLoading(true);
      try {
        const response = await fetch(
          `/api/knowledge/entities/${selectedEntityId}`,
          { cache: "no-store" }
        );
        if (!response.ok) throw new Error("Fehler beim Laden");
        const data = await response.json();
        setEntityDetail(data);
      } catch {
        setEntityDetail(null);
      } finally {
        setDetailLoading(false);
      }
    }

    loadDetail();
  }, [selectedEntityId]);

  // Gefilterte Entities
  const filteredEntities = useMemo(() => {
    if (!graphData) return [];
    return graphData.entities.filter((e) =>
      activeTypes.has(e.type as EntityType)
    );
  }, [graphData, activeTypes]);

  // Gefilterte Relations (nur zwischen sichtbaren Entities)
  const filteredRelations = useMemo(() => {
    if (!graphData) return [];
    const visibleIds = new Set(filteredEntities.map((e) => e.id));
    return graphData.relations.filter(
      (r) => visibleIds.has(r.fromEntityId) && visibleIds.has(r.toEntityId)
    );
  }, [graphData, filteredEntities]);

  function toggleType(type: EntityType) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  // ── Upgrade-Gate ──
  if (!planHasGraph) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-kiln-orange/30 bg-kiln-orange/10 mb-5">
          <Crown className="h-7 w-7 text-kiln-orange" />
        </div>
        <h3 className="font-serif text-xl text-foreground mb-2">
          Knowledge Graph freischalten
        </h3>
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          Der Knowledge Graph sammelt automatisch Wissen aus deinen
          Agent-Gesprächen. Upgrade auf Pro oder höher, um diese Funktion zu
          nutzen.
        </p>
        <Link href="/dashboard/settings">
          <Button className="gap-2">
            <Crown className="h-4 w-4" />
            Upgrade to Pro
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-0">
      {/* Hauptbereich */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Suchleiste */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Entitäten durchsuchen..."
            className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Typ-Filter */}
        <div className="flex flex-wrap gap-2">
          {ALL_TYPES.map((type) => {
            const active = activeTypes.has(type);
            const Icon = ENTITY_ICONS[type];
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                  active
                    ? "border-transparent text-white"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
                style={
                  active
                    ? { backgroundColor: ENTITY_COLORS[type] + "30", color: ENTITY_COLORS[type], borderColor: ENTITY_COLORS[type] + "50" }
                    : undefined
                }
              >
                <Icon className="h-3 w-3" />
                {type}
              </button>
            );
          })}
        </div>

        {/* Lade-Zustand */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Fehler */}
        {error && !loading && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-8 text-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Leerer Zustand */}
        {!loading && !error && filteredEntities.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 border border-border mb-4">
              <Globe className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">
              Dein Knowledge Graph ist noch leer
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              Er füllt sich automatisch wenn deine Agents arbeiten. Sobald Gespräche
              stattfinden, werden Entitäten und Beziehungen hier sichtbar.
            </p>
          </div>
        )}

        {/* Graph oder Liste */}
        {!loading && !error && filteredEntities.length > 0 && (
          <>
            {planHasVisual ? (
              <ForceGraph
                entities={filteredEntities}
                relations={filteredRelations}
                selectedId={selectedEntityId}
                onSelectEntity={setSelectedEntityId}
              />
            ) : (
              <EntityList
                entities={filteredEntities}
                selectedId={selectedEntityId}
                onSelectEntity={setSelectedEntityId}
              />
            )}
          </>
        )}
      </div>

      {/* Detail-Panel */}
      {selectedEntityId && (
        <div className="w-[380px] shrink-0 border-l border-border bg-card ml-0 overflow-y-auto max-h-[calc(100vh-180px)]">
          <EntityDetailPanel
            detail={entityDetail}
            loading={detailLoading}
            onClose={() => setSelectedEntityId(null)}
            allEntities={filteredEntities}
          />
        </div>
      )}
    </div>
  );
}

/* ── Force Graph (SVG) ── */

function ForceGraph({
  entities,
  relations,
  selectedId,
  onSelectEntity,
}: {
  entities: KGEntity[];
  relations: KGRelation[];
  selectedId: string | null;
  onSelectEntity: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const nodesRef = useRef<SimNode[]>([]);
  const [renderTick, setRenderTick] = useState(0);
  const animRef = useRef<number>(0);
  const iterRef = useRef(0);

  // Container-Größe messen
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: Math.max(entry.contentRect.height, 400),
        });
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Simulation initialisieren bei neuen Daten
  useEffect(() => {
    nodesRef.current = initNodes(entities, dimensions.width, dimensions.height);
    iterRef.current = 0;

    function tick() {
      if (iterRef.current > 200) return; // Simulation stoppen nach 200 Iterationen
      simulateForces(
        nodesRef.current,
        relations,
        dimensions.width,
        dimensions.height
      );
      iterRef.current++;
      setRenderTick((t) => t + 1);
      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [entities, relations, dimensions.width, dimensions.height]);

  const nodes = nodesRef.current;
  const nodeMap = useMemo(
    () => new Map(nodes.map((n) => [n.id, n])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, renderTick]
  );

  return (
    <div
      ref={containerRef}
      className="rounded-xl border border-border bg-card overflow-hidden"
      style={{ minHeight: 400, height: "calc(100vh - 340px)" }}
    >
      <svg
        width={dimensions.width}
        height={dimensions.height}
        className="select-none"
      >
        {/* Kanten */}
        {relations.map((rel) => {
          const a = nodeMap.get(rel.fromEntityId);
          const b = nodeMap.get(rel.toEntityId);
          if (!a || !b) return null;
          return (
            <line
              key={rel.id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#3f3f46"
              strokeWidth={1.5}
              strokeOpacity={0.5}
            />
          );
        })}

        {/* Kantenbezeichnungen */}
        {relations.map((rel) => {
          const a = nodeMap.get(rel.fromEntityId);
          const b = nodeMap.get(rel.toEntityId);
          if (!a || !b) return null;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          return (
            <text
              key={`label-${rel.id}`}
              x={mx}
              y={my - 4}
              textAnchor="middle"
              className="fill-zinc-500 text-[9px]"
              style={{ fontFamily: "var(--font-dm-sans)" }}
            >
              {rel.type}
            </text>
          );
        })}

        {/* Knoten */}
        {nodes.map((node) => {
          const color = ENTITY_COLORS[node.entity.type as EntityType] || "#6B7280";
          const isSelected = node.id === selectedId;
          const radius = isSelected ? 22 : 16;
          return (
            <g
              key={node.id}
              onClick={() => onSelectEntity(node.id)}
              className="cursor-pointer"
            >
              {/* Glow bei Selektion */}
              {isSelected && (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={radius + 6}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeOpacity={0.3}
                />
              )}
              <circle
                cx={node.x}
                cy={node.y}
                r={radius}
                fill={color + "20"}
                stroke={color}
                strokeWidth={isSelected ? 2.5 : 1.5}
              />
              {/* Initialen */}
              <text
                x={node.x}
                y={node.y + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fill={color}
                className="text-[10px] font-semibold pointer-events-none"
                style={{ fontFamily: "var(--font-dm-sans)" }}
              >
                {node.entity.name.slice(0, 2).toUpperCase()}
              </text>
              {/* Name unter dem Knoten */}
              <text
                x={node.x}
                y={node.y + radius + 12}
                textAnchor="middle"
                className="fill-zinc-400 text-[10px] pointer-events-none"
                style={{ fontFamily: "var(--font-dm-sans)" }}
              >
                {node.entity.name.length > 14
                  ? node.entity.name.slice(0, 12) + "..."
                  : node.entity.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Entity List (Fallback wenn kein Visual) ── */

function EntityList({
  entities,
  selectedId,
  onSelectEntity,
}: {
  entities: KGEntity[];
  selectedId: string | null;
  onSelectEntity: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
      <div className="grid grid-cols-[auto,1fr,1fr,auto] gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        <span>Typ</span>
        <span>Name</span>
        <span>Aktualisiert</span>
        <span />
      </div>
      {entities.map((entity) => {
        const Icon = ENTITY_ICONS[entity.type as EntityType] || Globe;
        const color = ENTITY_COLORS[entity.type as EntityType] || "#6B7280";
        const isSelected = entity.id === selectedId;
        return (
          <button
            key={entity.id}
            onClick={() => onSelectEntity(entity.id)}
            className={cn(
              "w-full grid grid-cols-[auto,1fr,1fr,auto] gap-4 items-center px-5 py-3.5 text-left transition-colors hover:bg-background/40",
              isSelected && "bg-background/60"
            )}
          >
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: color + "15" }}
            >
              <span style={{ color }}><Icon className="h-4 w-4" /></span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {entity.name}
              </p>
              <p className="text-[11px] text-muted-foreground">{entity.type}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {relativeTime(entity.updatedAt)}
            </p>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        );
      })}
    </div>
  );
}

/* ── Entity Detail Panel ── */

function EntityDetailPanel({
  detail,
  loading,
  onClose,
  allEntities,
}: {
  detail: EntityDetail | null;
  loading: boolean;
  onClose: () => void;
  allEntities: KGEntity[];
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="px-5 py-12 text-center">
        <p className="text-xs text-muted-foreground">
          Details konnten nicht geladen werden.
        </p>
      </div>
    );
  }

  const { entity, relations, history } = detail;
  const color = ENTITY_COLORS[entity.type as EntityType] || "#6B7280";
  const Icon = ENTITY_ICONS[entity.type as EntityType] || Globe;
  const entityMap = new Map(allEntities.map((e) => [e.id, e]));

  const properties = entity.properties || {};
  const sources = entity.sources || [];

  return (
    <div className="divide-y divide-border">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: color + "15" }}
          >
            <span style={{ color }}><Icon className="h-5 w-5" /></span>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {entity.name}
            </h3>
            <p className="text-[11px] text-muted-foreground">{entity.type}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Properties */}
      {Object.keys(properties).length > 0 && (
        <div className="px-5 py-4 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">
            Eigenschaften
          </p>
          {Object.entries(properties).map(([key, value]) => (
            <div key={key} className="flex items-start justify-between gap-3">
              <span className="text-xs text-muted-foreground shrink-0">
                {key}
              </span>
              <span className="text-xs text-foreground text-right truncate">
                {String(value ?? "–")}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Quellen */}
      {sources.length > 0 && (
        <div className="px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">
            Quellen ({sources.length})
          </p>
          <div className="space-y-2">
            {sources.slice(0, 5).map((source, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <Clock className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  Agent {source.agentId.slice(0, 8)}...
                </span>
                <span className="ml-auto shrink-0">
                  {relativeTime(source.timestamp)}
                </span>
              </div>
            ))}
            {sources.length > 5 && (
              <p className="text-[10px] text-muted-foreground">
                +{sources.length - 5} weitere Quellen
              </p>
            )}
          </div>
        </div>
      )}

      {/* Relationen */}
      {relations.length > 0 && (
        <div className="px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">
            Beziehungen ({relations.length})
          </p>
          <div className="space-y-2">
            {relations.map((rel) => {
              const otherId =
                rel.fromEntityId === entity.id
                  ? rel.toEntityId
                  : rel.fromEntityId;
              const otherEntity = entityMap.get(otherId);
              const otherColor = otherEntity
                ? ENTITY_COLORS[otherEntity.type as EntityType] || "#6B7280"
                : "#6B7280";
              return (
                <div
                  key={rel.id}
                  className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-[11px] text-muted-foreground">
                    {rel.type}
                  </span>
                  <span
                    className="ml-auto text-xs font-medium truncate"
                    style={{ color: otherColor }}
                  >
                    {otherEntity?.name || otherId.slice(0, 8)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* History / Timeline */}
      {history.length > 0 && (
        <div className="px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">
            Verlauf
          </p>
          <div className="relative space-y-3 pl-4 before:absolute before:left-[5px] before:top-1 before:bottom-1 before:w-px before:bg-border">
            {history.slice(0, 10).map((event) => (
              <div key={event.id} className="relative">
                <div
                  className="absolute -left-4 top-1.5 h-2 w-2 rounded-full border-2 border-card"
                  style={{
                    backgroundColor:
                      ENTITY_COLORS[event.entityType as EntityType] || "#6B7280",
                  }}
                />
                <p className="text-xs text-foreground">{event.details}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {relativeTime(event.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timestamps */}
      <div className="px-5 py-4 space-y-1">
        <p className="text-[10px] text-muted-foreground">
          Erstellt: {relativeTime(entity.createdAt)}
        </p>
        <p className="text-[10px] text-muted-foreground">
          Aktualisiert: {relativeTime(entity.updatedAt)}
        </p>
      </div>
    </div>
  );
}
