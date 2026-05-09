import type { WorkflowDeadLetter, WorkflowDeadLetterStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type WorkflowErrorType =
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "AUTH"
  | "NETWORK"
  | "VALIDATION"
  | "NOT_FOUND"
  | "SERVER_ERROR"
  | "UNKNOWN";

export interface ClassifiedWorkflowError {
  type: WorkflowErrorType;
  message: string;
  status?: number;
  retryable: boolean;
}

const RETRYABLE_TYPES = new Set<WorkflowErrorType>([
  "TIMEOUT",
  "RATE_LIMIT",
  "NETWORK",
  "SERVER_ERROR",
]);

/**
 * Map an unknown error into a normalized WorkflowErrorType so retry/branch
 * logic can decide what to do without inspecting raw error messages.
 */
export function classifyWorkflowError(error: unknown): ClassifiedWorkflowError {
  if (error && typeof error === "object") {
    const err = error as Record<string, unknown>;
    const status = typeof err.status === "number" ? err.status : typeof err.statusCode === "number" ? err.statusCode : undefined;
    const message = typeof err.message === "string" ? err.message : String(error);

    if (status === 401 || status === 403) {
      return { type: "AUTH", message, status, retryable: false };
    }
    if (status === 404) {
      return { type: "NOT_FOUND", message, status, retryable: false };
    }
    if (status === 408 || /timeout/i.test(message)) {
      return { type: "TIMEOUT", message, status, retryable: true };
    }
    if (status === 429 || /rate.?limit/i.test(message)) {
      return { type: "RATE_LIMIT", message, status, retryable: true };
    }
    if (status === 422 || /validation|invalid/i.test(message)) {
      return { type: "VALIDATION", message, status, retryable: false };
    }
    if (typeof status === "number" && status >= 500) {
      return { type: "SERVER_ERROR", message, status, retryable: true };
    }
    if (/network|fetch failed|ECONN|ENOTFOUND/i.test(message)) {
      return { type: "NETWORK", message, retryable: true };
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  return { type: "UNKNOWN", message, retryable: false };
}

export type RetryBackoff = "FIXED" | "EXPONENTIAL";

export interface RetryConfig {
  retryCount?: number;
  retryDelayMs?: number;
  backoff?: RetryBackoff;
  /** Restrict retry to these classified types. Default: all retryable types. */
  retryOn?: WorkflowErrorType[];
  /** Hook for tests / scheduling — defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

export interface RetryAttemptInfo {
  attempt: number;
  classified: ClassifiedWorkflowError;
  delayMs: number;
}

export interface RetryRunResult<T> {
  ok: boolean;
  value?: T;
  error?: ClassifiedWorkflowError;
  attempts: RetryAttemptInfo[];
}

/**
 * Run an async function with bounded retries. Default behaviour is no
 * retry (count=0). Callers pass per-node config; the function honours
 * the classified error type and the optional `retryOn` whitelist.
 */
export async function runWithRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {},
): Promise<RetryRunResult<T>> {
  const retryCount = Math.max(0, Math.min(5, config.retryCount ?? 0));
  const baseDelay = Math.max(0, config.retryDelayMs ?? 500);
  const backoff = config.backoff ?? "EXPONENTIAL";
  const sleep = config.sleep ?? defaultSleep;
  const retryOn = config.retryOn?.length ? new Set(config.retryOn) : null;
  const attempts: RetryAttemptInfo[] = [];

  let lastError: ClassifiedWorkflowError | null = null;
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const value = await fn();
      return { ok: true, value, attempts };
    } catch (err) {
      const classified = classifyWorkflowError(err);
      const matchesType = retryOn ? retryOn.has(classified.type) : RETRYABLE_TYPES.has(classified.type);
      const willRetry = attempt < retryCount && classified.retryable && matchesType;
      const delayMs = willRetry
        ? backoff === "EXPONENTIAL"
          ? baseDelay * Math.pow(2, attempt)
          : baseDelay
        : 0;
      attempts.push({ attempt, classified, delayMs });
      lastError = classified;
      if (!willRetry) break;
      if (delayMs > 0) await sleep(delayMs);
    }
  }
  return { ok: false, error: lastError ?? { type: "UNKNOWN", message: "no error captured", retryable: false }, attempts };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RecordDeadLetterArgs {
  agentTeamId: string;
  teamExecutionId?: string | null;
  nodeId: string;
  nodeType: string;
  payload: unknown;
  error: string;
  attempts?: number;
}

/**
 * Append a row to the existing WorkflowDeadLetter table after a final
 * workflow failure. Uses the existing schema (agentTeamId-scoped); the
 * org-level dashboard joins through AgentTeam.orgId.
 */
export async function recordDeadLetter(args: RecordDeadLetterArgs): Promise<WorkflowDeadLetter> {
  return prisma.workflowDeadLetter.create({
    data: {
      agentTeamId: args.agentTeamId,
      teamExecutionId: args.teamExecutionId ?? null,
      nodeId: args.nodeId,
      nodeType: args.nodeType,
      payload: (args.payload ?? null) as never,
      error: args.error.slice(0, 4_000),
      attempts: args.attempts ?? 0,
    },
  });
}

export async function transitionDeadLetterStatus(args: {
  id: string;
  status: WorkflowDeadLetterStatus;
}): Promise<WorkflowDeadLetter> {
  const data: Record<string, unknown> = { status: args.status };
  if (args.status === "RETRIED") data.retriedAt = new Date();
  if (args.status === "DISCARDED") data.discardedAt = new Date();
  return prisma.workflowDeadLetter.update({ where: { id: args.id }, data: data as never });
}
