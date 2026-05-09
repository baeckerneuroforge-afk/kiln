import type { NextRequest } from "next/server";
import { logAudit, type AuditSeverity, type LogAuditArgs } from "./logger";

export interface AuditWrapperOptions {
  action: string;
  resourceType: string;
  severity?: AuditSeverity;
  /** Resolve resource id from the handler's args, e.g. params.id */
  resolveResourceId?: (...args: unknown[]) => string | null | undefined;
  /** Override audit metadata before write */
  enrich?: (args: { result: unknown; error: unknown | null }) => Partial<LogAuditArgs>;
}

/**
 * Wrap an API route handler so each invocation auto-logs an audit entry on
 * success and a WARN entry on failure. The wrapper still re-throws errors
 * so existing error handling continues to work.
 *
 * The first argument of the wrapped handler is expected to be the request
 * (NextRequest) so we can capture IP + user-agent + request id; if it
 * isn't, the audit log just records less context.
 */
export function withAudit<TArgs extends unknown[], TResult>(
  handler: (...args: TArgs) => Promise<TResult>,
  options: AuditWrapperOptions,
  resolveContext: (args: TArgs, result: TResult | null) => {
    orgId: string;
    actorUserId?: string | null;
    actorOrgId?: string | null;
    description?: string | null;
  } | null,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    let result: TResult | null = null;
    let error: unknown = null;
    try {
      result = await handler(...args);
      return result;
    } catch (err) {
      error = err;
      throw err;
    } finally {
      const ctx = resolveContext(args, result);
      if (ctx?.orgId) {
        const enriched = options.enrich?.({ result, error }) ?? {};
        const request = args.find((arg) => isNextRequest(arg)) as NextRequest | undefined;
        await logAudit({
          orgId: ctx.orgId,
          action: options.action,
          resourceType: options.resourceType,
          resourceId: options.resolveResourceId?.(...args) ?? null,
          actorUserId: ctx.actorUserId ?? null,
          actorOrgId: ctx.actorOrgId ?? null,
          description: ctx.description ?? null,
          severity: error ? "WARN" : options.severity ?? "INFO",
          request,
          metadata: error
            ? {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
                ...((enriched.metadata as Record<string, unknown> | undefined) ?? {}),
              }
            : ((enriched.metadata as Record<string, unknown> | undefined) ?? null),
          changes: enriched.changes ?? null,
        });
      }
    }
  };
}

function isNextRequest(value: unknown): value is NextRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "headers" in (value as Record<string, unknown>) &&
    typeof (value as { headers?: { get?: unknown } }).headers?.get === "function"
  );
}
