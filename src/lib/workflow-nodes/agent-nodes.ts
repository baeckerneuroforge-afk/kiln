/**
 * Agent Node Executor
 * Wrapper um den bestehenden team-runtime runTeamMemberTask.
 * Mappt Workflow-Kontext auf das existierende Interface.
 */

import type { ExpressionContext } from "@/lib/workflow-expressions";
import { resolveExpression } from "@/lib/workflow-expressions";

export interface AgentNodeConfig {
  agentId?: string;
  memberId?: string; // Referenz auf AgentTeamMember
  taskTitle?: string;
  taskDescription?: string;
  goal?: string;
  /** Optionales Input-Template — wird gegen den Kontext resolved */
  inputTemplate?: string;
}

export interface AgentNodeResult {
  output: string;
  structuredOutput: Record<string, unknown>;
  model: string;
  tokensIn: number;
  tokensOut: number;
  estimatedCost: number;
}

/**
 * Erstellt den Task-Input für einen Agent Node aus dem Workflow-Kontext.
 */
export function buildAgentTaskFromContext(
  config: AgentNodeConfig,
  context: ExpressionContext,
  nodeId: string
): {
  taskTitle: string;
  taskDescription: string;
  goal: string;
} {
  const taskTitle = config.taskTitle
    ? resolveExpression(config.taskTitle, context)
    : `Workflow Step: ${nodeId}`;

  const taskDescription = config.taskDescription
    ? resolveExpression(config.taskDescription, context)
    : config.inputTemplate
      ? resolveExpression(config.inputTemplate, context)
      : "";

  const goal = config.goal
    ? resolveExpression(config.goal, context)
    : taskTitle;

  return { taskTitle, taskDescription, goal };
}

/**
 * Mappt das Agent-Ergebnis in den Workflow-Kontext.
 * Schreibt das Ergebnis unter dem Node-Key in den Kontext.
 */
export function mapAgentResultToContext(
  result: AgentNodeResult,
  nodeId: string
): Record<string, unknown> {
  return {
    [`node_${nodeId}`]: {
      output: result.output,
      ...result.structuredOutput,
    },
    // Flache Top-Level-Felder für einfachen Zugriff
    ...result.structuredOutput,
    _lastAgentOutput: result.output,
    _lastAgentModel: result.model,
  };
}
