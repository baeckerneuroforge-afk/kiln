import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { WorkflowNode } from "@/lib/workflow-node-types";

export interface SubWorkflowGraph {
  [workflowId: string]: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function extractSubWorkflowIdsFromNodes(nodes: Array<Pick<WorkflowNode, "type" | "config">>): string[] {
  const ids = new Set<string>();

  for (const node of nodes) {
    if (node.type !== "sub_workflow") continue;
    const workflowId = node.config?.workflowId;
    if (typeof workflowId === "string" && workflowId.trim()) {
      ids.add(workflowId.trim());
    }
  }

  return Array.from(ids);
}

export function extractSubWorkflowIdsFromConfig(config: unknown): string[] {
  const root = asRecord(config);
  const workflow = asRecord(root?.workflow);
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
  return extractSubWorkflowIdsFromNodes(nodes as WorkflowNode[]);
}

export function hasCyclicSubWorkflowDependency(
  graph: SubWorkflowGraph,
  parentWorkflowId: string,
  childWorkflowIds: string[] = graph[parentWorkflowId] || []
): boolean {
  const queue = [...childWorkflowIds];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === parentWorkflowId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    queue.push(...(graph[current] || []));
  }

  return false;
}

export async function assertNoSubWorkflowCycles(
  parentWorkflowId: string,
  nextChildWorkflowIds: string[]
) {
  const workflows = await prisma.agentTeam.findMany({
    select: { id: true, config: true },
  });

  const graph: SubWorkflowGraph = {};
  for (const workflow of workflows) {
    graph[workflow.id] = extractSubWorkflowIdsFromConfig(workflow.config);
  }
  graph[parentWorkflowId] = nextChildWorkflowIds;

  if (hasCyclicSubWorkflowDependency(graph, parentWorkflowId, nextChildWorkflowIds)) {
    throw new Error("Sub-workflow dependency would create a cycle.");
  }
}

export async function syncParentWorkflowReferences(
  parentWorkflowId: string,
  previousChildWorkflowIds: string[],
  nextChildWorkflowIds: string[]
) {
  const previous = new Set(previousChildWorkflowIds);
  const next = new Set(nextChildWorkflowIds);
  const all = new Set([...previous, ...next]);

  await Promise.all(
    Array.from(all).map(async (childId) => {
      const child = await prisma.agentTeam.findUnique({
        where: { id: childId },
        select: { parentWorkflowIds: true },
      });
      if (!child) return;

      const parents = new Set(child.parentWorkflowIds || []);
      if (next.has(childId)) {
        parents.add(parentWorkflowId);
      } else {
        parents.delete(parentWorkflowId);
      }

      await prisma.agentTeam.update({
        where: { id: childId },
        data: {
          parentWorkflowIds: Array.from(parents),
        },
      });
    })
  );
}

export async function updateSubWorkflowReferencesForConfigChange(params: {
  parentWorkflowId: string;
  previousConfig: unknown;
  nextConfig: unknown;
}) {
  const previousChildIds = extractSubWorkflowIdsFromConfig(params.previousConfig);
  const nextChildIds = extractSubWorkflowIdsFromConfig(params.nextConfig);

  await assertNoSubWorkflowCycles(params.parentWorkflowId, nextChildIds);
  await syncParentWorkflowReferences(
    params.parentWorkflowId,
    previousChildIds,
    nextChildIds
  );
}

export function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
