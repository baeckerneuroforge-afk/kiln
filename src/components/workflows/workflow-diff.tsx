"use client";

import { useMemo } from "react";
import {
  Plus,
  Minus,
  Edit3,
  GitCompare,
  Variable,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getNodeDefinition,
  type WorkflowNode,
  type WorkflowEdge,
  type WorkflowVariable,
} from "@/lib/workflow-node-types";
import type { WorkflowDiff, WorkflowDiffChange } from "@/lib/workflow-versioning";

/* ── Types ── */

interface WorkflowVersionSnapshot {
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: WorkflowVariable[];
}

/* ── Mini Flow Diagram with Diff Highlights ── */

function DiffFlowDiagram({
  nodes,
  edges,
  highlightAdded,
  highlightRemoved,
  highlightChanged,
}: {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  highlightAdded: Set<string>;
  highlightRemoved: Set<string>;
  highlightChanged: Set<string>;
}) {
  const layout = useMemo(() => {
    if (nodes.length === 0) return { positions: new Map(), width: 200, height: 100 };

    // Simple top-to-bottom layout
    const positions = new Map<string, { x: number; y: number }>();
    const nodeWidth = 120;
    const nodeHeight = 36;
    const gapX = 30;
    const gapY = 50;

    // BFS from nodes with no incoming edges
    const incomingCount = new Map<string, number>();
    const adjacency = new Map<string, string[]>();
    for (const n of nodes) {
      incomingCount.set(n.id, 0);
      adjacency.set(n.id, []);
    }
    for (const e of edges) {
      if (incomingCount.has(e.targetId)) {
        incomingCount.set(e.targetId, (incomingCount.get(e.targetId) || 0) + 1);
      }
      adjacency.get(e.sourceId)?.push(e.targetId);
    }

    const roots = nodes.filter((n) => (incomingCount.get(n.id) || 0) === 0);
    if (roots.length === 0 && nodes.length > 0) roots.push(nodes[0]);

    const visited = new Set<string>();
    const levels: string[][] = [];
    let queue = roots.map((n) => n.id);

    while (queue.length > 0) {
      const level: string[] = [];
      const next: string[] = [];

      for (const id of queue) {
        if (visited.has(id)) continue;
        visited.add(id);
        level.push(id);
        for (const child of adjacency.get(id) || []) {
          if (!visited.has(child)) next.push(child);
        }
      }

      if (level.length > 0) levels.push(level);
      queue = next;
    }

    // Position un-visited nodes
    for (const n of nodes) {
      if (!visited.has(n.id)) {
        levels.push([n.id]);
        visited.add(n.id);
      }
    }

    let maxWidth = 0;
    for (let row = 0; row < levels.length; row++) {
      const cols = levels[row];
      const rowWidth = cols.length * nodeWidth + (cols.length - 1) * gapX;
      maxWidth = Math.max(maxWidth, rowWidth);

      for (let col = 0; col < cols.length; col++) {
        positions.set(cols[col], {
          x: col * (nodeWidth + gapX) + nodeWidth / 2,
          y: row * (nodeHeight + gapY) + nodeHeight / 2 + 10,
        });
      }
    }

    return {
      positions,
      width: Math.max(maxWidth + 40, 200),
      height: levels.length * (nodeHeight + gapY) + 20,
    };
  }, [nodes, edges]);

  const nodeWidth = 120;
  const nodeHeight = 36;

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className="w-full h-auto"
      style={{ maxHeight: 320 }}
    >
      {/* Edges */}
      {edges.map((edge, i) => {
        const from = layout.positions.get(edge.sourceId);
        const to = layout.positions.get(edge.targetId);
        if (!from || !to) return null;

        const isNewEdge = !nodes.some((n) => n.id === edge.sourceId && !highlightAdded.has(n.id));
        const edgeRemoved = highlightRemoved.has(edge.sourceId) || highlightRemoved.has(edge.targetId);

        return (
          <line
            key={`e-${i}`}
            x1={from.x}
            y1={from.y + nodeHeight / 2}
            x2={to.x}
            y2={to.y - nodeHeight / 2}
            stroke={edgeRemoved ? "#ef4444" : isNewEdge ? "#22c55e" : "#3f3f46"}
            strokeWidth={1.5}
            strokeDasharray={edgeRemoved ? "4 3" : isNewEdge ? "4 3" : undefined}
            opacity={edgeRemoved ? 0.5 : 0.8}
          />
        );
      })}

      {/* Nodes */}
      {nodes.map((node) => {
        const pos = layout.positions.get(node.id);
        if (!pos) return null;

        const def = getNodeDefinition(node.type);
        const isAdded = highlightAdded.has(node.id);
        const isRemoved = highlightRemoved.has(node.id);
        const isChanged = highlightChanged.has(node.id);

        let fill = "#18181b";
        let stroke = "#3f3f46";
        let textFill = "#a1a1aa";
        let opacity = 1;

        if (isAdded) {
          fill = "#052e16";
          stroke = "#22c55e";
          textFill = "#86efac";
        } else if (isRemoved) {
          fill = "#450a0a";
          stroke = "#ef4444";
          textFill = "#fca5a5";
          opacity = 0.6;
        } else if (isChanged) {
          fill = "#422006";
          stroke = "#eab308";
          textFill = "#fde047";
        }

        return (
          <g key={node.id} opacity={opacity}>
            <rect
              x={pos.x - nodeWidth / 2}
              y={pos.y - nodeHeight / 2}
              width={nodeWidth}
              height={nodeHeight}
              rx={8}
              fill={fill}
              stroke={stroke}
              strokeWidth={isAdded || isRemoved || isChanged ? 2 : 1}
              strokeDasharray={isRemoved ? "4 3" : undefined}
            />
            {/* Color accent bar */}
            <rect
              x={pos.x - nodeWidth / 2}
              y={pos.y - nodeHeight / 2}
              width={4}
              height={nodeHeight}
              rx={2}
              fill={def?.color || "#71717a"}
            />
            <text
              x={pos.x - nodeWidth / 2 + 12}
              y={pos.y + 1}
              fontSize={9}
              fill={textFill}
              dominantBaseline="middle"
              fontFamily="DM Sans, sans-serif"
            >
              {(node.label || def?.label || node.type).slice(0, 16)}
              {isRemoved ? " ✕" : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Change List Item ── */

const changeIcon: Record<WorkflowDiffChange["type"], React.ElementType> = {
  added: Plus,
  removed: Minus,
  changed: Edit3,
};

const changeColor: Record<WorkflowDiffChange["type"], string> = {
  added: "text-green-400",
  removed: "text-red-400",
  changed: "text-yellow-400",
};

const changeBg: Record<WorkflowDiffChange["type"], string> = {
  added: "bg-green-500/10",
  removed: "bg-red-500/10",
  changed: "bg-yellow-500/10",
};

const categoryIcon: Record<WorkflowDiffChange["category"], React.ElementType> = {
  node: GitCompare,
  edge: Link2,
  variable: Variable,
  config: Edit3,
};

function ChangeItem({ change }: { change: WorkflowDiffChange }) {
  const Icon = changeIcon[change.type];
  const CatIcon = categoryIcon[change.category];

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg px-3 py-2",
        changeBg[change.type]
      )}
    >
      <div className={cn("mt-0.5 flex-shrink-0", changeColor[change.type])}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <CatIcon className="h-3 w-3 text-zinc-500" />
          <span className="text-xs text-zinc-200">{change.label}</span>
        </div>
        {change.detail && (
          <p className="mt-0.5 text-[10px] text-zinc-500">{change.detail}</p>
        )}
      </div>
    </div>
  );
}

/* ── Main Component ── */

export function WorkflowDiffView({
  versionA,
  versionB,
  diff,
  labelA = "Previous",
  labelB = "Current",
}: {
  versionA: WorkflowVersionSnapshot;
  versionB: WorkflowVersionSnapshot;
  diff: WorkflowDiff;
  labelA?: string;
  labelB?: string;
}) {
  const addedSet = new Set(diff.nodesAdded);
  const removedSet = new Set(diff.nodesRemoved);
  const changedSet = new Set(diff.nodesChanged);

  const changesByCategory = useMemo(() => {
    const grouped: Record<string, WorkflowDiffChange[]> = {};
    for (const c of diff.changes) {
      const key = c.category;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(c);
    }
    return grouped;
  }, [diff.changes]);

  if (diff.changes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <GitCompare className="mb-3 h-8 w-8 text-zinc-600" />
        <p className="text-sm text-zinc-400">No differences between these versions</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
        <GitCompare className="h-4 w-4 text-zinc-500" />
        <p className="text-sm text-zinc-300">{diff.summary}</p>
        <span className="ml-auto text-xs text-zinc-600">
          {diff.changes.length} change{diff.changes.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Side-by-side diagrams */}
      <div className="grid grid-cols-2 gap-4">
        {/* Version A */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-400">{labelA}</span>
            <span className="text-[10px] text-zinc-600">{versionA.name}</span>
          </div>
          <div className="rounded-lg border border-zinc-800/50 bg-zinc-950 p-2">
            <DiffFlowDiagram
              nodes={versionA.nodes}
              edges={versionA.edges}
              highlightAdded={new Set()}
              highlightRemoved={removedSet}
              highlightChanged={changedSet}
            />
          </div>
        </div>

        {/* Version B */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-400">{labelB}</span>
            <span className="text-[10px] text-zinc-600">{versionB.name}</span>
          </div>
          <div className="rounded-lg border border-zinc-800/50 bg-zinc-950 p-2">
            <DiffFlowDiagram
              nodes={versionB.nodes}
              edges={versionB.edges}
              highlightAdded={addedSet}
              highlightRemoved={new Set()}
              highlightChanged={changedSet}
            />
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px]">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
          <span className="text-zinc-500">Added</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
          <span className="text-zinc-500">Removed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
          <span className="text-zinc-500">Changed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-5 border border-dashed border-zinc-500 rounded" />
          <span className="text-zinc-500">Dashed = removed/added</span>
        </div>
      </div>

      {/* Change list by category */}
      <div className="space-y-4">
        {Object.entries(changesByCategory).map(([category, changes]) => (
          <div key={category}>
            <h4 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
              {category === "node" ? "Nodes" : category === "edge" ? "Connections" : category === "variable" ? "Variables" : "Configuration"}
            </h4>
            <div className="space-y-1">
              {changes.map((change, i) => (
                <ChangeItem key={i} change={change} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
