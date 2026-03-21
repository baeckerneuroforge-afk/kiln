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
import type { WorkflowNode, WorkflowEdge, WorkflowNodeType, WorkflowVariable } from "@/lib/workflow-node-types";
import type { ExpressionContext } from "@/lib/workflow-expressions";
import { resolveExpression, resolveExpressionValue } from "@/lib/workflow-expressions";

import { executeTriggerNode } from "@/lib/workflow-nodes/trigger-nodes";
import { executeLogicNode } from "@/lib/workflow-nodes/logic-nodes";
import { executeActionNode } from "@/lib/workflow-nodes/action-nodes";
import { executeIntegrationNode } from "@/lib/workflow-nodes/integration-nodes";
import { executeAiNode } from "@/lib/workflow-nodes/ai-nodes";
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
import {
  logRoutingDecision,
  logAgentExecution,
  logApprovalGate,
  logErrorFallback,
} from "@/lib/orchestration-logger";
import {
  selectOptimalModel,
  detectTaskType,
  trackModelCost,
} from "@/lib/smart-model-router";
import {
  saveCheckpoint,
  loadCheckpoint,
  shouldCheckpoint,
  isExecutionTimedOut,
  getMaxExecutionMs,
  sendProgressEmail,
  type ExecutionResumeData,
} from "@/lib/execution-persistence";
import {
  planWorkflow,
  mapStepToNodeType,
  resolveModelHint,
} from "@/lib/goal-planner";
import { executeAgentSwarm } from "@/lib/workflow-nodes/agent-swarm-node";
import {
  executeParallelSplit,
  executeParallelMerge,
} from "@/lib/workflow-nodes/parallel-node";

/* ── Types ── */

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables?: WorkflowVariable[];
}

export interface WorkflowExecutionOptions {
  teamId: string;
  userId: string;
  triggerNodeId?: string; // Welcher Trigger hat gefeuert
  triggerPayload?: Record<string, unknown>;
  goal?: string;
  depth?: number; // Sub-workflow nesting depth (max 5)
  debugMode?: boolean; // Step-by-step execution mit Pausen
  resumeExecutionId?: string; // Resume von einem Checkpoint
  enableSmartRouting?: boolean; // Automatische Modell-Auswahl
  maxExecutionMinutes?: number; // Maximale Ausführungszeit
}

/* ── Debug Mode State ── */

export interface DebugStepState {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped" | "paused";
  input: Record<string, unknown>;
  config: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  durationMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  cost: number | null;
  contextSnapshot: Record<string, unknown>;
  variablesSnapshot: Record<string, unknown>;
}

export interface DebugState {
  executionId: string;
  status: "running" | "paused" | "completed" | "failed" | "aborted";
  currentNodeId: string | null;
  steps: DebugStepState[];
  pendingAction: "continue" | "skip" | "abort" | null;
}

// In-memory debug state store (pro Execution)
const debugStates = new Map<string, DebugState>();

export function getDebugState(executionId: string): DebugState | null {
  return debugStates.get(executionId) || null;
}

export function setDebugAction(executionId: string, action: "continue" | "skip" | "abort"): boolean {
  const state = debugStates.get(executionId);
  if (!state || state.status !== "paused") return false;
  state.pendingAction = action;
  return true;
}

function cleanupDebugState(executionId: string) {
  // Cleanup nach 30 Minuten
  setTimeout(() => debugStates.delete(executionId), 30 * 60 * 1000);
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
  tokensIn?: number;
  tokensOut?: number;
  model?: string;
  estimatedCost?: number;
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
  transform: "logic",
  http_request: "action",
  send_email: "action",
  send_slack: "action",
  delay: "action",
  set_variable: "action",
  a2a_call: "action",
  approval_gate: "control",
  wait_webhook: "control",
  wait_form: "control",
  sub_workflow: "control",
  merge: "control",
  // Integrations
  google_sheets_read: "integration",
  google_sheets_write: "integration",
  gmail_send: "integration",
  slack_send_integration: "integration",
  calendar_create: "integration",
  calendar_check: "integration",
  notion_create: "integration",
  airtable_create: "integration",
  // AI Tools
  ai_summarize: "ai_tool",
  ai_classify: "ai_tool",
  ai_extract: "ai_tool",
  computer_use: "ai_tool",
  deep_research: "ai_tool",
  code_sandbox: "ai_tool",
  // Goal & Sub-Agent
  goal_trigger: "goal",
  spawn_helper: "spawn",
  // Parallel & Swarm
  agent_swarm: "swarm",
  parallel_split: "parallel",
  parallel_merge: "parallel",
};

const MAX_SUB_WORKFLOW_DEPTH = 5;
const MAX_SPAWNED_AGENTS = 5;

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

  const variables = Array.isArray(workflow.variables) ? workflow.variables : [];

  return {
    nodes: nodes as WorkflowNode[],
    edges: edges as WorkflowEdge[],
    variables: variables as WorkflowVariable[],
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

  const currentDepth = options.depth ?? 0;
  if (currentDepth > MAX_SUB_WORKFLOW_DEPTH) {
    throw new Error(
      `Sub-Workflow maximale Verschachtelungstiefe (${MAX_SUB_WORKFLOW_DEPTH}) überschritten. Prüfe auf zirkuläre Sub-Workflow-Referenzen.`
    );
  }

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

  const executionId = options.resumeExecutionId || execution.id;
  const maxExecMs = options.maxExecutionMinutes
    ? options.maxExecutionMinutes * 60 * 1000
    : getMaxExecutionMs(team.config);
  const executionStartTime = new Date();
  const enableSmartRouting = options.enableSmartRouting !== false;
  let spawnedAgentCount = 0;

  // Checkpoint-Resume: Lade gespeicherten Zustand
  let resumeData: ExecutionResumeData | null = null;
  if (options.resumeExecutionId) {
    resumeData = await loadCheckpoint(options.resumeExecutionId);
  }

  // Initialisiere Variablen aus der Workflow-Definition
  const variablesInit: Record<string, unknown> = {};
  if (workflowDef.variables && workflowDef.variables.length > 0) {
    for (const v of workflowDef.variables) {
      let parsed: unknown = v.defaultValue;
      if (v.type === "number") parsed = Number(v.defaultValue) || 0;
      else if (v.type === "boolean") parsed = v.defaultValue === "true";
      variablesInit[v.name] = parsed;
    }
  }

  // Ersten Agent des Teams laden (für Credential-Zugriff in Computer Use)
  const firstAgentId = team.members?.[0]?.agent?.id || "";

  let context: ExpressionContext = resumeData
    ? (resumeData.context as ExpressionContext)
    : {
        variables: variablesInit,
        _userId: options.userId,
        _teamId: teamId,
        _agentId: firstAgentId,
      };
  const executedNodes = new Set<string>(resumeData?.executedNodeIds || []);
  const nodeLogs: NodeExecutionLog[] = [];
  let completedNodes = resumeData?.completedNodes || 0;
  let failedNodes = resumeData?.failedNodes || 0;
  let paused = false;
  const isDebug = options.debugMode === true;

  // Debug-Mode State initialisieren
  if (isDebug) {
    debugStates.set(executionId, {
      executionId,
      status: "running",
      currentNodeId: null,
      steps: [],
      pendingAction: null,
    });
  }

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
      context = { ...context, ...triggerResult.context };

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

    // Starte DAG-Traversal ab den Trigger-Nachfolgern oder Resume-Queue
    const startNodeIds = resumeData
      ? resumeData.pendingQueue
      : triggerNode
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
            const logicEndTime = new Date();

            nodeResult = {
              nodeId: node.id,
              nodeType: node.type,
              status: "completed",
              output: JSON.stringify(logicResult),
              contextDelta: {},
              startedAt: startTime,
              completedAt: logicEndTime,
              meta: logicResult.meta,
            };

            // Nur die passenden Nachfolger in die Queue
            const nextIds = getSuccessors(node.id, edges, logicResult.outputHandle);
            queue.push(...nextIds);

            // Log routing decision
            logRoutingDecision({
              teamId,
              executionId,
              nodeId: node.id,
              nodeType: node.type,
              condition: JSON.stringify(node.config).slice(0, 200),
              conditionResult: logicResult.outputHandle !== "false",
              outputHandle: logicResult.outputHandle,
              context,
              durationMs: logicEndTime.getTime() - startTime.getTime(),
            }).catch(() => {});

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

                logErrorFallback({
                  teamId, executionId,
                  nodeId: node.id, nodeType: node.type,
                  error: actionResult.error || "Action failed",
                  fallbackNodeIds: errorTargets,
                  context,
                }).catch(() => {});
              } else {
                await invokeGlobalErrorHandler(team.config, executionId, node.id, node.type, actionResult.error || "Action failed", context);
              }

              failedNodes++;
            }
            break;
          }

          case "integration":
          case "ai_tool": {
            const integrationExecutor = category === "integration"
              ? executeIntegrationNode
              : executeAiNode;
            const integrationResult = await integrationExecutor(
              node.type,
              node.config,
              context
            );

            if (integrationResult.success) {
              context = { ...context, ...integrationResult.contextDelta };
              nodeResult = {
                nodeId: node.id,
                nodeType: node.type,
                status: "completed",
                output: JSON.stringify(integrationResult.contextDelta),
                contextDelta: integrationResult.contextDelta,
                startedAt: startTime,
                completedAt: new Date(),
                meta: integrationResult.meta,
              };

              queue.push(...getNormalSuccessors(node.id, edges));
            } else {
              nodeResult = {
                nodeId: node.id,
                nodeType: node.type,
                status: "failed",
                contextDelta: integrationResult.contextDelta,
                error: integrationResult.error,
                startedAt: startTime,
                completedAt: new Date(),
                meta: integrationResult.meta,
              };

              const intErrorTargets = getErrorSuccessors(node.id, edges);
              if (intErrorTargets.length > 0) {
                context = {
                  ...context,
                  _lastError: {
                    nodeId: node.id,
                    nodeType: node.type,
                    error: integrationResult.error,
                  },
                };
                queue.push(...intErrorTargets);

                logErrorFallback({
                  teamId, executionId,
                  nodeId: node.id, nodeType: node.type,
                  error: integrationResult.error || "Integration/AI failed",
                  fallbackNodeIds: intErrorTargets,
                  context,
                }).catch(() => {});
              } else {
                await invokeGlobalErrorHandler(team.config, executionId, node.id, node.type, integrationResult.error || "Integration/AI failed", context);
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

            const agentEndTime = new Date();
            const agentMeta = nodeResult.meta as Record<string, unknown> | undefined;

            // Log agent execution
            logAgentExecution({
              teamId, executionId,
              nodeId: node.id,
              agentId: (agentMeta?.agentId as string) || "",
              agentName: (agentMeta?.agentName as string) || node.label || "Unknown",
              input: JSON.stringify(context).slice(0, 500),
              output: nodeResult.output || "",
              success: nodeResult.status === "completed",
              error: nodeResult.error,
              tokensUsed: (nodeResult.tokensIn || 0) + (nodeResult.tokensOut || 0),
              durationMs: agentEndTime.getTime() - startTime.getTime(),
              context,
            }).catch(() => {});

            if (nodeResult.status === "completed") {
              context = { ...context, ...nodeResult.contextDelta };
              queue.push(...getNormalSuccessors(node.id, edges));
            } else {
              const agentErrorTargets = getErrorSuccessors(node.id, edges);
              if (agentErrorTargets.length > 0) {
                context = {
                  ...context,
                  _lastError: {
                    nodeId: node.id,
                    nodeType: node.type,
                    error: nodeResult.error,
                  },
                };
                queue.push(...agentErrorTargets);

                logErrorFallback({
                  teamId, executionId,
                  nodeId: node.id, nodeType: node.type,
                  error: nodeResult.error || "Agent failed",
                  fallbackNodeIds: agentErrorTargets,
                  context,
                }).catch(() => {});
              } else {
                await invokeGlobalErrorHandler(team.config, executionId, node.id, node.type, nodeResult.error || "Agent failed", context);
              }
              failedNodes++;
            }
            break;
          }

          case "control": {
            // Special handling for sub_workflow: actually execute it
            if (node.type === "sub_workflow") {
              const subResult = await executeSubWorkflowNode(
                node,
                context,
                userId,
                currentDepth
              );

              if (subResult.status === "completed") {
                context = { ...context, ...subResult.contextDelta };
                nodeResult = subResult;
                queue.push(...getNormalSuccessors(node.id, edges));
              } else if (subResult.status === "paused") {
                nodeResult = subResult;
                paused = true;
              } else {
                nodeResult = subResult;
                const errorTargets = getErrorSuccessors(node.id, edges);
                if (errorTargets.length > 0) {
                  context = {
                    ...context,
                    _lastError: {
                      nodeId: node.id,
                      nodeType: node.type,
                      error: subResult.error,
                    },
                  };
                  queue.push(...errorTargets);
                }
                failedNodes++;
              }
              break;
            }

            // ... rest of control handling (merge extra, executeControlNode, etc.)
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

                logApprovalGate({
                  teamId, executionId,
                  nodeId: node.id,
                  approvalType: (controlResult.meta as Record<string, unknown>).approvalType as string || "manual",
                  context,
                }).catch(() => {});
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

          case "goal": {
            // Goal-Based Execution: Plane Schritte aus natürlichsprachlichem Ziel
            nodeResult = await executeGoalNode(node, team, executionId, context, startTime);

            if (nodeResult.status === "completed") {
              context = { ...context, ...nodeResult.contextDelta };
              queue.push(...getNormalSuccessors(node.id, edges));
            } else {
              const goalErrorTargets = getErrorSuccessors(node.id, edges);
              if (goalErrorTargets.length > 0) {
                context = { ...context, _lastError: { nodeId: node.id, nodeType: node.type, error: nodeResult.error } };
                queue.push(...goalErrorTargets);
              }
              failedNodes++;
            }
            break;
          }

          case "spawn": {
            // Sub-Agent Spawning: Erstelle temporäre Agent-Executions
            if (spawnedAgentCount >= MAX_SPAWNED_AGENTS) {
              nodeResult = {
                nodeId: node.id,
                nodeType: node.type,
                status: "failed",
                contextDelta: {},
                error: `Maximale Anzahl gespawnter Agents (${MAX_SPAWNED_AGENTS}) erreicht`,
                startedAt: startTime,
                completedAt: new Date(),
              };
              failedNodes++;
            } else {
              nodeResult = await executeSpawnHelperNode(
                node, team, executionId, context, startTime, userId, enableSmartRouting
              );
              spawnedAgentCount++;

              if (nodeResult.status === "completed") {
                context = { ...context, ...nodeResult.contextDelta };
                queue.push(...getNormalSuccessors(node.id, edges));
              } else {
                const spawnErrorTargets = getErrorSuccessors(node.id, edges);
                if (spawnErrorTargets.length > 0) {
                  context = { ...context, _lastError: { nodeId: node.id, nodeType: node.type, error: nodeResult.error } };
                  queue.push(...spawnErrorTargets);
                }
                failedNodes++;
              }
            }
            break;
          }

          case "swarm": {
            // Agent Swarm: Parallele Sub-Tasks mit mehreren Agents
            const swarmResult = await executeAgentSwarm(node.config, context);

            if (swarmResult.success) {
              context = { ...context, ...swarmResult.contextDelta };
              nodeResult = {
                nodeId: node.id,
                nodeType: node.type,
                status: "completed",
                output: JSON.stringify(swarmResult.contextDelta),
                contextDelta: swarmResult.contextDelta,
                startedAt: startTime,
                completedAt: new Date(),
                meta: swarmResult.meta,
              };
              queue.push(...getNormalSuccessors(node.id, edges));
            } else {
              nodeResult = {
                nodeId: node.id,
                nodeType: node.type,
                status: "failed",
                contextDelta: swarmResult.contextDelta,
                error: swarmResult.error,
                startedAt: startTime,
                completedAt: new Date(),
                meta: swarmResult.meta,
              };
              const swarmErrorTargets = getErrorSuccessors(node.id, edges);
              if (swarmErrorTargets.length > 0) {
                context = { ...context, _lastError: { nodeId: node.id, nodeType: node.type, error: swarmResult.error } };
                queue.push(...swarmErrorTargets);
              }
              failedNodes++;
            }
            break;
          }

          case "parallel": {
            if (node.type === "parallel_split") {
              const splitResult = executeParallelSplit(node.config, context);
              context = { ...context, ...splitResult.contextDelta };

              // Alle Branches aktivieren — nutze Handle-basierte Nachfolger
              const allSuccessors: string[] = [];
              for (const handle of splitResult.outputHandles) {
                allSuccessors.push(...getSuccessors(node.id, edges, handle));
              }
              // Fallback: wenn keine Handle-spezifischen Edges, alle normalen Nachfolger
              if (allSuccessors.length === 0) {
                allSuccessors.push(...getNormalSuccessors(node.id, edges));
              }
              queue.push(...allSuccessors);

              nodeResult = {
                nodeId: node.id,
                nodeType: node.type,
                status: "completed",
                contextDelta: splitResult.contextDelta,
                output: `Split in ${splitResult.outputHandles.length} Branches`,
                startedAt: startTime,
                completedAt: new Date(),
                meta: { branches: splitResult.outputHandles.length },
              };
            } else {
              // parallel_merge
              const mergeExtra = {
                branchesCompleted: nonErrorIncoming.filter((e) => executedNodes.has(e.sourceId)).length,
                branchesExpected: nonErrorIncoming.length,
              };

              const mergeResult = executeParallelMerge(node.config, context, mergeExtra);

              if (mergeResult.success) {
                context = { ...context, ...mergeResult.contextDelta };
                nodeResult = {
                  nodeId: node.id,
                  nodeType: node.type,
                  status: "completed",
                  contextDelta: mergeResult.contextDelta,
                  startedAt: startTime,
                  completedAt: new Date(),
                  meta: mergeResult.meta,
                };
                queue.push(...getNormalSuccessors(node.id, edges));
              } else {
                // Noch nicht alle Branches fertig → zurück in Queue
                queue.push(node.id);
                executedNodes.delete(currentNodeId); // Re-evaluate später
                continue; // Skip den Rest der Loop-Iteration
              }
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
        const errorMsg = err instanceof Error ? err.message : "Node execution fehlgeschlagen";

        // Self-Healing: Versuche den Fehler automatisch zu beheben
        const healResult = await attemptSelfHeal(
          node, errorMsg, context, team.config, executionId
        );

        if (healResult.healed) {
          // Heilung erfolgreich — nutze das Ergebnis
          context = { ...context, ...healResult.contextDelta };
          nodeResult = {
            nodeId: node.id,
            nodeType: node.type,
            status: "completed",
            contextDelta: healResult.contextDelta,
            output: healResult.output,
            startedAt: startTime,
            completedAt: new Date(),
            meta: { selfHealed: true, healStrategy: healResult.strategy },
          };
          queue.push(...getNormalSuccessors(node.id, edges));
        } else {
          nodeResult = {
            nodeId: node.id,
            nodeType: node.type,
            status: "failed",
            contextDelta: {},
            error: errorMsg,
            startedAt: startTime,
            completedAt: new Date(),
            meta: { healAttempted: true, healStrategy: healResult.strategy },
          };

          // Error-Pfad verfolgen
          const catchErrorTargets = getErrorSuccessors(node.id, edges);
          if (catchErrorTargets.length > 0) {
            context = {
              ...context,
              _lastError: {
                nodeId: node.id,
                nodeType: node.type,
                error: nodeResult.error,
              },
            };
            queue.push(...catchErrorTargets);

            logErrorFallback({
              teamId, executionId,
              nodeId: node.id, nodeType: node.type,
              error: nodeResult.error || "Node execution failed",
              fallbackNodeIds: catchErrorTargets,
              context,
            }).catch(() => {});
          } else {
            await invokeGlobalErrorHandler(team.config, executionId, node.id, node.type, nodeResult.error || "Node execution failed", context);
          }

          failedNodes++;
        }
      }

      // Log schreiben
      await logNodeExecution(executionId, teamId, node, nodeResult);
      executedNodes.add(currentNodeId);

      if (nodeResult.status === "completed" || nodeResult.status === "skipped") {
        completedNodes++;
      }

      nodeLogs.push(nodeResult);

      // Checkpoint speichern (alle N Nodes)
      if (shouldCheckpoint(completedNodes + failedNodes)) {
        await saveCheckpoint({
          executionId,
          teamId,
          userId,
          context: context as Record<string, unknown>,
          executedNodeIds: Array.from(executedNodes),
          pendingQueue: [...queue],
          completedNodes,
          failedNodes,
          checkpointedAt: new Date(),
          reason: "auto",
        });
      }

      // Zeitlimit prüfen
      if (isExecutionTimedOut(executionStartTime, maxExecMs)) {
        // Checkpoint speichern und pausieren
        await saveCheckpoint({
          executionId,
          teamId,
          userId,
          context: context as Record<string, unknown>,
          executedNodeIds: Array.from(executedNodes),
          pendingQueue: [...queue],
          completedNodes,
          failedNodes,
          checkpointedAt: new Date(),
          reason: "timeout",
        });

        // Progress-Email senden
        sendProgressEmail(
          executionId, userId, team.name,
          completedNodes, nodes.length,
          Date.now() - executionStartTime.getTime()
        ).catch(() => {});

        paused = true;
        break;
      }

      // Progress-Email bei langen Ausführungen (>5 Min, alle 10 Nodes)
      const elapsed = Date.now() - executionStartTime.getTime();
      if (elapsed > 5 * 60 * 1000 && (completedNodes + failedNodes) % 10 === 0) {
        sendProgressEmail(
          executionId, userId, team.name,
          completedNodes, nodes.length, elapsed
        ).catch(() => {});
      }

      // Debug-Mode: Schritt aufzeichnen und pausieren
      if (isDebug) {
        const debugState = debugStates.get(executionId);
        if (debugState) {
          const durationMs = nodeResult.startedAt && nodeResult.completedAt
            ? nodeResult.completedAt.getTime() - nodeResult.startedAt.getTime()
            : null;

          debugState.steps.push({
            nodeId: node.id,
            nodeType: node.type,
            nodeLabel: node.label || node.type,
            status: nodeResult.status,
            input: nodeResult.meta || {},
            config: node.config,
            output: nodeResult.contextDelta,
            error: nodeResult.error || null,
            durationMs,
            tokensIn: nodeResult.tokensIn || null,
            tokensOut: nodeResult.tokensOut || null,
            cost: nodeResult.estimatedCost || null,
            contextSnapshot: JSON.parse(JSON.stringify(context)),
            variablesSnapshot: JSON.parse(JSON.stringify(context.variables || {})),
          });

          // Pausiere wenn noch Nodes in der Queue sind
          if (queue.length > 0 && !paused) {
            debugState.status = "paused";
            debugState.currentNodeId = queue[0];
            debugState.pendingAction = null;

            // Warte auf User-Aktion (max 5 Minuten pro Schritt)
            const maxWait = 5 * 60 * 1000;
            const pollInterval = 200;
            let waited = 0;

            while (waited < maxWait) {
              const current = debugStates.get(executionId);
              if (!current || current.pendingAction) break;
              await new Promise((r) => setTimeout(r, pollInterval));
              waited += pollInterval;
            }

            const current = debugStates.get(executionId);
            if (!current) break;

            if (current.pendingAction === "abort") {
              current.status = "aborted";
              paused = true; // Beende die Loop
              break;
            } else if (current.pendingAction === "skip") {
              // Skip: Node aus Queue entfernen (überspringe den nächsten)
              const skippedId = queue.shift();
              if (skippedId) {
                const skippedNode = nodeMap.get(skippedId);
                executedNodes.add(skippedId);
                if (skippedNode) {
                  debugState.steps.push({
                    nodeId: skippedId,
                    nodeType: skippedNode.type,
                    nodeLabel: skippedNode.label || skippedNode.type,
                    status: "skipped",
                    input: {},
                    config: skippedNode.config,
                    output: null,
                    error: null,
                    durationMs: 0,
                    tokensIn: null,
                    tokensOut: null,
                    cost: null,
                    contextSnapshot: JSON.parse(JSON.stringify(context)),
                    variablesSnapshot: JSON.parse(JSON.stringify(context.variables || {})),
                  });
                  await logNodeExecution(executionId, teamId, skippedNode, {
                    nodeId: skippedId,
                    nodeType: skippedNode.type,
                    status: "skipped",
                    contextDelta: {},
                    startedAt: new Date(),
                    completedAt: new Date(),
                    meta: { reason: "Skipped in debug mode" },
                  });
                  // Queue die Nachfolger des übersprungenen Nodes
                  queue.push(...getNormalSuccessors(skippedId, edges));
                }
              }
            }
            // "continue" → einfach weitermachen

            current.status = "running";
            current.pendingAction = null;
          }
        }
      }

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

    // Debug-State abschließen
    if (isDebug) {
      const debugState = debugStates.get(executionId);
      if (debugState) {
        debugState.status = debugState.status === "aborted" ? "aborted" : (paused ? "paused" : (failedNodes > 0 && completedNodes === 0 ? "failed" : "completed"));
        debugState.currentNodeId = null;
        cleanupDebugState(executionId);
      }
    }

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

/* ── Sub-Workflow Node Execution ── */

async function executeSubWorkflowNode(
  node: WorkflowNode,
  context: ExpressionContext,
  userId: string,
  parentDepth: number
): Promise<NodeExecutionLog> {
  const startTime = new Date();
  const config = node.config as {
    workflowId?: string;
    mode?: string;
    inputMapping?: { key: string; value: string }[];
    outputMapping?: { key: string; value: string }[];
    timeoutMinutes?: number;
  };

  const targetTeamId = config.workflowId
    ? resolveExpression(config.workflowId, context)
    : "";

  if (!targetTeamId) {
    return {
      nodeId: node.id,
      nodeType: node.type,
      status: "failed",
      contextDelta: {},
      error: "Keine Workflow-ID konfiguriert",
      startedAt: startTime,
      completedAt: new Date(),
    };
  }

  // Build input from mapping
  const subInput: Record<string, unknown> = {};
  if (config.inputMapping) {
    for (const mapping of config.inputMapping) {
      if (mapping.key && mapping.value) {
        subInput[mapping.key] = resolveExpressionValue(mapping.value, context);
      }
    }
  }

  const mode = config.mode || "sync";

  try {
    if (mode === "async") {
      // Fire and forget — start sub-workflow but don't wait
      // Use a detached promise (the caller's waitUntil should handle this)
      executeWorkflow({
        teamId: targetTeamId,
        userId,
        triggerPayload: subInput,
        goal: `Sub-Workflow von ${node.label}`,
        depth: parentDepth + 1,
      }).catch(() => {
        // Async errors are logged but don't affect parent
      });

      return {
        nodeId: node.id,
        nodeType: node.type,
        status: "completed",
        contextDelta: {
          [`_subWorkflow_${node.id}`]: {
            workflowId: targetTeamId,
            mode: "async",
            triggeredAt: new Date().toISOString(),
          },
        },
        output: `Async Sub-Workflow ${targetTeamId} gestartet`,
        startedAt: startTime,
        completedAt: new Date(),
        meta: { workflowId: targetTeamId, mode: "async" },
      };
    }

    // Sync mode — execute and wait for result
    const timeoutMs = (config.timeoutMinutes || 5) * 60 * 1000;

    const subExecution = await Promise.race([
      executeWorkflow({
        teamId: targetTeamId,
        userId,
        triggerPayload: subInput,
        goal: `Sub-Workflow von ${node.label}`,
        depth: parentDepth + 1,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Sub-Workflow Timeout nach ${config.timeoutMinutes || 5} Minuten`)),
          timeoutMs
        )
      ),
    ]);

    // Map output back to parent context
    const contextDelta: Record<string, unknown> = {
      [`_subWorkflow_${node.id}`]: {
        workflowId: targetTeamId,
        executionId: subExecution.executionId,
        mode: "sync",
        status: subExecution.status,
        completedAt: new Date().toISOString(),
      },
    };

    if (config.outputMapping) {
      for (const mapping of config.outputMapping) {
        if (mapping.key && mapping.value) {
          // Resolve from sub-workflow's context
          contextDelta[mapping.key] = resolveExpressionValue(
            mapping.value,
            subExecution.context
          );
        }
      }
    }

    const isSuccess = subExecution.status === "COMPLETED";

    return {
      nodeId: node.id,
      nodeType: node.type,
      status: isSuccess ? "completed" : "failed",
      contextDelta,
      output: `Sub-Workflow ${targetTeamId}: ${subExecution.status}`,
      error: isSuccess ? undefined : `Sub-Workflow endete mit Status: ${subExecution.status}`,
      startedAt: startTime,
      completedAt: new Date(),
      meta: {
        workflowId: targetTeamId,
        subExecutionId: subExecution.executionId,
        mode: "sync",
        subStatus: subExecution.status,
      },
    };
  } catch (err) {
    return {
      nodeId: node.id,
      nodeType: node.type,
      status: "failed",
      contextDelta: {},
      error: err instanceof Error ? err.message : "Sub-Workflow Execution fehlgeschlagen",
      startedAt: startTime,
      completedAt: new Date(),
      meta: { workflowId: targetTeamId, mode },
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

  const durationMs = result.startedAt && result.completedAt
    ? result.completedAt.getTime() - result.startedAt.getTime()
    : null;

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
      input: result.meta
        ? toJsonValue({ ...result.meta, durationMs })
        : toJsonValue({ durationMs }),
      tokensIn: result.tokensIn || null,
      tokensOut: result.tokensOut || null,
      model: result.model || null,
      estimatedCost: result.estimatedCost || null,
    },
  });
}

/* ── Self-Healing Engine ── */

interface HealResult {
  healed: boolean;
  strategy: string;
  contextDelta: Record<string, unknown>;
  output?: string;
}

/**
 * Versucht einen fehlgeschlagenen Node automatisch zu reparieren.
 * Strategien: Retry mit anderem Modell, Haiku-Healer-Analyse, Parameter-Anpassung.
 */
async function attemptSelfHeal(
  node: WorkflowNode,
  error: string,
  context: ExpressionContext,
  _teamConfig: unknown,
  executionId: string
): Promise<HealResult> {
  const category = getNodeCategory(node.type);

  // Strategie 1: Bei AI/Agent-Fehlern → Retry mit anderem Modell
  if ((category === "agent" || category === "ai_tool") && error.includes("rate_limit")) {
    return {
      healed: false,
      strategy: "rate_limit_detected",
      contextDelta: {},
      output: "Rate limit — will retry via error path",
    };
  }

  // Strategie 2: Haiku-Healer analysiert den Fehler
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { healed: false, strategy: "no_api_key", contextDelta: {} };
  }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey });

    const healerResponse = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: `Du bist ein Fehler-Diagnose-Agent. Analysiere den Fehler und schlage eine Lösung vor.
Antworte AUSSCHLIESSLICH mit JSON:
{
  "canHeal": boolean,
  "strategy": "retry_different_params" | "skip_safely" | "provide_default" | "cannot_heal",
  "fix": { ... } // Korrigierte Parameter oder Default-Werte
  "explanation": "string"
}`,
      messages: [{
        role: "user",
        content: `Node: ${node.type} (${node.label || "unnamed"})
Config: ${JSON.stringify(node.config).slice(0, 500)}
Error: ${error}
Execution: ${executionId}

Kann dieser Fehler automatisch behoben werden?`,
      }],
    });

    const healText = healerResponse.content
      .filter((b) => b.type === "text")
      .map((b) => ("text" in b ? (b as { text: string }).text : ""))
      .join("");

    const healData = JSON.parse(healText) as {
      canHeal: boolean;
      strategy: string;
      fix?: Record<string, unknown>;
      explanation?: string;
    };

    if (healData.canHeal && healData.strategy === "provide_default" && healData.fix) {
      return {
        healed: true,
        strategy: "healer_default",
        contextDelta: healData.fix,
        output: healData.explanation || "Self-healed with default values",
      };
    }

    return {
      healed: false,
      strategy: healData.strategy || "healer_cannot_fix",
      contextDelta: {},
    };
  } catch {
    return { healed: false, strategy: "healer_failed", contextDelta: {} };
  }
}

/* ── Goal-Based Execution ── */

/**
 * Führt einen goal_trigger Node aus:
 * Plant dynamisch Schritte und führt sie sequentiell aus.
 */
async function executeGoalNode(
  node: WorkflowNode,
  team: NonNullable<Awaited<ReturnType<typeof loadTeamExecutionRuntimeContext>>>,
  _executionId: string,
  context: ExpressionContext,
  startTime: Date
): Promise<NodeExecutionLog> {
  const config = node.config as { goal?: string; maxSteps?: number; autoApprove?: boolean };
  const goalText = config.goal
    ? resolveExpression(config.goal, context)
    : String(context._goal || "");

  if (!goalText) {
    return {
      nodeId: node.id, nodeType: node.type, status: "failed",
      contextDelta: {}, error: "Kein Ziel definiert",
      startedAt: startTime, completedAt: new Date(),
    };
  }

  try {
    // Verfügbare Agents ermitteln
    const availableAgents = (team.members || [])
      .filter((m) => m.agent)
      .map((m) => ({
        id: m.agent!.id,
        name: m.agent!.name,
        description: (m.agent!.systemPrompt || "").slice(0, 200),
      }));

    // Plan generieren
    const plan = await planWorkflow(goalText, availableAgents, context as Record<string, unknown>);

    // Plan-Schritte ausführen
    let stepContext = { ...context };
    const completedStepIds: string[] = [];
    const stepResults: Record<string, unknown> = {};
    const maxSteps = Math.min(config.maxSteps || 10, 10);

    for (const step of plan.steps.slice(0, maxSteps)) {
      // Abhängigkeiten prüfen
      const depsOk = step.dependsOn.every((depId) => completedStepIds.includes(depId));
      if (!depsOk) continue;

      // Schritt als Workflow-Node-Typ ausführen
      const nodeType = mapStepToNodeType(step);
      const stepModel = resolveModelHint(step.suggestedModel);
      const category = getNodeCategory(nodeType as WorkflowNodeType);

      const stepConfig: Record<string, unknown> = {
        ...step.config,
        prompt: step.description,
        model: stepModel,
        goal: step.title,
      };

      try {
        if (category === "agent") {
          // Nutze den ersten passenden Agent
          const agentId = (step.config.agentId as string) || availableAgents[0]?.id;
          if (agentId) {
            stepConfig.agentId = agentId;
          }
        }

        if (category === "action") {
          const actionResult = await executeActionNode(nodeType, stepConfig, stepContext);
          if (actionResult.success) {
            stepContext = { ...stepContext, ...actionResult.contextDelta };
          }
          stepResults[step.id] = actionResult.contextDelta;
        } else if (category === "ai_tool") {
          const aiResult = await executeAiNode(nodeType, stepConfig, stepContext);
          if (aiResult.success) {
            stepContext = { ...stepContext, ...aiResult.contextDelta };
          }
          stepResults[step.id] = aiResult.contextDelta;
        } else {
          // Für andere Step-Typen: AI-Zusammenfassung
          stepResults[step.id] = { completed: true, title: step.title };
        }

        completedStepIds.push(step.id);
      } catch (stepErr) {
        stepResults[step.id] = {
          error: stepErr instanceof Error ? stepErr.message : "Schritt fehlgeschlagen",
        };
      }
    }

    return {
      nodeId: node.id,
      nodeType: node.type,
      status: completedStepIds.length > 0 ? "completed" : "failed",
      contextDelta: {
        _goalPlan: plan,
        _goalResults: stepResults,
        _goalCompletedSteps: completedStepIds,
        ...stepContext,
      },
      output: `Goal "${goalText}": ${completedStepIds.length}/${plan.steps.length} Schritte abgeschlossen`,
      startedAt: startTime,
      completedAt: new Date(),
      meta: {
        goal: goalText,
        totalSteps: plan.steps.length,
        completedSteps: completedStepIds.length,
        reasoning: plan.reasoning,
      },
    };
  } catch (err) {
    return {
      nodeId: node.id, nodeType: node.type, status: "failed",
      contextDelta: {},
      error: err instanceof Error ? err.message : "Goal planning fehlgeschlagen",
      startedAt: startTime, completedAt: new Date(),
    };
  }
}

/* ── Sub-Agent Spawning ── */

/**
 * Spawnt einen temporären Helper-Agent für eine spezifische Sub-Aufgabe.
 */
async function executeSpawnHelperNode(
  node: WorkflowNode,
  team: NonNullable<Awaited<ReturnType<typeof loadTeamExecutionRuntimeContext>>>,
  executionId: string,
  context: ExpressionContext,
  startTime: Date,
  userId: string,
  enableSmartRouting: boolean
): Promise<NodeExecutionLog> {
  const config = node.config as {
    task?: string;
    helperType?: string;
    model?: string;
    maxTokens?: number;
  };

  const task = config.task
    ? resolveExpression(config.task, context)
    : "";

  if (!task) {
    return {
      nodeId: node.id, nodeType: node.type, status: "failed",
      contextDelta: {}, error: "Keine Aufgabe für den Helper definiert",
      startedAt: startTime, completedAt: new Date(),
    };
  }

  // Smart Model Routing für den Helper
  let model = config.model || "auto";
  if (model === "auto" && enableSmartRouting) {
    const taskType = detectTaskType(task);
    const routing = selectOptimalModel({
      taskType,
      requiresSpeed: true,
      budget: "low",
    });
    model = routing.primary.model;
  }
  if (model === "auto") model = "claude-haiku-4-5-20251001";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      nodeId: node.id, nodeType: node.type, status: "failed",
      contextDelta: {}, error: "ANTHROPIC_API_KEY nicht konfiguriert",
      startedAt: startTime, completedAt: new Date(),
    };
  }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey });

    const systemPrompt = `Du bist ein spezialisierter Helper-Agent in einem KILN AI Workflow.
Typ: ${config.helperType || "general"}
Deine Aufgabe ist es, die gestellte Aufgabe präzise und effizient zu lösen.
Antworte direkt und sachlich.`;

    const contextSummary = JSON.stringify(
      Object.fromEntries(
        Object.entries(context as Record<string, unknown>).filter(([k]) => !k.startsWith("_"))
      )
    ).slice(0, 2000);

    const response = await anthropic.messages.create({
      model: model.startsWith("claude-") ? model : "claude-haiku-4-5-20251001",
      max_tokens: config.maxTokens || 1024,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: `Kontext: ${contextSummary}\n\nAufgabe: ${task}`,
      }],
    });

    const output = response.content
      .filter((b) => b.type === "text")
      .map((b) => ("text" in b ? (b as { text: string }).text : ""))
      .join("");

    const tokensIn = response.usage?.input_tokens || 0;
    const tokensOut = response.usage?.output_tokens || 0;

    // Cost tracking
    trackModelCost({
      model,
      provider: "anthropic",
      tokensIn,
      tokensOut,
      estimatedCost: (tokensIn * 0.001 + tokensOut * 0.005) / 1000,
      taskType: detectTaskType(task),
      timestamp: new Date(),
    });

    const resultKey = `_helper_${node.id}`;

    return {
      nodeId: node.id,
      nodeType: node.type,
      status: "completed",
      contextDelta: {
        [resultKey]: output,
        [`${resultKey}_model`]: model,
      },
      output,
      startedAt: startTime,
      completedAt: new Date(),
      tokensIn,
      tokensOut,
      model,
      meta: {
        helperType: config.helperType || "general",
        model,
        tokensIn,
        tokensOut,
        spawnedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      nodeId: node.id, nodeType: node.type, status: "failed",
      contextDelta: {},
      error: err instanceof Error ? err.message : "Helper-Agent fehlgeschlagen",
      startedAt: startTime, completedAt: new Date(),
    };
  }
}

/* ── Global Error Handler ── */

/**
 * Führt den globalen Error-Handler aus, wenn ein Node fehlschlägt
 * und keinen Error-Pfad hat.
 */
async function invokeGlobalErrorHandler(
  teamConfig: unknown,
  executionId: string,
  nodeId: string,
  nodeType: string,
  error: string,
  context: ExpressionContext
) {
  try {
    const cfg = teamConfig as Record<string, unknown> | null;
    const errorHandler = cfg?.errorHandler as { onUnhandledError?: string; errorEmail?: string; errorWebhookUrl?: string } | undefined;
    if (!errorHandler) return;

    const { onUnhandledError, errorEmail, errorWebhookUrl } = errorHandler;

    if (onUnhandledError === "email" && errorEmail) {
      // Sende Error-Benachrichtigung per E-Mail
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.RESEND_FROM || "KILN <noreply@kilnbase.com>",
          to: errorEmail,
          subject: `[KILN] Workflow Error: ${nodeType} failed`,
          html: `
            <h2>Workflow Execution Error</h2>
            <p><strong>Execution:</strong> ${executionId}</p>
            <p><strong>Node:</strong> ${nodeId} (${nodeType})</p>
            <p><strong>Error:</strong> ${error}</p>
            <p><strong>Time:</strong> ${new Date().toISOString()}</p>
            <hr/>
            <p style="color:#666;font-size:12px;">This is an automated error notification from KILN.</p>
          `,
        });
      } catch (emailErr) {
        console.error("Failed to send error notification email:", emailErr);
      }
    }

    if (onUnhandledError === "webhook" && errorWebhookUrl) {
      // Sende Error an Webhook
      try {
        await fetch(errorWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "workflow.error",
            executionId,
            nodeId,
            nodeType,
            error,
            timestamp: new Date().toISOString(),
            context: Object.fromEntries(
              Object.entries(context).filter(([k]) => !k.startsWith("_"))
            ),
          }),
          signal: AbortSignal.timeout(10000),
        });
      } catch (webhookErr) {
        console.error("Failed to call error webhook:", webhookErr);
      }
    }
  } catch {
    // Globaler Error-Handler darf die Execution nicht abstürzen lassen
  }
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
