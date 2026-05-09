import type { DataDeletionRequest } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit/logger";

export type DataDeletionScope = "FULL" | "CUSTOMERS_ONLY" | "AUDIT_ONLY";

const GRACE_PERIOD_DAYS = 30;

export interface CreateDeletionArgs {
  orgId: string;
  requestedByUserId: string;
  scope?: DataDeletionScope;
  reason?: string | null;
  graceUntil?: Date;
}

export async function createDeletionRequest(args: CreateDeletionArgs): Promise<DataDeletionRequest> {
  const graceUntil = args.graceUntil ?? new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 3_600_000);
  const request = await prisma.dataDeletionRequest.create({
    data: {
      orgId: args.orgId,
      requestedByUserId: args.requestedByUserId,
      scope: args.scope ?? "FULL",
      reason: args.reason ?? null,
      graceUntil,
      scheduledFor: graceUntil,
      status: "GRACE_PERIOD",
    },
  });
  await logAudit({
    orgId: args.orgId,
    actorUserId: args.requestedByUserId,
    actorOrgId: args.orgId,
    action: "DSGVO_DELETE_REQUESTED",
    resourceType: "DATA_DELETION",
    resourceId: request.id,
    description: `DSGVO delete requested with ${GRACE_PERIOD_DAYS} day grace period`,
    severity: "CRITICAL",
    metadata: { scope: request.scope, graceUntil: graceUntil.toISOString(), reason: args.reason ?? null },
  });
  return request;
}

export async function cancelDeletionRequest(args: {
  deletionId: string;
  orgId: string;
  actorUserId: string;
}): Promise<DataDeletionRequest | null> {
  const existing = await prisma.dataDeletionRequest.findFirst({
    where: { id: args.deletionId, orgId: args.orgId },
  });
  if (!existing) return null;
  if (existing.status === "COMPLETED" || existing.status === "PROCESSING") {
    throw new Error("Deletion already in progress; cancel window closed");
  }
  const updated = await prisma.dataDeletionRequest.update({
    where: { id: existing.id },
    data: { status: "CANCELLED", scheduledFor: null },
  });
  await logAudit({
    orgId: args.orgId,
    actorUserId: args.actorUserId,
    actorOrgId: args.orgId,
    action: "DSGVO_DELETE_CANCELLED",
    resourceType: "DATA_DELETION",
    resourceId: existing.id,
    description: "DSGVO deletion cancelled during grace period",
    severity: "INFO",
  });
  return updated;
}

export interface ExecutionCounts {
  customerProfiles: number;
  customerMemoryEntries: number;
  customerProfileAudits: number;
  channelMessages: number;
  departments: number;
  slaPolicies: number;
  slaTrackings: number;
  auditLog: number;
}

/**
 * Execute the deletion. Cascading FKs handle most child rows; we keep
 * Stripe invoices (legal retention) and run an explicit count for the
 * audit metadata. The deletion runs in a transaction so an aborted run
 * does not leave the org in a half-deleted state.
 */
export async function executeDeletion(args: {
  deletionId: string;
  now?: Date;
}): Promise<{ request: DataDeletionRequest; counts: ExecutionCounts } | null> {
  const existing = await prisma.dataDeletionRequest.findUnique({ where: { id: args.deletionId } });
  if (!existing) return null;
  if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
    return { request: existing, counts: emptyCounts() };
  }

  await prisma.dataDeletionRequest.update({
    where: { id: existing.id },
    data: { status: "PROCESSING" },
  });

  const counts: ExecutionCounts = await prisma.$transaction(async (tx) => {
    const channelMessages = await tx.departmentChannelMessage.deleteMany({
      where: { department: { orgId: existing.orgId } },
    });
    const customerProfileAudits = await tx.customerProfileAudit.deleteMany({
      where: { orgId: existing.orgId },
    });
    const customerMemoryEntries = await tx.customerMemoryEntry.deleteMany({
      where: { customerProfile: { orgId: existing.orgId } },
    });
    const customerProfiles = await tx.customerProfile.deleteMany({
      where: { orgId: existing.orgId },
    });
    const slaTrackings = await tx.slaTracking.deleteMany({ where: { orgId: existing.orgId } });
    const slaPolicies = await tx.slaPolicy.deleteMany({
      where: { department: { orgId: existing.orgId } },
    });
    const departments = await tx.department.deleteMany({ where: { orgId: existing.orgId } });

    let auditLog = { count: 0 };
    if (existing.scope === "FULL" || existing.scope === "AUDIT_ONLY") {
      auditLog = await tx.auditLog.deleteMany({ where: { orgId: existing.orgId } });
    }
    return {
      customerProfiles: customerProfiles.count,
      customerMemoryEntries: customerMemoryEntries.count,
      customerProfileAudits: customerProfileAudits.count,
      channelMessages: channelMessages.count,
      departments: departments.count,
      slaPolicies: slaPolicies.count,
      slaTrackings: slaTrackings.count,
      auditLog: auditLog.count,
    };
  });

  const updated = await prisma.dataDeletionRequest.update({
    where: { id: existing.id },
    data: {
      status: "COMPLETED",
      executedAt: args.now ?? new Date(),
      itemsDeleted: counts as unknown as Record<string, number>,
    },
  });

  await logAudit({
    orgId: existing.orgId,
    actorType: "SYSTEM",
    action: "DSGVO_DELETE_EXECUTED",
    resourceType: "DATA_DELETION",
    resourceId: existing.id,
    description: "DSGVO deletion executed",
    severity: "CRITICAL",
    metadata: counts as unknown as Record<string, unknown>,
  });

  return { request: updated, counts };
}

export async function findDueDeletions(now: Date = new Date()): Promise<DataDeletionRequest[]> {
  return prisma.dataDeletionRequest.findMany({
    where: {
      status: { in: ["GRACE_PERIOD", "PENDING"] },
      scheduledFor: { lte: now },
    },
  });
}

function emptyCounts(): ExecutionCounts {
  return {
    customerProfiles: 0,
    customerMemoryEntries: 0,
    customerProfileAudits: 0,
    channelMessages: 0,
    departments: 0,
    slaPolicies: 0,
    slaTrackings: 0,
    auditLog: 0,
  };
}
