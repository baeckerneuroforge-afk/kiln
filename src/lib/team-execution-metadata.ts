export const TEAM_EXECUTION_META_KEY = "__meta";

export type TeamExecutionTrigger = "manual" | "scheduled";
export type TeamExecutionRuntimeStrategy =
  | "primary"
  | "fallback_agent"
  | "fallback_model";

export interface TeamExecutionContextMeta {
  trigger?: TeamExecutionTrigger;
  scheduledCron?: string | null;
  scheduledAt?: string | null;
  notifyEmail?: string | null;
  notifyOnComplete?: boolean;
}

export interface TeamTaskRuntimeMeta {
  strategy?: TeamExecutionRuntimeStrategy;
  fallbackEvent?: string | null;
  fallbackAgentId?: string | null;
  fallbackAgentName?: string | null;
  fallbackModel?: string | null;
  maxRetries?: number | null;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function stripExecutionContextMeta(
  context: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...context };
  delete next[TEAM_EXECUTION_META_KEY];
  return next;
}

export function getExecutionContextMeta(
  context: unknown
): TeamExecutionContextMeta {
  const record = toRecord(context);
  const meta = toRecord(record[TEAM_EXECUTION_META_KEY]);

  return {
    trigger:
      meta.trigger === "manual" || meta.trigger === "scheduled"
        ? meta.trigger
        : undefined,
    scheduledCron:
      typeof meta.scheduledCron === "string" ? meta.scheduledCron : null,
    scheduledAt:
      typeof meta.scheduledAt === "string" ? meta.scheduledAt : null,
    notifyEmail:
      typeof meta.notifyEmail === "string" ? meta.notifyEmail : null,
    notifyOnComplete: meta.notifyOnComplete === true,
  };
}

export function setExecutionContextMeta(
  context: Record<string, unknown>,
  meta: TeamExecutionContextMeta
) {
  return {
    ...stripExecutionContextMeta(context),
    [TEAM_EXECUTION_META_KEY]: {
      ...getExecutionContextMeta(context),
      ...meta,
    },
  };
}

export function getTaskRuntimeMeta(input: unknown): TeamTaskRuntimeMeta {
  const record = toRecord(input);
  const runtime = toRecord(record.runtime);

  return {
    strategy:
      runtime.strategy === "primary" ||
      runtime.strategy === "fallback_agent" ||
      runtime.strategy === "fallback_model"
        ? runtime.strategy
        : "primary",
    fallbackEvent:
      typeof runtime.fallbackEvent === "string" ? runtime.fallbackEvent : null,
    fallbackAgentId:
      typeof runtime.fallbackAgentId === "string" ? runtime.fallbackAgentId : null,
    fallbackAgentName:
      typeof runtime.fallbackAgentName === "string"
        ? runtime.fallbackAgentName
        : null,
    fallbackModel:
      typeof runtime.fallbackModel === "string" ? runtime.fallbackModel : null,
    maxRetries:
      typeof runtime.maxRetries === "number" ? runtime.maxRetries : null,
  };
}

export function setTaskRuntimeMeta(
  input: Record<string, unknown>,
  meta: TeamTaskRuntimeMeta
) {
  return {
    ...input,
    runtime: {
      ...toRecord(input.runtime),
      ...meta,
    },
  };
}
