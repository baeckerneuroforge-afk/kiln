/**
 * Workflow Version Control
 * Manages version snapshots, changelogs, diffs, and rollbacks for team workflows.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { WorkflowNode, WorkflowEdge, WorkflowVariable } from "@/lib/workflow-node-types";

type VersioningClient = Prisma.TransactionClient | typeof prisma;

/* ── Snapshot Types ── */

export interface WorkflowVersionConfig {
  name: string;
  goal: string | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: WorkflowVariable[];
  teamConfig: Record<string, unknown>;
}

export interface WorkflowDiffChange {
  type: "added" | "removed" | "changed";
  category: "node" | "edge" | "variable" | "config";
  label: string;
  detail?: string;
}

export interface WorkflowDiff {
  changes: WorkflowDiffChange[];
  summary: string;
  nodesAdded: string[];
  nodesRemoved: string[];
  nodesChanged: string[];
  edgesAdded: Array<{ source: string; target: string }>;
  edgesRemoved: Array<{ source: string; target: string }>;
  variablesAdded: string[];
  variablesRemoved: string[];
  variablesChanged: string[];
}

/* ── Helpers ── */

function normalizeObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeObjectKeys(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeObjectKeys(entry)])
    );
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeObjectKeys(value));
}

/* ── Diff Engine ── */

function getNodeLabel(node: WorkflowNode): string {
  return node.label || node.type;
}

function edgeKey(e: { sourceId: string; targetId: string; sourceHandle?: string }): string {
  return `${e.sourceId}->${e.targetId}${e.sourceHandle ? `:${e.sourceHandle}` : ""}`;
}

export function computeWorkflowDiff(
  prev: WorkflowVersionConfig,
  next: WorkflowVersionConfig
): WorkflowDiff {
  const changes: WorkflowDiffChange[] = [];

  // Name change
  if (prev.name !== next.name) {
    changes.push({
      type: "changed",
      category: "config",
      label: `Renamed workflow from "${prev.name}" to "${next.name}"`,
    });
  }

  // Goal change
  if (prev.goal !== next.goal) {
    changes.push({
      type: "changed",
      category: "config",
      label: "Changed workflow goal",
    });
  }

  // ── Nodes ──
  const prevNodeMap = new Map(prev.nodes.map((n) => [n.id, n]));
  const nextNodeMap = new Map(next.nodes.map((n) => [n.id, n]));

  const nodesAdded: string[] = [];
  const nodesRemoved: string[] = [];
  const nodesChanged: string[] = [];

  next.nodes.forEach((node) => {
    const id = node.id;
    if (!prevNodeMap.has(id)) {
      nodesAdded.push(id);
      changes.push({
        type: "added",
        category: "node",
        label: `Added ${getNodeLabel(node)} node`,
      });
    } else {
      const prevNode = prevNodeMap.get(id)!;
      const configChanged = stableStringify(prevNode.config) !== stableStringify(node.config);
      const labelChanged = prevNode.label !== node.label;
      const typeChanged = prevNode.type !== node.type;

      if (configChanged || labelChanged || typeChanged) {
        nodesChanged.push(id);
        const details: string[] = [];
        if (labelChanged) details.push(`renamed to "${node.label}"`);
        if (typeChanged) details.push(`type changed to ${node.type}`);
        if (configChanged) details.push("config updated");
        changes.push({
          type: "changed",
          category: "node",
          label: `Changed ${getNodeLabel(prevNode)} node`,
          detail: details.join(", "),
        });
      }
    }
  });

  prev.nodes.forEach((node) => {
    if (!nextNodeMap.has(node.id)) {
      nodesRemoved.push(node.id);
      changes.push({
        type: "removed",
        category: "node",
        label: `Removed ${getNodeLabel(node)} node`,
      });
    }
  });

  // ── Edges ──
  const prevEdgeSet = new Set(prev.edges.map(edgeKey));
  const nextEdgeSet = new Set(next.edges.map(edgeKey));

  const edgesAdded: Array<{ source: string; target: string }> = [];
  const edgesRemoved: Array<{ source: string; target: string }> = [];

  for (const edge of next.edges) {
    const k = edgeKey(edge);
    if (!prevEdgeSet.has(k)) {
      edgesAdded.push({ source: edge.sourceId, target: edge.targetId });
      const srcLabel = nextNodeMap.get(edge.sourceId)?.label || edge.sourceId;
      const tgtLabel = nextNodeMap.get(edge.targetId)?.label || edge.targetId;
      changes.push({
        type: "added",
        category: "edge",
        label: `Added connection: ${srcLabel} → ${tgtLabel}`,
      });
    }
  }

  for (const edge of prev.edges) {
    const k = edgeKey(edge);
    if (!nextEdgeSet.has(k)) {
      edgesRemoved.push({ source: edge.sourceId, target: edge.targetId });
      const srcLabel = prevNodeMap.get(edge.sourceId)?.label || edge.sourceId;
      const tgtLabel = prevNodeMap.get(edge.targetId)?.label || edge.targetId;
      changes.push({
        type: "removed",
        category: "edge",
        label: `Removed connection: ${srcLabel} → ${tgtLabel}`,
      });
    }
  }

  // ── Variables ──
  const prevVarMap = new Map((prev.variables || []).map((v) => [v.id, v]));
  const nextVarMap = new Map((next.variables || []).map((v) => [v.id, v]));

  const variablesAdded: string[] = [];
  const variablesRemoved: string[] = [];
  const variablesChanged: string[] = [];

  (next.variables || []).forEach((v) => {
    const id = v.id;
    if (!prevVarMap.has(id)) {
      variablesAdded.push(id);
      changes.push({ type: "added", category: "variable", label: `Added variable "${v.name}"` });
    } else {
      const prevV = prevVarMap.get(id)!;
      if (stableStringify(prevV) !== stableStringify(v)) {
        variablesChanged.push(id);
        changes.push({ type: "changed", category: "variable", label: `Changed variable "${v.name}"` });
      }
    }
  });

  (prev.variables || []).forEach((v) => {
    if (!nextVarMap.has(v.id)) {
      variablesRemoved.push(v.id);
      changes.push({ type: "removed", category: "variable", label: `Removed variable "${v.name}"` });
    }
  });

  // ── Team Config ──
  if (stableStringify(prev.teamConfig) !== stableStringify(next.teamConfig)) {
    changes.push({ type: "changed", category: "config", label: "Updated workflow settings" });
  }

  // Build summary
  const parts: string[] = [];
  if (nodesAdded.length) parts.push(`${nodesAdded.length} node${nodesAdded.length > 1 ? "s" : ""} added`);
  if (nodesRemoved.length) parts.push(`${nodesRemoved.length} node${nodesRemoved.length > 1 ? "s" : ""} removed`);
  if (nodesChanged.length) parts.push(`${nodesChanged.length} node${nodesChanged.length > 1 ? "s" : ""} changed`);
  if (edgesAdded.length) parts.push(`${edgesAdded.length} connection${edgesAdded.length > 1 ? "s" : ""} added`);
  if (edgesRemoved.length) parts.push(`${edgesRemoved.length} connection${edgesRemoved.length > 1 ? "s" : ""} removed`);
  if (variablesAdded.length) parts.push(`${variablesAdded.length} variable${variablesAdded.length > 1 ? "s" : ""} added`);
  if (variablesRemoved.length) parts.push(`${variablesRemoved.length} variable${variablesRemoved.length > 1 ? "s" : ""} removed`);

  const summary = parts.length > 0
    ? parts.join(", ")
    : changes.length > 0
      ? "Configuration updated"
      : "No changes";

  return {
    changes,
    summary,
    nodesAdded,
    nodesRemoved,
    nodesChanged,
    edgesAdded,
    edgesRemoved,
    variablesAdded,
    variablesRemoved,
    variablesChanged,
  };
}

/* ── Snapshot & Restore ── */

export function snapshotWorkflowConfig(team: {
  name: string;
  goal: string | null;
  config: Prisma.JsonValue | null;
}): WorkflowVersionConfig {
  const raw = (team.config && typeof team.config === "object" && !Array.isArray(team.config))
    ? (team.config as Record<string, unknown>)
    : {};

  return {
    name: team.name,
    goal: team.goal,
    nodes: Array.isArray(raw.workflowNodes) ? (raw.workflowNodes as WorkflowNode[]) : [],
    edges: Array.isArray(raw.workflowEdges) ? (raw.workflowEdges as WorkflowEdge[]) : [],
    variables: Array.isArray(raw.variables) ? (raw.variables as WorkflowVariable[]) : [],
    teamConfig: {
      ...(raw.schedule !== undefined ? { schedule: raw.schedule } : {}),
      ...(raw.errorHandler !== undefined ? { errorHandler: raw.errorHandler } : {}),
      ...(raw.positions !== undefined ? { positions: raw.positions } : {}),
    },
  };
}

function parseVersionConfig(raw: Prisma.JsonValue | null | undefined): WorkflowVersionConfig {
  const snapshot = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    name: typeof snapshot.name === "string" ? snapshot.name : "",
    goal: typeof snapshot.goal === "string" ? snapshot.goal : null,
    nodes: Array.isArray(snapshot.nodes) ? (snapshot.nodes as WorkflowNode[]) : [],
    edges: Array.isArray(snapshot.edges) ? (snapshot.edges as WorkflowEdge[]) : [],
    variables: Array.isArray(snapshot.variables) ? (snapshot.variables as WorkflowVariable[]) : [],
    teamConfig: (snapshot.teamConfig && typeof snapshot.teamConfig === "object" && !Array.isArray(snapshot.teamConfig))
      ? (snapshot.teamConfig as Record<string, unknown>)
      : {},
  };
}

/* ── Version Records ── */

async function pruneVersions(client: VersioningClient, teamId: string) {
  const stale = await client.teamVersion.findMany({
    where: { teamId },
    orderBy: { version: "desc" },
    skip: 50,
    select: { id: true },
  });
  if (stale.length === 0) return;
  await client.teamVersion.deleteMany({
    where: { id: { in: stale.map((v) => v.id) } },
  });
}

async function createVersionRecord({
  client,
  teamId,
  userId,
  config,
  changelog,
  note,
}: {
  client: VersioningClient;
  teamId: string;
  userId: string;
  config: WorkflowVersionConfig;
  changelog: string;
  note?: string;
}) {
  const lastVersion = await client.teamVersion.findFirst({
    where: { teamId },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const nextVersion = (lastVersion?.version || 0) + 1;

  const version = await client.teamVersion.create({
    data: {
      teamId,
      version: nextVersion,
      config: config as unknown as Prisma.InputJsonValue,
      changelog,
      note: note || null,
      createdBy: userId,
    },
  });

  await pruneVersions(client, teamId);
  return version;
}

export async function createWorkflowVersion(
  teamId: string,
  userId: string,
  previousConfig: WorkflowVersionConfig,
  newConfig: WorkflowVersionConfig,
  note?: string
) {
  const diff = computeWorkflowDiff(previousConfig, newConfig);
  const changelog = diff.changes.length > 0
    ? diff.changes.slice(0, 5).map((c) => c.label).join("; ") + (diff.changes.length > 5 ? ` +${diff.changes.length - 5} more` : "")
    : "Saved without changes";

  const version = await createVersionRecord({
    client: prisma,
    teamId,
    userId,
    config: previousConfig,
    changelog,
    note,
  });

  return {
    version: version.version,
    currentVersion: version.version + 1,
    changelog,
    diff,
  };
}

export async function createManualWorkflowSnapshot(
  teamId: string,
  userId: string,
  config: WorkflowVersionConfig,
  changelog = "Manual snapshot",
  note?: string
) {
  const version = await createVersionRecord({
    client: prisma,
    teamId,
    userId,
    config,
    changelog,
    note,
  });

  return {
    version: version.version,
    currentVersion: version.version,
    changelog,
  };
}

export async function getWorkflowVersionHistory(teamId: string) {
  return prisma.teamVersion.findMany({
    where: { teamId },
    orderBy: { version: "desc" },
    take: 50,
  });
}

export async function getCurrentWorkflowVersionNumber(
  teamId: string,
  currentConfig: WorkflowVersionConfig
) {
  const latest = await prisma.teamVersion.findFirst({
    where: { teamId },
    orderBy: { version: "desc" },
    select: { version: true, config: true },
  });

  if (!latest) return 1;

  return stableStringify(latest.config) === stableStringify(currentConfig)
    ? latest.version
    : latest.version + 1;
}

export async function getWorkflowVersionConfig(versionId: string) {
  const version = await prisma.teamVersion.findUnique({
    where: { id: versionId },
  });
  if (!version) return null;
  return {
    ...version,
    parsedConfig: parseVersionConfig(version.config as Prisma.JsonValue),
  };
}

export async function rollbackWorkflowToVersion(
  teamId: string,
  versionId: string,
  userId: string
) {
  const [team, version] = await Promise.all([
    prisma.agentTeam.findUnique({ where: { id: teamId } }),
    prisma.teamVersion.findFirst({ where: { id: versionId, teamId } }),
  ]);

  if (!team) throw new Error("Workflow not found");
  if (!version) throw new Error("Version not found");

  const currentConfig = snapshotWorkflowConfig(team);
  const targetConfig = parseVersionConfig(version.config as Prisma.JsonValue);

  return prisma.$transaction(async (tx) => {
    // Save current state first
    const rollbackSnapshot = await createVersionRecord({
      client: tx,
      teamId,
      userId,
      config: currentConfig,
      changelog: `Auto-saved before rollback to v${version.version}`,
    });

    // Restore the target config
    const existingConfig = (team.config && typeof team.config === "object" && !Array.isArray(team.config))
      ? (team.config as Record<string, unknown>)
      : {};

    const restoredConfig = {
      ...existingConfig,
      workflowNodes: targetConfig.nodes,
      workflowEdges: targetConfig.edges,
      variables: targetConfig.variables,
      ...(targetConfig.teamConfig.positions ? { positions: targetConfig.teamConfig.positions } : {}),
      ...(targetConfig.teamConfig.schedule ? { schedule: targetConfig.teamConfig.schedule } : {}),
      ...(targetConfig.teamConfig.errorHandler ? { errorHandler: targetConfig.teamConfig.errorHandler } : {}),
    };

    await tx.agentTeam.update({
      where: { id: teamId },
      data: {
        name: targetConfig.name,
        goal: targetConfig.goal,
        config: JSON.parse(JSON.stringify(restoredConfig)) as Prisma.InputJsonValue,
      },
    });

    return {
      restoredVersion: version.version,
      version: rollbackSnapshot.version,
      currentVersion: rollbackSnapshot.version + 1,
      changelog: rollbackSnapshot.changelog,
    };
  });
}
