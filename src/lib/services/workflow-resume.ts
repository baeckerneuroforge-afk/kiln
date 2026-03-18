/**
 * Workflow Resume Engine
 * Resumes a paused workflow execution from a specific node.
 * Used by webhook callbacks, form submissions, and manual resume.
 */

import { prisma } from "@/lib/prisma";
import { TeamExecutionStatus } from "@prisma/client";
import { extractWorkflowDefinition } from "@/lib/services/workflow-runtime";
import { executeLogicNode } from "@/lib/workflow-nodes/logic-nodes";
import { executeActionNode } from "@/lib/workflow-nodes/action-nodes";
import { executeControlNode } from "@/lib/workflow-nodes/control-nodes";
import type { ExpressionContext } from "@/lib/workflow-expressions";
import type { WorkflowNode } from "@/lib/workflow-node-types";

const NODE_CATEGORIES: Record<string, string> = {
  trigger_webhook: "trigger", trigger_schedule: "trigger", trigger_lead: "trigger",
  trigger_chat: "trigger", trigger_manual: "trigger", agent: "agent",
  if_condition: "logic", switch: "logic", filter: "logic",
  http_request: "action", send_email: "action", send_slack: "action",
  delay: "action", set_variable: "action", approval_gate: "control",
  wait_webhook: "control", wait_form: "control", sub_workflow: "control", merge: "control",
};

function isErrorEdge(edge: { sourceHandle?: string; condition?: string }): boolean {
  return edge.sourceHandle === "error" || edge.condition === "error";
}

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null));
}

/**
 * Resume workflow execution from a specific node.
 * Finds all successor nodes and continues BFS traversal.
 */
export async function resumeWorkflowFromNode(
  executionId: string,
  teamId: string,
  fromNodeId: string,
  context: ExpressionContext
): Promise<{ status: string; context: ExpressionContext }> {
  const team = await prisma.agentTeam.findUnique({
    where: { id: teamId },
  });
  if (!team) throw new Error("Team not found");

  const workflowDef = extractWorkflowDefinition(team.config);
  if (!workflowDef) throw new Error("No workflow definition found");

  const { nodes, edges } = workflowDef;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Get already-executed nodes
  const logs = await prisma.teamExecutionLog.findMany({
    where: { executionId },
    select: { nodeId: true },
  });
  const executedNodes = new Set(logs.map((l) => l.nodeId).filter(Boolean));
  executedNodes.add(fromNodeId);

  // Find successors of the resumed node
  const successorIds = edges
    .filter((e) => e.sourceId === fromNodeId && !isErrorEdge(e))
    .map((e) => e.targetId);

  if (successorIds.length === 0) {
    await prisma.teamExecution.update({
      where: { id: executionId },
      data: {
        status: TeamExecutionStatus.COMPLETED,
        completedAt: new Date(),
        executionContext: toJsonValue(context),
      },
    });
    return { status: "COMPLETED", context };
  }

  let currentContext = { ...context };
  let completedNodes = 0;
  let failedNodes = 0;
  let paused = false;
  const queue = [...successorIds];

  while (queue.length > 0 && !paused) {
    const currentNodeId = queue.shift()!;
    if (executedNodes.has(currentNodeId)) continue;

    const node = nodeMap.get(currentNodeId);
    if (!node) continue;

    // Check merge prerequisites
    const incomingEdges = edges.filter((e) => e.targetId === currentNodeId);
    const nonErrorIncoming = incomingEdges.filter((e) => !isErrorEdge(e));
    if (node.type === "merge" && nonErrorIncoming.length > 1) {
      const allDone = nonErrorIncoming.every((e) => executedNodes.has(e.sourceId));
      if (!allDone) {
        queue.push(currentNodeId);
        continue;
      }
    }

    const category = NODE_CATEGORIES[node.type] || "unknown";
    const startTime = new Date();

    try {
      if (category === "logic") {
        const result = executeLogicNode(node.type, node.config, currentContext);
        await logNode(teamId, executionId, node, "COMPLETED", startTime, JSON.stringify(result));
        executedNodes.add(currentNodeId);
        completedNodes++;
        const nextIds = edges
          .filter((e) => e.sourceId === node.id && (!result.outputHandle || e.sourceHandle === result.outputHandle) && !isErrorEdge(e))
          .map((e) => e.targetId);
        queue.push(...nextIds);
      } else if (category === "action") {
        const result = await executeActionNode(node.type, node.config, currentContext);
        if (result.success) {
          currentContext = { ...currentContext, ...result.contextDelta };
          await logNode(teamId, executionId, node, "COMPLETED", startTime, JSON.stringify(result.contextDelta), undefined, result.contextDelta);
          executedNodes.add(currentNodeId);
          completedNodes++;
          queue.push(...edges.filter((e) => e.sourceId === node.id && !isErrorEdge(e)).map((e) => e.targetId));
        } else {
          await logNode(teamId, executionId, node, "FAILED", startTime, undefined, result.error);
          executedNodes.add(currentNodeId);
          failedNodes++;
          const errorTargets = edges.filter((e) => e.sourceId === node.id && isErrorEdge(e)).map((e) => e.targetId);
          if (errorTargets.length > 0) {
            currentContext = { ...currentContext, _lastError: { nodeId: node.id, nodeType: node.type, error: result.error } };
            queue.push(...errorTargets);
          }
        }
      } else if (category === "control") {
        const mergeExtra = node.type === "merge" ? {
          branchesCompleted: nonErrorIncoming.filter((e) => executedNodes.has(e.sourceId)).length,
          branchesExpected: nonErrorIncoming.length,
        } : undefined;

        const controlResult = executeControlNode(node.type, node.config, currentContext, mergeExtra);
        currentContext = { ...currentContext, ...controlResult.contextDelta };

        if (controlResult.action === "pause") {
          paused = true;
          await logNode(teamId, executionId, node, "PENDING", startTime, controlResult.pauseReason);
          executedNodes.add(currentNodeId);
        } else {
          const status = controlResult.action === "skip" ? "SKIPPED" : "COMPLETED";
          await logNode(teamId, executionId, node, status, startTime, JSON.stringify(controlResult.contextDelta));
          executedNodes.add(currentNodeId);
          completedNodes++;
          queue.push(...edges.filter((e) => e.sourceId === node.id && !isErrorEdge(e)).map((e) => e.targetId));
        }
      }
      // Note: agent nodes in resumed workflows would need the full team-runtime context
      // For now, skip agent nodes in resume (they should be handled by a full re-execution)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Node execution failed";
      await logNode(teamId, executionId, node, "FAILED", startTime, undefined, errorMsg);
      executedNodes.add(currentNodeId);
      failedNodes++;
      const errorTargets = edges.filter((e) => e.sourceId === node.id && isErrorEdge(e)).map((e) => e.targetId);
      if (errorTargets.length > 0) {
        currentContext = { ...currentContext, _lastError: { nodeId: node.id, nodeType: node.type, error: errorMsg } };
        queue.push(...errorTargets);
      }
    }

    // Update progress
    await prisma.teamExecution.update({
      where: { id: executionId },
      data: {
        executionContext: toJsonValue(currentContext),
      },
    });
  }

  const finalStatus = paused
    ? TeamExecutionStatus.AWAITING_APPROVAL
    : failedNodes > 0 && completedNodes === 0
      ? TeamExecutionStatus.FAILED
      : TeamExecutionStatus.COMPLETED;

  await prisma.teamExecution.update({
    where: { id: executionId },
    data: {
      status: finalStatus,
      completedAt: paused ? undefined : new Date(),
      executionContext: toJsonValue(currentContext),
    },
  });

  return { status: finalStatus, context: currentContext };
}

async function logNode(
  teamId: string,
  executionId: string,
  node: WorkflowNode,
  status: string,
  startedAt: Date,
  output?: string,
  error?: string,
  structuredOutput?: Record<string, unknown>
) {
  await prisma.teamExecutionLog.create({
    data: {
      teamId,
      executionId,
      taskIndex: 0,
      taskTitle: node.label || node.type,
      nodeId: node.id,
      nodeType: node.type,
      status: status as "COMPLETED" | "FAILED" | "SKIPPED" | "PENDING" | "RUNNING",
      startedAt,
      completedAt: new Date(),
      output: output || null,
      error: error || null,
      structuredOutput: structuredOutput ? toJsonValue(structuredOutput) : undefined,
    },
  });
}
