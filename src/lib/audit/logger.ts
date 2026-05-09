import type { AuditLog } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";

export type AuditActorType = "USER" | "SYSTEM" | "API" | "CRON" | "WEBHOOK";
export type AuditSeverity = "INFO" | "WARN" | "CRITICAL";

export interface LogAuditArgs {
  orgId: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  actorUserId?: string | null;
  actorOrgId?: string | null;
  actorType?: AuditActorType;
  description?: string | null;
  changes?: { before?: unknown; after?: unknown } | null;
  metadata?: Record<string, unknown> | null;
  severity?: AuditSeverity;
  request?: Pick<NextRequest, "headers" | "url"> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * Append an entry to the system-wide audit log. Best-effort — never throws,
 * never blocks the calling operation. Pass the NextRequest if available so
 * we can capture IP and user-agent automatically.
 */
export async function logAudit(args: LogAuditArgs): Promise<AuditLog | null> {
  try {
    const ip = args.ipAddress ?? extractIpAddress(args.request ?? null);
    const userAgent = args.userAgent ?? args.request?.headers.get("user-agent") ?? null;
    const requestId = args.requestId ?? args.request?.headers.get("x-request-id") ?? null;

    const data: Prisma.AuditLogUncheckedCreateInput = {
      orgId: args.orgId,
      actorUserId: args.actorUserId ?? null,
      actorOrgId: args.actorOrgId ?? null,
      actorType: args.actorType ?? (args.actorUserId ? "USER" : "SYSTEM"),
      action: args.action,
      resourceType: args.resourceType,
      resourceId: args.resourceId ?? null,
      description: args.description ?? null,
      changes: args.changes
        ? (args.changes as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
      metadata: args.metadata
        ? (args.metadata as Prisma.InputJsonValue)
        : Prisma.DbNull,
      ipAddress: ip,
      userAgent,
      requestId,
      severity: args.severity ?? "INFO",
    };
    return await prisma.auditLog.create({ data });
  } catch (err) {
    console.warn("[audit] logAudit failed (swallowed)", err);
    return null;
  }
}

function extractIpAddress(request: { headers: Headers } | null): string | null {
  if (!request) return null;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip") ?? null;
}

/**
 * Compute a shallow before/after diff for changes capture. Only keys whose
 * values differ are kept. Useful when callers want to log just the delta.
 */
export function shallowDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const beforeOut: Record<string, unknown> = {};
  const afterOut: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      beforeOut[key] = a;
      afterOut[key] = b;
    }
  }
  return { before: beforeOut, after: afterOut };
}
