/**
 * HTTP-Request-Advanced node executor.
 *
 * Adds on top of executeHttpRequest:
 *  - Configurable auth: Bearer, Basic, API-Key (header or query), or none
 *  - Retry config (count + delay + backoff) honoured via runWithRetry
 *  - Per-call timeout override
 *  - Mock-data integration: when `useMockData` is true the executor returns
 *    pinned WorkflowMockData payload without making the request
 */

import {
  resolveExpression,
  resolveExpressionDeep,
  type ExpressionContext,
} from "@/lib/workflow-expressions";
import {
  classifyWorkflowError,
  runWithRetry,
  type RetryBackoff,
  type WorkflowErrorType,
} from "@/lib/workflows/error-handling";
import { pickMockData } from "@/lib/workflows/mock-data";
import type { ActionNodeResult } from "./action-nodes";

export type HttpAuthType = "NONE" | "BEARER" | "BASIC" | "API_KEY_HEADER" | "API_KEY_QUERY";

export interface HttpAdvancedConfig {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
  authType?: HttpAuthType;
  authToken?: string;
  authUsername?: string;
  authPassword?: string;
  authKeyName?: string;
  authKeyValue?: string;
  timeoutMs?: number;
  resultKey?: string;
  retryCount?: number;
  retryDelayMs?: number;
  backoff?: RetryBackoff;
  retryOn?: WorkflowErrorType[];
  useMockData?: boolean;
  mockDataName?: string;
  /** When called from a debug run, callers pass these to enable mock lookup. */
  workflowId?: string;
  nodeId?: string;
  orgId?: string;
}

export async function executeHttpAdvanced(
  config: HttpAdvancedConfig,
  context: ExpressionContext,
): Promise<ActionNodeResult> {
  const resultKey = String(config.resultKey || "httpResponse");
  const url = resolveExpression(String(config.url || ""), context);
  if (!url) {
    return { contextDelta: {}, success: false, error: "URL ist leer" };
  }

  // Mock-data short-circuit
  if (config.useMockData && config.workflowId && config.nodeId && config.orgId) {
    const mock = await pickMockData({
      orgId: config.orgId,
      workflowId: config.workflowId,
      nodeId: config.nodeId,
      name: config.mockDataName,
    });
    if (mock !== null) {
      return {
        contextDelta: { [resultKey]: mock },
        success: true,
        meta: { mocked: true, mockName: config.mockDataName ?? "default" },
      };
    }
  }

  const method = String(config.method || "GET").toUpperCase();
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(config.headers ?? {})) {
    headers[key] = resolveExpression(value, context);
  }
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(config.query ?? {})) {
    query[key] = resolveExpression(value, context);
  }

  applyAuth(headers, query, config, context);

  const timeoutMs = Math.min(120_000, Math.max(1_000, Number(config.timeoutMs) || 30_000));
  const fullUrl = appendQuery(url, query);

  const init: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  };
  if (method !== "GET" && method !== "HEAD" && config.body !== undefined) {
    const resolvedBody = resolveExpressionDeep(config.body, context);
    if (typeof resolvedBody === "string") {
      init.body = resolvedBody;
      if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
    } else {
      init.body = JSON.stringify(resolvedBody);
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
    }
  }

  const result = await runWithRetry(
    async () => {
      const response = await fetch(fullUrl, init);
      const text = await response.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // keep as text
      }
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} ${response.statusText}`) as Error & {
          status: number;
          body: unknown;
        };
        error.status = response.status;
        error.body = parsed;
        throw error;
      }
      return { status: response.status, body: parsed };
    },
    {
      retryCount: config.retryCount,
      retryDelayMs: config.retryDelayMs,
      backoff: config.backoff,
      retryOn: config.retryOn,
    },
  );

  if (!result.ok) {
    const classified = result.error ?? classifyWorkflowError(new Error("unknown"));
    return {
      contextDelta: { [resultKey]: { error: classified.message, type: classified.type, status: classified.status ?? null } },
      success: false,
      error: `${classified.type}: ${classified.message}`,
      meta: {
        attempts: result.attempts.length,
        retried: result.attempts.length > 1,
      },
    };
  }

  return {
    contextDelta: { [resultKey]: result.value },
    success: true,
    meta: { attempts: result.attempts.length },
  };
}

function applyAuth(
  headers: Record<string, string>,
  query: Record<string, string>,
  config: HttpAdvancedConfig,
  context: ExpressionContext,
): void {
  const authType: HttpAuthType = config.authType ?? "NONE";
  switch (authType) {
    case "NONE":
      return;
    case "BEARER": {
      const token = resolveExpression(String(config.authToken || ""), context);
      if (token) headers.Authorization = `Bearer ${token}`;
      return;
    }
    case "BASIC": {
      const user = resolveExpression(String(config.authUsername || ""), context);
      const pass = resolveExpression(String(config.authPassword || ""), context);
      if (user) headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
      return;
    }
    case "API_KEY_HEADER": {
      const name = resolveExpression(String(config.authKeyName || "X-API-Key"), context);
      const value = resolveExpression(String(config.authKeyValue || ""), context);
      if (name && value) headers[name] = value;
      return;
    }
    case "API_KEY_QUERY": {
      const name = resolveExpression(String(config.authKeyName || "api_key"), context);
      const value = resolveExpression(String(config.authKeyValue || ""), context);
      if (name && value) query[name] = value;
      return;
    }
  }
}

function appendQuery(url: string, query: Record<string, string>): string {
  const entries = Object.entries(query).filter(([, value]) => value !== "" && value !== undefined);
  if (entries.length === 0) return url;
  const join = url.includes("?") ? "&" : "?";
  const qs = entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${url}${join}${qs}`;
}
