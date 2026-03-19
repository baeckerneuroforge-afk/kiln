/**
 * Orchestration Logger
 * Captures every workflow decision as structured training data.
 * Logs are stored in OrchestrationLog and designed for future model fine-tuning.
 *
 * IMPORTANT: Logging MUST never block execution. Use fire-and-forget or waitUntil().
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/* ── Types ── */

export type OrchestrationEventType =
  | "routing_decision"
  | "agent_selection"
  | "condition_evaluation"
  | "handoff"
  | "parallel_branch"
  | "loop_iteration"
  | "approval_gate"
  | "error_fallback";

export interface OrchestrationInput {
  userMessage?: string;
  availableAgents?: { id: string; name: string; role?: string; model?: string }[];
  sharedMemory?: Record<string, unknown>;
  previousSteps?: { agentName: string; outputSummary: string }[];
}

export interface OrchestrationDecision {
  selectedAgent?: string;
  reason?: string;
  condition?: string;
  conditionResult?: boolean;
  structuredData?: Record<string, unknown>;
}

export interface OrchestrationOutcome {
  success: boolean;
  agentOutput?: string;
  tokensUsed?: number;
  durationMs?: number;
  userSatisfaction?: number | null;
}

export interface OrchestrationEvent {
  teamId: string;
  executionId: string;
  eventType: OrchestrationEventType;
  input: OrchestrationInput;
  decision: OrchestrationDecision;
  outcome: OrchestrationOutcome;
}

/* ── Helpers ── */

/** Truncate string to maxLen chars for storage efficiency */
function truncate(str: string | undefined, maxLen = 500): string {
  if (!str) return "";
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
}

/** Safely convert to Prisma JSON */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

/** Summarize context to avoid storing huge payloads */
function summarizeContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (key.startsWith("_")) continue; // Skip internal keys
    if (typeof value === "string" && value.length > 200) {
      summary[key] = value.slice(0, 200) + "…";
    } else if (typeof value === "object" && value !== null) {
      summary[key] = "[object]";
    } else {
      summary[key] = value;
    }
  }
  return summary;
}

/* ── Core Logger ── */

/**
 * Logs a single orchestration event. Fire-and-forget — errors are swallowed.
 * Call this inside waitUntil() from route handlers, or directly from background tasks.
 */
export async function logOrchestrationEvent(event: OrchestrationEvent): Promise<void> {
  try {
    // Truncate large text fields before storage
    const input: OrchestrationInput = {
      ...event.input,
      userMessage: truncate(event.input.userMessage),
      sharedMemory: event.input.sharedMemory
        ? summarizeContext(event.input.sharedMemory)
        : undefined,
      previousSteps: event.input.previousSteps?.slice(-10).map((s) => ({
        agentName: s.agentName,
        outputSummary: truncate(s.outputSummary, 200),
      })),
    };

    const decision: OrchestrationDecision = {
      ...event.decision,
      reason: truncate(event.decision.reason, 300),
      condition: truncate(event.decision.condition, 200),
    };

    const outcome: OrchestrationOutcome = {
      ...event.outcome,
      agentOutput: truncate(event.outcome.agentOutput),
    };

    await prisma.orchestrationLog.create({
      data: {
        teamId: event.teamId,
        executionId: event.executionId,
        eventType: event.eventType,
        input: toJson(input),
        decision: toJson(decision),
        outcome: toJson(outcome),
      },
    });
  } catch (err) {
    // Never let logging break execution
    console.error("[OrchestrationLogger] Failed to log event:", err);
  }
}

/* ── Convenience Builders ── */

/**
 * Log a routing/logic decision (if_condition, switch, filter)
 */
export function logRoutingDecision(params: {
  teamId: string;
  executionId: string;
  nodeId: string;
  nodeType: string;
  condition: string;
  conditionResult: boolean;
  outputHandle?: string;
  context: Record<string, unknown>;
  durationMs: number;
}): Promise<void> {
  return logOrchestrationEvent({
    teamId: params.teamId,
    executionId: params.executionId,
    eventType: "routing_decision",
    input: {
      sharedMemory: params.context,
    },
    decision: {
      condition: `${params.nodeType}:${params.nodeId} — ${params.condition}`,
      conditionResult: params.conditionResult,
      structuredData: {
        nodeId: params.nodeId,
        nodeType: params.nodeType,
        outputHandle: params.outputHandle,
      },
    },
    outcome: {
      success: true,
      durationMs: params.durationMs,
    },
  });
}

/**
 * Log an agent selection and execution
 */
export function logAgentExecution(params: {
  teamId: string;
  executionId: string;
  nodeId: string;
  agentId: string;
  agentName: string;
  agentRole?: string;
  model?: string;
  input: string;
  output: string;
  success: boolean;
  error?: string;
  tokensUsed?: number;
  durationMs: number;
  previousSteps?: { agentName: string; outputSummary: string }[];
  context: Record<string, unknown>;
}): Promise<void> {
  return logOrchestrationEvent({
    teamId: params.teamId,
    executionId: params.executionId,
    eventType: "agent_selection",
    input: {
      userMessage: params.input,
      sharedMemory: params.context,
      previousSteps: params.previousSteps,
    },
    decision: {
      selectedAgent: params.agentName,
      reason: `Agent node ${params.nodeId} executed`,
      structuredData: {
        agentId: params.agentId,
        agentRole: params.agentRole,
        model: params.model,
      },
    },
    outcome: {
      success: params.success,
      agentOutput: params.success ? params.output : params.error,
      tokensUsed: params.tokensUsed,
      durationMs: params.durationMs,
    },
  });
}

/**
 * Log a handoff between agents
 */
export function logHandoff(params: {
  teamId: string;
  executionId: string;
  sourceAgentId: string;
  sourceAgentName: string;
  targetAgentId: string;
  targetAgentName: string;
  reason: string;
  conversationId?: string;
}): Promise<void> {
  return logOrchestrationEvent({
    teamId: params.teamId,
    executionId: params.executionId,
    eventType: "handoff",
    input: {},
    decision: {
      selectedAgent: params.targetAgentName,
      reason: params.reason,
      structuredData: {
        sourceAgentId: params.sourceAgentId,
        sourceAgentName: params.sourceAgentName,
        targetAgentId: params.targetAgentId,
        conversationId: params.conversationId,
      },
    },
    outcome: { success: true },
  });
}

/**
 * Log an approval gate pause
 */
export function logApprovalGate(params: {
  teamId: string;
  executionId: string;
  nodeId: string;
  approvalType: string;
  context: Record<string, unknown>;
}): Promise<void> {
  return logOrchestrationEvent({
    teamId: params.teamId,
    executionId: params.executionId,
    eventType: "approval_gate",
    input: { sharedMemory: params.context },
    decision: {
      reason: `Approval gate paused: ${params.approvalType}`,
      structuredData: { nodeId: params.nodeId, approvalType: params.approvalType },
    },
    outcome: { success: true },
  });
}

/**
 * Log an error fallback
 */
export function logErrorFallback(params: {
  teamId: string;
  executionId: string;
  nodeId: string;
  nodeType: string;
  error: string;
  fallbackNodeIds: string[];
  context: Record<string, unknown>;
}): Promise<void> {
  return logOrchestrationEvent({
    teamId: params.teamId,
    executionId: params.executionId,
    eventType: "error_fallback",
    input: { sharedMemory: params.context },
    decision: {
      reason: `Error in ${params.nodeType}:${params.nodeId}: ${params.error}`,
      structuredData: {
        nodeId: params.nodeId,
        nodeType: params.nodeType,
        fallbackNodeIds: params.fallbackNodeIds,
      },
    },
    outcome: { success: false, agentOutput: params.error },
  });
}

/* ── Cleanup ── */

/**
 * Delete orchestration logs older than the given number of days.
 * Call from the daily cron job.
 */
export async function cleanupOrchestrationLogs(retentionDays = 90): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const result = await prisma.orchestrationLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  return result.count;
}

/* ── Query helpers for admin API ── */

export interface OrchestrationLogFilters {
  teamId?: string;
  executionId?: string;
  eventType?: OrchestrationEventType;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export async function queryOrchestrationLogs(filters: OrchestrationLogFilters) {
  const where: Prisma.OrchestrationLogWhereInput = {};

  if (filters.teamId) where.teamId = filters.teamId;
  if (filters.executionId) where.executionId = filters.executionId;
  if (filters.eventType) where.eventType = filters.eventType;
  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = filters.from;
    if (filters.to) where.createdAt.lte = filters.to;
  }

  const [logs, total] = await Promise.all([
    prisma.orchestrationLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filters.limit || 100,
      skip: filters.offset || 0,
    }),
    prisma.orchestrationLog.count({ where }),
  ]);

  return { logs, total };
}

/**
 * Export logs as JSONL for fine-tuning.
 * Each line is a self-contained training example with input → decision → outcome.
 */
export async function exportTrainingData(filters: Omit<OrchestrationLogFilters, "limit" | "offset">): Promise<string> {
  const where: Prisma.OrchestrationLogWhereInput = {};
  if (filters.teamId) where.teamId = filters.teamId;
  if (filters.executionId) where.executionId = filters.executionId;
  if (filters.eventType) where.eventType = filters.eventType;
  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = filters.from;
    if (filters.to) where.createdAt.lte = filters.to;
  }

  const logs = await prisma.orchestrationLog.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: 10000, // Hard cap for memory safety
  });

  return logs
    .map((log) =>
      JSON.stringify({
        id: log.id,
        timestamp: log.createdAt.toISOString(),
        teamId: log.teamId,
        executionId: log.executionId,
        eventType: log.eventType,
        input: log.input,
        decision: log.decision,
        outcome: log.outcome,
      })
    )
    .join("\n");
}
