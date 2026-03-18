/**
 * Workflow Runtime Engine
 * Führt Workflows aus, die aus beliebigen Node-Typen bestehen (nicht nur Agent-Nodes).
 * Traversiert den DAG von Trigger → Logic/Action/Agent/Control → Ende.
 *
 * Rückwärtskompatibel: Workflows mit nur Agent-Nodes verhalten sich
 * identisch zum bestehenden team-runtime.ts.
 */

import {
  Prisma,
  TeamExecutionStatus,
  TeamExecutionTaskStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitEvent } from "@/lib/events";
import type { WorkflowNode, WorkflowEdge, WorkflowNodeType } from "@/lib/workflow-node-types";
import type { ExpressionContext } from "@/lib/workflow-expressions";

import { executeTriggerNode } from "@/lib/workflow-nodes/trigger-nodes";
import { executeLogicNode } from "@/lib/workflow-nodes/logic-nodes";
import { executeActionNode } from "@/lib/workflow-nodes/action-nodes";
import {
  executeControlNode,
  type ControlNodeResult,
} from "@/lib/workflow-nodes/control-nodes";
import {
  buildAgentTaskFromContext,
  mapAgentResultToContext,
} from "@/lib/workflow-nodes/agent-nodes";
import {
  executeTeamExecution,
  loadTeamExecutionRuntimeContext,
  type TeamSharedContext,
  type TeamExecutionTaskInput,
} from "@/lib/services/team-runtime";

/* ── Types ── */

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowExecutionOptions {
  teamId: string;
  userId: string;
  triggerNodeId?: string; // Welcher Trigger hat gefeuert
  triggerPayload?: Record<string, unknown>;
  goal?: string;
}

interface NodeExecutionLog {
  nodeId: string;
  nodeType: WorkflowNodeType;
  status: "completed" | "failed" | "skipped" | "paused";
  output?: string;
  contextDelta: Record<string, unknown>;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  meta?: Record<string, unknown>;
}

const NODE_CATEGORIES: Record<string, string> = {
  trigger_webhook: "trigger",
  trigger_schedule: "trigger",
  trigger_lead: "trigger",
  trigger_chat: "trigger",
  trigger_manual: "trigger",
  agent: "agent",
  if_condition: "logic",
  switch: "logic",
  filter: "logic",
  http_request: "action",
  send_email: "action",
  send_slack: "action",
  delay: "action",
  set_variable: "action",
  approval_gate: "control",
  wait_webhook: "control",
  sub_workflow: "control",
  merge: "control",
};

function getNodeCategory(type: WorkflowNodeType): string {
  return NODE_CATEGORIES[type] || "unknown";
}

/* ── Workflow Graph Helpers ── */

/** Finde alle Trigger-Nodes im Workflow */
function findTriggerNodes(nodes: WorkflowNode[]): WorkflowNode[] {
  return nodes.filter((n) => n.type.startsWith("trigger_"));
}

/** Finde alle Nachfolger-Nodes (Edges die von sourceId ausgehen) */
function getSuccessors(
  nodeId: string,
  edges: WorkflowEdge[],
  handleFilter?: string
): string[] {
  return edges
    .filter((e) => {
      if (e.sourceId !== nodeId) return false;
      if (handleFilter !== undefined && e.sourceHandle && e.sourceHandle !== handleFilter) {
        return false;
      }
      return true;
    })
    .map((e) => e.targetId);
}

/** Finde alle eingehenden Edges zu einem Node */
function getIncomingEdges(nodeId: string, edges: WorkflowEdge[]): WorkflowEdge[] {
  return edges.filter((e) => e.targetId === nodeId);
}

/** Prüfe ob eine Edge als Error-Pfad markiert ist */
function isErrorEdge(edge: WorkflowEdge): boolean {
  return edge.sourceHandle === "error" || edge.condition === "error";
}

/** Finde Error-Nachfolger für einen Node */
function getErrorSuccessors(nodeId: string, edges: WorkflowEdge[]): string[] {
  return edges
    .filter((e) => e.sourceId === nodeId && isErrorEdge(e))
    .map((e) => e.targetId);
}

/** Finde Nicht-Error-Nachfolger für einen Node */
function getNormalSuccessors(nodeId: string, edges: WorkflowEdge[]): string[] {
  return edges
    .filter((e) => e.sourceId === nodeId && !isErrorEdge(e))
    .map((e) => e.targetId);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

/* ── Workflow Extraction ── */

/**
 * Extrahiert die Workflow-Definition aus der Team-Config.
 * Teams speichern ihre Workflow-Nodes und Edges in config.workflow.
 */
export function extractWorkflowDefinition(
  config: unknown
): WorkflowDefinition | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }

  const c = config as Record<string, unknown>;
  const workflow = c.workflow as Record<string, unknown> | undefined;
  if (!workflow) return null;

  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const edges = Array.isArray(workflow.edges) ? workflow.edges : [];

  if (nodes.length === 0) return null;

  return {
    nodes: nodes as WorkflowNode[],
    edges: edges as WorkflowEdge[],
  };
}

/**
 * Prüft ob ein Team einen Workflow hat (vs. nur Agent-basierte Execution).
 */
export function isWorkflowTeam(config: unknown): boolean {
  const def = extractWorkflowDefinition(config);
  if (!def) return false;
  // Ein Team mit Workflow hat mindestens einen Nicht-Agent-Node
  return def.nodes.some((n) => n.type !== "agent");
}

/* ── Main Workflow Executor ── */

/**
 * Führt einen kompletten Workflow aus.
 * Traversiert den DAG von Trigger-Node → Ende, führt jeden Node-Typ aus.
 */
export async function executeWorkflow(
  options: WorkflowExecutionOptions
): Promise<{ executionId: string; status: string; context: ExpressionContext }> {
  const { teamId, userId, triggerPayload, goal } = options;

  // Lade Team
  const team = await loadTeamExecutionRuntimeContext(teamId, userId);
  if (!team) {
    throw new Error("Team nicht gefunden oder kein Zugriff");
  }

  const workflowDef = extractWorkflowDefinition(team.config);

  // Fallback: Wenn kein Workflow definiert ist, nutze das bestehende Team-Runtime
  if (!workflowDef) {
    return executeAgentOnlyTeam(team, userId, goal || team.goal || "");
  }

  const { nodes, edges } = workflowDef;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Finde den aktiven Trigger
  let triggerNode: WorkflowNode | undefined;
  if (options.triggerNodeId) {
    triggerNode = nodeMap.get(options.triggerNodeId);
  }
  if (!triggerNode) {
    const triggers = findTriggerNodes(nodes);
    triggerNode = triggers[0]; // Fallback zum ersten Trigger
  }

  // Erstelle Execution-Record
  const execution = await prisma.teamExecution.create({
    data: {
      teamId,
      userId,
      goal: goal || team.goal || "Workflow Execution",
      status: TeamExecutionStatus.RUNNING,
      startedAt: new Date(),
      taskPlan: toJsonValue(
        nodes.map((n) => ({
          nodeId: n.id,
          nodeType: n.type,
          label: n.label,
        }))
      ),
    },
  });

  const executionId = execution.id;
  let context: ExpressionContext = {};
  const executedNodes = new Set<string>();
  const nodeLogs: NodeExecutionLog[] = [];
  let completedNodes = 0;
  let failedNodes = 0;
  let paused = false;

  try {
    // Emit start event
    await emitEvent("team.execution.started", userId, undefined, {
      teamId,
      executionId,
      teamName: team.name,
      goal: goal || team.goal,
      workflowMode: true,
      totalNodes: nodes.length,
    });

    // Führe Trigger-Node aus
    if (triggerNode) {
      const triggerResult = executeTriggerNode(
        triggerNode.type,
        triggerNode.config,
        triggerPayload
      );
      context = { ...triggerResult.context };

      await logNodeExecution(executionId, teamId, triggerNode, {
        nodeId: triggerNode.id,
        nodeType: triggerNode.type,
        status: "completed",
        contextDelta: triggerResult.context,
        output: JSON.stringify(triggerResult.context),
        startedAt: new Date(),
        completedAt: new Date(),
        meta: { triggerType: triggerResult.triggerType },
      });

      executedNodes.add(triggerNode.id);
      completedNodes++;
    }

    // Starte DAG-Traversal ab den Trigger-Nachfolgern
    const startNodeIds = triggerNode
      ? getNormalSuccessors(triggerNode.id, edges)
      : nodes.filter((n) => !n.type.startsWith("trigger_")).map((n) => n.id);

    // BFS-Traversal durch den Workflow-DAG
    const queue = [...startNodeIds];

    while (queue.length > 0 && !paused) {
      const currentNodeId = queue.shift()!;

      // Schon ausgeführt? Skip.
      if (executedNodes.has(currentNodeId)) continue;

      const node = nodeMap.get(currentNodeId);
      if (!node) continue;

      // Prüfe ob alle Vorgänger fertig sind (für Merge-Nodes)
      const incomingEdges = getIncomingEdges(currentNodeId, edges);
      const nonErrorIncoming = incomingEdges.filter((e) => !isErrorEdge(e));

      if (node.type === "merge" && nonErrorIncoming.length > 1) {
        const allPredecessorsDone = nonErrorIncoming.every((e) =>
          executedNodes.has(e.sourceId)
        );
        if (!allPredecessorsDone) {
          // Zurück in die Queue schieben
          queue.push(currentNodeId);
          continue;
        }
      }

      // Führe den Node aus
      const startTime = new Date();
      const category = getNodeCategory(node.type);
      let nodeResult: NodeExecutionLog;

      try {
        switch (category) {
          case "logic": {
            const logicResult = executeLogicNode(node.type, node.config, context);

            nodeResult = {
              nodeId: node.id,
              nodeType: node.type,
              status: "completed",
              output: JSON.stringify(logicResult),
              contextDelta: {},
              startedAt: startTime,
              completedAt: new Date(),
              meta: logicResult.meta,
            };

            // Nur die passenden Nachfolger in die Queue
            const nextIds = getSuccessors(node.id, edges, logicResult.outputHandle);
            queue.push(...nextIds);
            break;
          }

          case "action": {
            const actionResult = await executeActionNode(
              node.type,
              node.config,
              context
            );

            if (actionResult.success) {
              context = { ...context, ...actionResult.contextDelta };
              nodeResult = {
                nodeId: node.id,
                nodeType: node.type,
                status: "completed",
                output: JSON.stringify(actionResult.contextDelta),
                contextDelta: actionResult.contextDelta,
                startedAt: startTime,
                completedAt: new Date(),
                meta: actionResult.meta,
              };

              queue.push(...getNormalSuccessors(node.id, edges));
            } else {
              nodeResult = {
                nodeId: node.id,
                nodeType: node.type,
                status: "failed",
                contextDelta: actionResult.contextDelta,
                error: actionResult.error,
                startedAt: startTime,
                completedAt: new Date(),
                meta: actionResult.meta,
              };

              // Error-Pfad verfolgen
              const errorTargets = getErrorSuccessors(node.id, edges);
              if (errorTargets.length > 0) {
                context = {
                  ...context,
                  _lastError: {
                    nodeId: node.id,
                    nodeType: node.type,
                    error: actionResult.error,
                  },
                };
                queue.push(...errorTargets);
              }

              failedNodes++;
            }
            break;
          }

          case "agent": {
            nodeResult = await executeAgentNode(
              node,
              team,
              executionId,
              context,
              startTime
            );

            if (nodeResult.status === "completed") {
              context = { ...context, ...nodeResult.contextDelta };
              queue.push(...getNormalSuccessors(node.id, edges));
            } else {
              const errorTargets = getErrorSuccessors(node.id, edges);
              if (errorTargets.length > 0) {
                context = {
                  ...context,
                  _lastError: {
                    nodeId: node.id,
                    nodeType: node.type,
                    error: nodeResult.error,
                  },
                };
                queue.push(...errorTargets);
              }
              failedNodes++;
            }
            break;
          }

          case "control": {
            const mergeExtra =
              node.type === "merge"
                ? {
                    branchesCompleted: nonErrorIncoming.filter((e) =>
                      executedNodes.has(e.sourceId)
                    ).length,
                    branchesExpected: nonErrorIncoming.length,
                  }
                : undefined;

            const controlResult = executeControlNode(
              node.type,
              node.config,
              context,
              mergeExtra
            );

            context = { ...context, ...controlResult.contextDelta };

            if (controlResult.action === "pause") {
              nodeResult = {
                nodeId: node.id,
                nodeType: node.type,
                status: "paused",
                contextDelta: controlResult.contextDelta,
                output: controlResult.pauseReason,
                startedAt: startTime,
                completedAt: new Date(),
                meta: controlResult.meta,
              };
              paused = true;

              // Approval Gate: erstelle ApprovalRequest
              if (node.type === "approval_gate" && controlResult.meta) {
                await createWorkflowApprovalRequest(
                  executionId,
                  teamId,
                  userId,
                  node,
                  controlResult,
                  team.name
                );
              }
            } else if (controlResult.action === "skip") {
              nodeResult = {
                nodeId: node.id,
                nodeType: node.type,
                status: "skipped",
                contextDelta: {},
                startedAt: startTime,
                completedAt: new Date(),
                meta: controlResult.meta,
              };
              queue.push(...getNormalSuccessors(node.id, edges));
            } else {
              nodeResult = {
                nodeId: node.id,
                nodeType: node.type,
                status: "completed",
                contextDelta: controlResult.contextDelta,
                startedAt: startTime,
                completedAt: new Date(),
                meta: controlResult.meta,
              };
              queue.push(...getNormalSuccessors(node.id, edges));
            }
            break;
          }

          default:
            nodeResult = {
              nodeId: node.id,
              nodeType: node.type,
              status: "skipped",
              contextDelta: {},
              startedAt: startTime,
              completedAt: new Date(),
              meta: { reason: `Unbekannte Node-Kategorie: ${category}` },
            };
        }
      } catch (err) {
        nodeResult = {
          nodeId: node.id,
          nodeType: node.type,
          status: "failed",
          contextDelta: {},
          error: err instanceof Error ? err.message : "Node execution fehlgeschlagen",
          startedAt: startTime,
          completedAt: new Date(),
        };

        // Error-Pfad verfolgen
        const errorTargets = getErrorSuccessors(node.id, edges);
        if (errorTargets.length > 0) {
          context = {
            ...context,
            _lastError: {
              nodeId: node.id,
              nodeType: node.type,
              error: nodeResult.error,
            },
          };
          queue.push(...errorTargets);
        }

        failedNodes++;
      }

      // Log schreiben
      await logNodeExecution(executionId, teamId, node, nodeResult);
      executedNodes.add(currentNodeId);

      if (nodeResult.status === "completed" || nodeResult.status === "skipped") {
        completedNodes++;
      }

      nodeLogs.push(nodeResult);

      // Progress updaten
      await prisma.teamExecution.update({
        where: { id: executionId },
        data: {
          completedTasks: completedNodes,
          failedTasks: failedNodes,
          executionContext: toJsonValue(context),
        },
      });
    }

    // Finaler Status
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
        completedTasks: completedNodes,
        failedTasks: failedNodes,
        executionContext: toJsonValue(context),
      },
    });

    // Emit completion event
    if (!paused) {
      await emitEvent("team.execution.completed", userId, undefined, {
        teamId,
        executionId,
        teamName: team.name,
        status: finalStatus,
        completedNodes,
        failedNodes,
        totalNodes: nodes.length,
      });
    }

    return {
      executionId,
      status: finalStatus,
      context,
    };
  } catch (err) {
    // Execution-Level Fehler
    await prisma.teamExecution.update({
      where: { id: executionId },
      data: {
        status: TeamExecutionStatus.FAILED,
        completedAt: new Date(),
        completedTasks: completedNodes,
        failedTasks: failedNodes + 1,
        executionContext: toJsonValue(context),
      },
    });

    await emitEvent("team.execution.failed", userId, undefined, {
      teamId,
      executionId,
      error: err instanceof Error ? err.message : "Workflow execution fehlgeschlagen",
    });

    throw err;
  }
}

/* ── Agent Node Execution ── */

/**
 * Führt einen Agent-Node aus, indem der bestehende team-runtime genutzt wird.
 */
async function executeAgentNode(
  node: WorkflowNode,
  team: Awaited<ReturnType<typeof loadTeamExecutionRuntimeContext>>,
  executionId: string,
  context: ExpressionContext,
  startTime: Date
): Promise<NodeExecutionLog> {
  if (!team) {
    return {
      nodeId: node.id,
      nodeType: node.type,
      status: "failed",
      contextDelta: {},
      error: "Team nicht verfügbar",
      startedAt: startTime,
      completedAt: new Date(),
    };
  }

  const agentConfig = node.config as { agentId?: string; memberId?: string; taskTitle?: string; taskDescription?: string; goal?: string; inputTemplate?: string };

  // Finde den passenden TeamMember
  const member = team.members.find(
    (m) =>
      m.id === agentConfig.memberId ||
      m.agentId === (agentConfig.agentId || node.agentId)
  );

  if (!member || !member.agent) {
    return {
      nodeId: node.id,
      nodeType: node.type,
      status: "failed",
      contextDelta: {},
      error: "Kein Agent für diesen Node konfiguriert",
      startedAt: startTime,
      completedAt: new Date(),
    };
  }

  const { taskTitle, taskDescription, goal: agentGoal } = buildAgentTaskFromContext(
    agentConfig,
    context,
    node.id
  );

  // Erstelle einen synthetischen Task
  const syntheticTask: TeamExecutionTaskInput = {
    id: `wf_task_${node.id}_${Date.now()}`,
    title: taskTitle,
    description: taskDescription,
    priority: "NORMAL",
    assignedToId: member.id,
    taskIndex: 0,
  };

  // Erstelle den Task in der DB für die Referenz
  const dbTask = await prisma.agentTeamTask.create({
    data: {
      teamId: team.id,
      title: syntheticTask.title,
      description: syntheticTask.description,
      priority: syntheticTask.priority,
      assignedToId: member.id,
      status: TeamExecutionTaskStatus.RUNNING,
    },
  });

  syntheticTask.id = dbTask.id;

  try {
    // Nutze runTeamMemberTask indirekt über executeTeamExecution mit einem einzigen Task
    // Stattdessen: Erstelle eine Mini-Execution innerhalb des Workflows
    const miniExecution = await prisma.teamExecution.create({
      data: {
        teamId: team.id,
        userId: team.userId,
        goal: agentGoal,
        status: TeamExecutionStatus.RUNNING,
        startedAt: new Date(),
        executionContext: toJsonValue(context),
      },
    });

    await executeTeamExecution({
      executionId: miniExecution.id,
      team,
      userId: team.userId,
      goal: agentGoal,
      tasks: [syntheticTask],
      executionContext: context as TeamSharedContext,
    });

    // Lade das Ergebnis
    const updatedExecution = await prisma.teamExecution.findUnique({
      where: { id: miniExecution.id },
    });

    const executionContext = updatedExecution?.executionContext
      ? (JSON.parse(JSON.stringify(updatedExecution.executionContext)) as Record<string, unknown>)
      : {};

    const updatedTask = await prisma.agentTeamTask.findUnique({
      where: { id: dbTask.id },
    });

    const output = updatedTask?.result || "";
    const contextDelta = mapAgentResultToContext(
      {
        output,
        structuredOutput: executionContext,
        model: "",
        tokensIn: 0,
        tokensOut: 0,
        estimatedCost: 0,
      },
      node.id
    );

    // Cleanup: Mini-Execution Status setzen
    await prisma.teamExecution.update({
      where: { id: miniExecution.id },
      data: { status: TeamExecutionStatus.COMPLETED, completedAt: new Date() },
    });

    return {
      nodeId: node.id,
      nodeType: node.type,
      status: updatedTask?.status === "COMPLETED" ? "completed" : "failed",
      output,
      contextDelta,
      startedAt: startTime,
      completedAt: new Date(),
      meta: {
        agentId: member.agent.id,
        agentName: member.agent.name,
        miniExecutionId: miniExecution.id,
      },
    };
  } catch (err) {
    return {
      nodeId: node.id,
      nodeType: node.type,
      status: "failed",
      contextDelta: {},
      error: err instanceof Error ? err.message : "Agent execution fehlgeschlagen",
      startedAt: startTime,
      completedAt: new Date(),
    };
  }
}

/* ── Approval Request für Workflow Nodes ── */

async function createWorkflowApprovalRequest(
  executionId: string,
  teamId: string,
  userId: string,
  node: WorkflowNode,
  controlResult: ControlNodeResult,
  teamName: string
) {
  const meta = controlResult.meta || {};
  const approverEmail = String(meta.approverEmail || "");

  if (!approverEmail) return;

  const token = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  await prisma.approvalRequest.create({
    data: {
      teamExecutionId: executionId,
      taskIndex: 0,
      token,
      approverEmail,
      note: String(meta.message || `Workflow Approval benötigt für Node: ${node.label}`),
      status: "PENDING",
    },
  });

  await emitEvent("team.execution.approval_needed", userId, undefined, {
    teamId,
    executionId,
    nodeId: node.id,
    nodeType: node.type,
    approverEmail,
    teamName,
  });
}

/* ── Log Helper ── */

async function logNodeExecution(
  executionId: string,
  teamId: string,
  node: WorkflowNode,
  result: NodeExecutionLog
) {
  const statusMap: Record<string, TeamExecutionTaskStatus> = {
    completed: TeamExecutionTaskStatus.COMPLETED,
    failed: TeamExecutionTaskStatus.FAILED,
    skipped: TeamExecutionTaskStatus.SKIPPED,
    paused: TeamExecutionTaskStatus.PENDING,
  };

  await prisma.teamExecutionLog.create({
    data: {
      teamId,
      executionId,
      taskIndex: 0,
      taskTitle: node.label || node.type,
      nodeId: node.id,
      nodeType: node.type,
      agentId: node.agentId || null,
      status: statusMap[result.status] || TeamExecutionTaskStatus.PENDING,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      output: result.output || null,
      structuredOutput: result.contextDelta
        ? toJsonValue(result.contextDelta)
        : undefined,
      error: result.error || null,
      input: result.meta ? toJsonValue(result.meta) : undefined,
    },
  });
}

/* ── Fallback: Agent-Only Team Execution ── */

/**
 * Für Teams ohne Workflow-Definition — nutzt den bestehenden team-runtime.
 */
async function executeAgentOnlyTeam(
  team: NonNullable<Awaited<ReturnType<typeof loadTeamExecutionRuntimeContext>>>,
  userId: string,
  goal: string
): Promise<{ executionId: string; status: string; context: ExpressionContext }> {
  // Lade Team-Tasks
  const tasks = await prisma.agentTeamTask.findMany({
    where: { teamId: team.id },
    orderBy: { createdAt: "asc" },
  });

  const taskInputs: TeamExecutionTaskInput[] = tasks.map((t, i) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    assignedToId: t.assignedToId,
    taskIndex: i,
  }));

  // Erstelle Execution
  const execution = await prisma.teamExecution.create({
    data: {
      teamId: team.id,
      userId,
      goal,
      status: TeamExecutionStatus.RUNNING,
      startedAt: new Date(),
      taskPlan: toJsonValue(
        taskInputs.map((t) => ({
          taskIndex: t.taskIndex,
          title: t.title,
          assignedToId: t.assignedToId,
        }))
      ),
    },
  });

  await executeTeamExecution({
    executionId: execution.id,
    team,
    userId,
    goal,
    tasks: taskInputs,
  });

  const updated = await prisma.teamExecution.findUnique({
    where: { id: execution.id },
  });

  return {
    executionId: execution.id,
    status: updated?.status || "COMPLETED",
    context: updated?.executionContext
      ? (JSON.parse(JSON.stringify(updated.executionContext)) as ExpressionContext)
      : {},
  };
}
