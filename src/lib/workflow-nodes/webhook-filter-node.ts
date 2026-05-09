/**
 * Webhook-Filter node — passes/blocks workflow execution based on filter
 * conditions against the incoming trigger payload. Pure logic, no I/O.
 */

import { resolveExpression, type ExpressionContext } from "@/lib/workflow-expressions";
import type { ActionNodeResult } from "./action-nodes";

export type FilterOperator =
  | "EQUALS"
  | "NOT_EQUALS"
  | "CONTAINS"
  | "NOT_CONTAINS"
  | "STARTS_WITH"
  | "ENDS_WITH"
  | "REGEX"
  | "EXISTS"
  | "NOT_EXISTS"
  | "GREATER_THAN"
  | "LESS_THAN";

export interface FilterCondition {
  /** JSONPath-ish dotted path into the trigger payload, e.g. "headers.X-Source". */
  path: string;
  operator: FilterOperator;
  value?: string | number;
}

export interface WebhookFilterConfig {
  /** Conditions are AND-combined by default, OR if `combine: "OR"`. */
  conditions: FilterCondition[];
  combine?: "AND" | "OR";
  resultKey?: string;
  /** Source of payload in context — defaults to `trigger`. */
  payloadKey?: string;
}

export function executeWebhookFilter(
  config: WebhookFilterConfig,
  context: ExpressionContext,
): ActionNodeResult {
  const payloadKey = String(config.payloadKey || "trigger");
  const payload = (context as Record<string, unknown>)[payloadKey];
  if (!payload || typeof payload !== "object") {
    return {
      contextDelta: { [config.resultKey ?? "filter"]: { passed: false, reason: "no-payload" } },
      success: true,
      meta: { passed: false },
    };
  }
  const conditions = Array.isArray(config.conditions) ? config.conditions : [];
  if (conditions.length === 0) {
    return {
      contextDelta: { [config.resultKey ?? "filter"]: { passed: true, reason: "no-conditions" } },
      success: true,
      meta: { passed: true },
    };
  }

  const results = conditions.map((condition) => evaluate(condition, payload as Record<string, unknown>, context));
  const passed = config.combine === "OR" ? results.some(Boolean) : results.every(Boolean);
  return {
    contextDelta: {
      [config.resultKey ?? "filter"]: {
        passed,
        results,
      },
    },
    success: true,
    meta: { passed, count: conditions.length },
  };
}

function evaluate(
  condition: FilterCondition,
  payload: Record<string, unknown>,
  context: ExpressionContext,
): boolean {
  const actual = readPath(payload, condition.path);
  const expected = typeof condition.value === "string"
    ? resolveExpression(condition.value, context)
    : condition.value;
  switch (condition.operator) {
    case "EQUALS":
      return String(actual ?? "") === String(expected ?? "");
    case "NOT_EQUALS":
      return String(actual ?? "") !== String(expected ?? "");
    case "CONTAINS":
      return typeof actual === "string" && actual.includes(String(expected ?? ""));
    case "NOT_CONTAINS":
      return typeof actual !== "string" || !actual.includes(String(expected ?? ""));
    case "STARTS_WITH":
      return typeof actual === "string" && actual.startsWith(String(expected ?? ""));
    case "ENDS_WITH":
      return typeof actual === "string" && actual.endsWith(String(expected ?? ""));
    case "REGEX":
      try {
        return typeof actual === "string" && new RegExp(String(expected ?? "")).test(actual);
      } catch {
        return false;
      }
    case "EXISTS":
      return actual !== undefined && actual !== null;
    case "NOT_EXISTS":
      return actual === undefined || actual === null;
    case "GREATER_THAN":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "LESS_THAN":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    default:
      return false;
  }
}

function readPath(payload: Record<string, unknown>, path: string): unknown {
  const segments = path.split(".").filter(Boolean);
  let cursor: unknown = payload;
  for (const segment of segments) {
    if (cursor === null || cursor === undefined) return undefined;
    if (typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}
