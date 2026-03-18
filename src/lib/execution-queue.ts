import { prisma } from "@/lib/prisma";
import {
  executeTeamExecution,
  loadTeamExecutionRuntimeContext,
} from "@/lib/services/team-runtime";
import type { TeamExecutionTaskInput } from "@/lib/services/team-runtime";

// Priority levels: 0=CRITICAL, 1=HIGH, 2=NORMAL, 3=LOW
export const PRIORITY_LABELS: Record<number, string> = {
  0: "CRITICAL",
  1: "HIGH",
  2: "NORMAL",
  3: "LOW",
};

export const PRIORITY_VALUES: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

export interface PriorityRule {
  field: string;
  operator: ">" | ">=" | "<" | "<=" | "==" | "!=";
  value: number | string | boolean;
  priority: number; // 0-3
}

/**
 * Determine execution priority based on structured output and team priority rules.
 */
export function evaluatePriority(
  structuredOutput: Record<string, unknown>,
  rules: PriorityRule[]
): number {
  let bestPriority = 2; // Default NORMAL

  for (const rule of rules) {
    const fieldValue = structuredOutput[rule.field];
    if (fieldValue === undefined || fieldValue === null) continue;

    let matches = false;
    const numericValue = typeof fieldValue === "number" ? fieldValue : parseFloat(String(fieldValue));
    const ruleNumericValue = typeof rule.value === "number" ? rule.value : parseFloat(String(rule.value));

    switch (rule.operator) {
      case ">":
        matches = numericValue > ruleNumericValue;
        break;
      case ">=":
        matches = numericValue >= ruleNumericValue;
        break;
      case "<":
        matches = numericValue < ruleNumericValue;
        break;
      case "<=":
        matches = numericValue <= ruleNumericValue;
        break;
      case "==":
        matches = String(fieldValue) === String(rule.value);
        break;
      case "!=":
        matches = String(fieldValue) !== String(rule.value);
        break;
    }

    if (matches && rule.priority < bestPriority) {
      bestPriority = rule.priority;
    }
  }

  return bestPriority;
}

/**
 * Get the default priority rules (score-based).
 */
export function getDefaultPriorityRules(): PriorityRule[] {
  return [
    { field: "score", operator: ">", value: 95, priority: 0 },  // CRITICAL
    { field: "score", operator: ">", value: 90, priority: 1 },  // HIGH
  ];
}

/**
 * Parse priority rules from team config.
 */
export function getTeamPriorityRules(config: unknown): PriorityRule[] {
  if (!config || typeof config !== "object" || Array.isArray(config)) return [];
  const c = config as Record<string, unknown>;
  if (!Array.isArray(c.priorityRules)) return getDefaultPriorityRules();
  return c.priorityRules as PriorityRule[];
}

/**
 * Get max concurrent executions from team config.
 */
export function getMaxConcurrent(config: unknown): number {
  if (!config || typeof config !== "object" || Array.isArray(config)) return 5;
  const c = config as Record<string, unknown>;
  return typeof c.maxConcurrent === "number" ? c.maxConcurrent : 5;
}

/**
 * Enqueue an execution with priority. If team has capacity, starts immediately.
 * Otherwise, sets status to QUEUED.
 */
export async function enqueueExecution(
  executionId: string,
  teamId: string,
  priority: number = 2
): Promise<{ queued: boolean }> {
  const team = await prisma.agentTeam.findUnique({
    where: { id: teamId },
    select: { config: true },
  });

  const maxConcurrent = getMaxConcurrent(team?.config);

  // Count currently running executions for this team
  const runningCount = await prisma.teamExecution.count({
    where: {
      teamId,
      status: "RUNNING",
    },
  });

  if (runningCount >= maxConcurrent) {
    // Queue the execution
    await prisma.teamExecution.update({
      where: { id: executionId },
      data: {
        status: "QUEUED",
        priority,
        queuedAt: new Date(),
      },
    });
    return { queued: true };
  }

  // Update priority but keep running
  await prisma.teamExecution.update({
    where: { id: executionId },
    data: { priority },
  });

  return { queued: false };
}

/**
 * Process queued executions by priority for a specific team.
 * Called by cron or after an execution completes.
 */
export async function processQueue(teamId: string): Promise<number> {
  const team = await prisma.agentTeam.findUnique({
    where: { id: teamId },
    select: { id: true, config: true, userId: true },
  });
  if (!team) return 0;

  const maxConcurrent = getMaxConcurrent(team.config);

  const runningCount = await prisma.teamExecution.count({
    where: { teamId, status: "RUNNING" },
  });

  const availableSlots = maxConcurrent - runningCount;
  if (availableSlots <= 0) return 0;

  // Get queued executions ordered by priority (0=highest) then queuedAt
  const queued = await prisma.teamExecution.findMany({
    where: { teamId, status: "QUEUED" },
    orderBy: [{ priority: "asc" }, { queuedAt: "asc" }],
    take: availableSlots,
  });

  let started = 0;
  for (const execution of queued) {
    try {
      await startQueuedExecution(execution.id, team.userId);
      started++;
    } catch (err) {
      console.error(`Failed to start queued execution ${execution.id}:`, err);
    }
  }

  return started;
}

/**
 * Start a previously queued execution.
 */
async function startQueuedExecution(
  executionId: string,
  userId: string
): Promise<void> {
  const execution = await prisma.teamExecution.findUnique({
    where: { id: executionId },
    select: {
      id: true,
      teamId: true,
      goal: true,
      taskPlan: true,
      executionContext: true,
    },
  });

  if (!execution) return;

  // Mark as running
  await prisma.teamExecution.update({
    where: { id: executionId },
    data: { status: "RUNNING", queuedAt: null },
  });

  const team = await loadTeamExecutionRuntimeContext(execution.teamId, userId);
  if (!team) return;

  const taskPlan = execution.taskPlan as TeamExecutionTaskInput[] | null;
  if (!taskPlan || taskPlan.length === 0) return;

  await executeTeamExecution({
    executionId: execution.id,
    team,
    userId,
    goal: execution.goal || "",
    tasks: taskPlan,
    executionContext: (execution.executionContext as Record<string, unknown>) || {},
  });
}

/**
 * Process queues for all teams that have queued executions.
 * Called by the cron job.
 */
export async function processAllQueues(): Promise<{
  teamsProcessed: number;
  executionsStarted: number;
}> {
  // Find all teams with queued executions
  const teamsWithQueued = await prisma.teamExecution.groupBy({
    by: ["teamId"],
    where: { status: "QUEUED" },
  });

  let executionsStarted = 0;
  for (const { teamId } of teamsWithQueued) {
    executionsStarted += await processQueue(teamId);
  }

  return {
    teamsProcessed: teamsWithQueued.length,
    executionsStarted,
  };
}

/**
 * Get queue status for a team.
 */
export async function getQueueStatus(teamId: string): Promise<{
  running: number;
  queued: number;
  maxConcurrent: number;
  queuedByPriority: Record<string, number>;
}> {
  const team = await prisma.agentTeam.findUnique({
    where: { id: teamId },
    select: { config: true },
  });

  const maxConcurrent = getMaxConcurrent(team?.config);

  const [running, queuedExecutions] = await Promise.all([
    prisma.teamExecution.count({
      where: { teamId, status: "RUNNING" },
    }),
    prisma.teamExecution.findMany({
      where: { teamId, status: "QUEUED" },
      select: { priority: true },
    }),
  ]);

  const queuedByPriority: Record<string, number> = {};
  for (const exec of queuedExecutions) {
    const label = PRIORITY_LABELS[exec.priority] || "NORMAL";
    queuedByPriority[label] = (queuedByPriority[label] || 0) + 1;
  }

  return {
    running,
    queued: queuedExecutions.length,
    maxConcurrent,
    queuedByPriority,
  };
}
