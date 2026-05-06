import { CronExpressionParser } from "cron-parser";

export type NodeOnError = "continue" | "retry" | "fallback" | "stop";
export type RateLimitBehavior = "queue" | "reject";

export interface NodeErrorHandlingConfig {
  onError: NodeOnError;
  retryCount: number;
  retryDelayMs: number;
}

export interface NodeRateLimitConfig {
  enabled: boolean;
  maxRequests: number;
  windowMs: number;
  burstSize: number;
  behavior: RateLimitBehavior;
}

export interface NodeScheduleConfig {
  enabled: boolean;
  cron?: string;
  activeDays: number[];
  startTime?: string;
  endTime?: string;
  timezone: string;
}

export interface RateLimitDecision {
  allowed: boolean;
  behavior: RateLimitBehavior;
  retryAfterMs: number;
  remaining: number;
}

export interface ScheduleDecision {
  shouldRun: boolean;
  reason?: string;
}

const WINDOW_PRESETS: Record<string, number> = {
  "10s": 10_000,
  "10_sec": 10_000,
  "1m": 60_000,
  "1_min": 60_000,
  "1h": 60 * 60_000,
  "1_hour": 60 * 60_000,
  "1d": 24 * 60 * 60_000,
  "1_day": 24 * 60 * 60_000,
};

export function normalizeErrorHandlingConfig(config: unknown): NodeErrorHandlingConfig {
  const raw = config && typeof config === "object" && !Array.isArray(config)
    ? (config as Record<string, unknown>)
    : {};
  const errorHandling = raw.errorHandling && typeof raw.errorHandling === "object"
    ? (raw.errorHandling as Record<string, unknown>)
    : raw;
  const onErrorRaw = String(errorHandling.onError || "stop").toLowerCase();
  const onError: NodeOnError =
    onErrorRaw === "continue" || onErrorRaw === "retry" || onErrorRaw === "fallback"
      ? onErrorRaw
      : "stop";
  const retryCount = Math.max(1, Math.min(5, Number(errorHandling.retryCount) || 1));
  const delayRaw = Number(errorHandling.retryDelayMs ?? errorHandling.retryDelaySeconds);

  return {
    onError,
    retryCount,
    retryDelayMs: Math.max(1_000, Math.min(60_000, delayRaw > 100 ? delayRaw : (delayRaw || 1) * 1_000)),
  };
}

export function normalizeRateLimitConfig(config: unknown): NodeRateLimitConfig {
  const raw = config && typeof config === "object" && !Array.isArray(config)
    ? (config as Record<string, unknown>)
    : {};
  const rateLimit = raw.rateLimit && typeof raw.rateLimit === "object"
    ? (raw.rateLimit as Record<string, unknown>)
    : raw;
  const windowKey = String(rateLimit.window || rateLimit.maxRequestsPer || "1m");
  const windowMs = Number(rateLimit.windowMs) || WINDOW_PRESETS[windowKey] || 60_000;
  const maxRequests = Math.max(1, Number(rateLimit.maxRequests) || 60);
  const burstSize = Math.max(1, Number(rateLimit.burstSize) || maxRequests);
  const behaviorRaw = String(rateLimit.behavior || "queue").toLowerCase();

  return {
    enabled: rateLimit.enabled === true,
    maxRequests,
    windowMs,
    burstSize,
    behavior: behaviorRaw === "reject" ? "reject" : "queue",
  };
}

export function normalizeScheduleConfig(config: unknown): NodeScheduleConfig {
  const raw = config && typeof config === "object" && !Array.isArray(config)
    ? (config as Record<string, unknown>)
    : {};
  const schedule = raw.schedule && typeof raw.schedule === "object"
    ? (raw.schedule as Record<string, unknown>)
    : raw;
  const activeDaysRaw = Array.isArray(schedule.activeDays) ? schedule.activeDays : [1, 2, 3, 4, 5, 6, 0];
  const activeDays = activeDaysRaw
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

  return {
    enabled: schedule.enabled === true,
    cron: typeof schedule.cron === "string" ? schedule.cron : undefined,
    activeDays: activeDays.length > 0 ? activeDays : [1, 2, 3, 4, 5, 6, 0],
    startTime: typeof schedule.startTime === "string" ? schedule.startTime : undefined,
    endTime: typeof schedule.endTime === "string" ? schedule.endTime : undefined,
    timezone: typeof schedule.timezone === "string" && schedule.timezone ? schedule.timezone : "UTC",
  };
}

function getZonedParts(now: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    day: dayMap[parts.weekday] ?? now.getUTCDay(),
    minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute || 0),
  };
}

function parseTimeToMinutes(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function evaluateCronDue(cron: string | undefined, timezone: string, now: Date): ScheduleDecision {
  if (!cron?.trim()) return { shouldRun: true };

  try {
    const windowStart = new Date(now.getTime() - 60_000);
    const interval = CronExpressionParser.parse(cron, {
      currentDate: windowStart,
      tz: timezone,
    });
    const nextRun = interval.next().toDate();
    if (nextRun.getTime() <= now.getTime()) return { shouldRun: true };
    return { shouldRun: false, reason: "outside_cron_window" };
  } catch {
    return { shouldRun: false, reason: "invalid_cron" };
  }
}

export function evaluateNodeSchedule(config: unknown, now = new Date()): ScheduleDecision {
  const schedule = normalizeScheduleConfig(config);
  if (!schedule.enabled) return { shouldRun: true };

  const zoned = getZonedParts(now, schedule.timezone);
  if (!schedule.activeDays.includes(zoned.day)) {
    return { shouldRun: false, reason: "outside_active_days" };
  }

  const start = parseTimeToMinutes(schedule.startTime);
  const end = parseTimeToMinutes(schedule.endTime);
  if (start !== null && end !== null) {
    const inWindow = start <= end
      ? zoned.minutes >= start && zoned.minutes <= end
      : zoned.minutes >= start || zoned.minutes <= end;
    if (!inWindow) return { shouldRun: false, reason: "outside_active_hours" };
  }

  const cronDecision = evaluateCronDue(schedule.cron, schedule.timezone, now);
  if (!cronDecision.shouldRun) return cronDecision;

  return { shouldRun: true };
}

export class TokenBucket {
  private tokens: number;
  private updatedAt: number;

  constructor(
    private readonly capacity: number,
    private readonly refillTokens: number,
    private readonly refillWindowMs: number,
    now = Date.now()
  ) {
    this.tokens = capacity;
    this.updatedAt = now;
  }

  take(now = Date.now()): { allowed: boolean; remaining: number; retryAfterMs: number } {
    const elapsed = Math.max(0, now - this.updatedAt);
    const refill = (elapsed / this.refillWindowMs) * this.refillTokens;
    this.tokens = Math.min(this.capacity, this.tokens + refill);
    this.updatedAt = now;

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return { allowed: true, remaining: Math.floor(this.tokens), retryAfterMs: 0 };
    }

    const missing = 1 - this.tokens;
    const retryAfterMs = Math.ceil((missing / this.refillTokens) * this.refillWindowMs);
    return { allowed: false, remaining: 0, retryAfterMs };
  }
}

const tokenBuckets = new Map<string, TokenBucket>();

export function resetWorkflowRateLimitBuckets() {
  tokenBuckets.clear();
}

export function checkNodeRateLimit(
  nodeKey: string,
  config: unknown,
  now = Date.now()
): RateLimitDecision {
  const rateLimit = normalizeRateLimitConfig(config);
  if (!rateLimit.enabled) {
    return { allowed: true, behavior: rateLimit.behavior, retryAfterMs: 0, remaining: rateLimit.burstSize };
  }

  const bucketKey = `${nodeKey}:${rateLimit.maxRequests}:${rateLimit.windowMs}:${rateLimit.burstSize}`;
  let bucket = tokenBuckets.get(bucketKey);
  if (!bucket) {
    bucket = new TokenBucket(rateLimit.burstSize, rateLimit.maxRequests, rateLimit.windowMs, now);
    tokenBuckets.set(bucketKey, bucket);
  }

  const decision = bucket.take(now);
  return {
    allowed: decision.allowed,
    behavior: rateLimit.behavior,
    retryAfterMs: decision.retryAfterMs,
    remaining: decision.remaining,
  };
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function executeWithErrorHandling<T>(
  fn: () => Promise<T>,
  config: unknown
): Promise<{ ok: true; value: T; attempts: number } | { ok: false; error: string; attempts: number }> {
  const errorHandling = normalizeErrorHandlingConfig(config);
  const maxAttempts = errorHandling.onError === "retry" ? errorHandling.retryCount + 1 : 1;
  let lastError = "Execution failed";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return { ok: true, value: await fn(), attempts: attempt };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < maxAttempts) {
        await sleep(errorHandling.retryDelayMs);
      }
    }
  }

  return { ok: false, error: lastError, attempts: maxAttempts };
}
