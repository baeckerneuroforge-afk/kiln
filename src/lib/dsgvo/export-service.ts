import type { DataExportRequest, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit/logger";

export type DataExportScope = "FULL" | "CUSTOMERS_ONLY" | "AGENTS_ONLY" | "AUDIT_ONLY";
export type DataExportFormat = "JSON" | "CSV" | "BOTH";

export interface CreateExportArgs {
  orgId: string;
  requestedByUserId: string;
  scope?: DataExportScope;
  format?: DataExportFormat;
}

const EXPORT_VALIDITY_DAYS = 7;

export async function createExportRequest(args: CreateExportArgs): Promise<DataExportRequest> {
  const expiresAt = new Date(Date.now() + EXPORT_VALIDITY_DAYS * 24 * 3_600_000);
  const request = await prisma.dataExportRequest.create({
    data: {
      orgId: args.orgId,
      requestedByUserId: args.requestedByUserId,
      scope: args.scope ?? "FULL",
      format: args.format ?? "JSON",
      expiresAt,
      status: "PENDING",
    },
  });
  await logAudit({
    orgId: args.orgId,
    actorUserId: args.requestedByUserId,
    actorOrgId: args.orgId,
    action: "DSGVO_EXPORT_REQUESTED",
    resourceType: "DATA_EXPORT",
    resourceId: request.id,
    description: `DSGVO export requested (scope=${request.scope}, format=${request.format})`,
    severity: "INFO",
  });
  return request;
}

export interface ExportPayload {
  exportedAt: string;
  orgId: string;
  scope: DataExportScope;
  customerProfiles: unknown[];
  customerMemoryEntries: unknown[];
  channelMessages: unknown[];
  departments: unknown[];
  departmentWorkers: unknown[];
  slaPolicies: unknown[];
  slaTrackings: unknown[];
  auditLog: unknown[];
}

/**
 * Synchronously gathers all org-scoped data for the requested scope.
 * Streaming/Vercel-Blob upload is left as the caller's responsibility — this
 * function keeps the gather logic isolated and testable.
 */
export async function gatherExportData(args: { orgId: string; scope: DataExportScope }): Promise<ExportPayload> {
  const wantsCustomers = args.scope === "FULL" || args.scope === "CUSTOMERS_ONLY";
  const wantsAgents = args.scope === "FULL" || args.scope === "AGENTS_ONLY";
  const wantsAudit = args.scope === "FULL" || args.scope === "AUDIT_ONLY";

  const [customerProfiles, customerMemoryEntries, channelMessages, departments, departmentWorkers, slaPolicies, slaTrackings, auditLog] = await Promise.all([
    wantsCustomers ? prisma.customerProfile.findMany({ where: { orgId: args.orgId } }) : [],
    wantsCustomers
      ? prisma.customerMemoryEntry.findMany({ where: { customerProfile: { orgId: args.orgId } } })
      : [],
    wantsCustomers
      ? prisma.departmentChannelMessage.findMany({ where: { department: { orgId: args.orgId } } })
      : [],
    wantsAgents ? prisma.department.findMany({ where: { orgId: args.orgId } }) : [],
    wantsAgents
      ? prisma.departmentWorker.findMany({ where: { department: { orgId: args.orgId } } })
      : [],
    wantsAgents
      ? prisma.slaPolicy.findMany({ where: { department: { orgId: args.orgId } } })
      : [],
    wantsAgents ? prisma.slaTracking.findMany({ where: { orgId: args.orgId } }) : [],
    wantsAudit ? prisma.auditLog.findMany({ where: { orgId: args.orgId }, take: 50_000 }) : [],
  ]);

  return {
    exportedAt: new Date().toISOString(),
    orgId: args.orgId,
    scope: args.scope,
    customerProfiles,
    customerMemoryEntries,
    channelMessages,
    departments,
    departmentWorkers,
    slaPolicies,
    slaTrackings,
    auditLog,
  };
}

export interface CompleteExportArgs {
  exportId: string;
  fileUrl: string;
  fileSizeBytes: number;
}

export async function completeExportRequest(args: CompleteExportArgs): Promise<DataExportRequest> {
  const updated = await prisma.dataExportRequest.update({
    where: { id: args.exportId },
    data: {
      status: "READY",
      fileUrl: args.fileUrl,
      fileSizeBytes: BigInt(args.fileSizeBytes),
      completedAt: new Date(),
    },
  });
  await logAudit({
    orgId: updated.orgId,
    actorType: "SYSTEM",
    action: "DSGVO_EXPORT_READY",
    resourceType: "DATA_EXPORT",
    resourceId: updated.id,
    description: `DSGVO export ready (${args.fileSizeBytes} bytes)`,
    severity: "INFO",
  });
  return updated;
}

export async function failExportRequest(args: { exportId: string; errorMessage: string }): Promise<DataExportRequest> {
  const updated = await prisma.dataExportRequest.update({
    where: { id: args.exportId },
    data: { status: "FAILED", errorMessage: args.errorMessage, completedAt: new Date() },
  });
  await logAudit({
    orgId: updated.orgId,
    actorType: "SYSTEM",
    action: "DSGVO_EXPORT_FAILED",
    resourceType: "DATA_EXPORT",
    resourceId: updated.id,
    description: args.errorMessage,
    severity: "WARN",
  });
  return updated;
}

export async function expireOldExports(now: Date = new Date()): Promise<number> {
  const result = await prisma.dataExportRequest.updateMany({
    where: { status: "READY", expiresAt: { lt: now } },
    data: { status: "EXPIRED" } satisfies Prisma.DataExportRequestUpdateManyMutationInput,
  });
  return result.count;
}
