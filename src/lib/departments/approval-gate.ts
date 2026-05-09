import type { DepartmentBacklogItem } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { OrgScope } from "@/lib/auth/org-scope";
import { asJsonRecord, toPrismaJson, truncateError } from "./json";
import { invokeDraftedAction } from "./invocation";
import { logDepartmentChannelEvent } from "./channels/logging";
import { findActiveTracking, markResolved, recordFirstResponse } from "@/lib/sla/tracker";
import { logAudit } from "@/lib/audit/logger";

export async function getPendingApprovals(
  orgId: string
): Promise<DepartmentBacklogItem[]> {
  return prisma.departmentBacklogItem.findMany({
    where: {
      status: "NEEDS_APPROVAL",
      department: { orgId },
    },
    orderBy: { createdAt: "asc" },
  });
}

function assertItemInScope(
  item: { department: { orgId: string | null; userId: string } } | null,
  scope?: OrgScope
): void {
  if (!scope || !item) return;
  const dept = item.department;
  const matchesOrg = dept.orgId === scope.orgId;
  const matchesLegacy = dept.orgId === null && dept.userId === scope.userId;
  if (!matchesOrg && !matchesLegacy) {
    throw new Error("Approval item not found or not awaiting approval");
  }
}

export async function approveItem(
  itemId: string,
  userId: string,
  scope?: OrgScope
): Promise<void> {
  const item = await prisma.departmentBacklogItem.findUnique({
    where: { id: itemId },
    include: { department: true },
  });

  if (!item || item.status !== "NEEDS_APPROVAL") {
    throw new Error("Approval item not found or not awaiting approval");
  }
  assertItemInScope(item, scope);

  const draft = asJsonRecord(item.approvalDraft);
  const result = await invokeDraftedAction(draft, {
    departmentId: item.departmentId,
    orgId: item.department.orgId || "",
    userId: item.department.userId,
    backlogItemId: item.id,
    approverUserId: userId,
  });

  await prisma.$transaction([
    prisma.departmentBacklogItem.update({
      where: { id: itemId },
      data: {
        status: result.ok ? "DONE" : "FAILED",
        approvedAt: new Date(),
        approvedBy: userId,
        completedAt: new Date(),
        result: toPrismaJson({
          approvalDraft: draft,
          executionResult: result,
        }),
        error: result.ok ? null : truncateError(result.error || "Approved action failed"),
      },
    }),
    prisma.department.update({
      where: { id: item.departmentId },
      data: { totalApprovals: { increment: 1 } },
    }),
  ]);

  await logDepartmentChannelEvent({
    departmentId: item.departmentId,
    backlogItemId: item.id,
    event: "approval_approved",
    approverUserId: userId,
    status: result.ok ? "APPROVED" : "FAILED",
    payload: { draft, result },
  });

  if (result.ok) {
    try {
      const tracking = await findActiveTracking({
        departmentId: item.departmentId,
        conversationId: item.id,
      });
      if (tracking) {
        if (!tracking.firstResponseAt) {
          await recordFirstResponse(tracking.id);
        }
        await markResolved(tracking.id);
      }
    } catch (err) {
      console.warn("[approval-gate] SLA tracking update failed", err);
    }
  }

  if (item.department.orgId) {
    await logAudit({
      orgId: item.department.orgId,
      actorUserId: userId,
      actorOrgId: scope?.orgId ?? null,
      action: "APPROVAL_APPROVED",
      resourceType: "BACKLOG_ITEM",
      resourceId: itemId,
      description: result.ok ? "Approval approved" : "Approval approved but execution failed",
      severity: result.ok ? "INFO" : "WARN",
      metadata: { departmentId: item.departmentId, executionOk: result.ok },
    });
  }
}

export async function rejectItem(
  itemId: string,
  userId: string,
  reason: string,
  scope?: OrgScope
): Promise<void> {
  const item = await prisma.departmentBacklogItem.findUnique({
    where: { id: itemId },
    select: {
      status: true,
      departmentId: true,
      department: { select: { orgId: true, userId: true } },
    },
  });

  if (!item || item.status !== "NEEDS_APPROVAL") {
    throw new Error("Approval item not found or not awaiting approval");
  }
  assertItemInScope(item, scope);

  await prisma.departmentBacklogItem.update({
    where: { id: itemId },
    data: {
      status: "DONE",
      rejectedAt: new Date(),
      rejectedBy: userId,
      rejectionReason: reason,
      completedAt: new Date(),
      result: toPrismaJson({ rejected: true, reason }),
    },
  });

  await logDepartmentChannelEvent({
    departmentId: item.departmentId,
    backlogItemId: itemId,
    event: "approval_rejected",
    approverUserId: userId,
    status: "REJECTED",
    payload: { reason },
  });

  try {
    const tracking = await findActiveTracking({
      departmentId: item.departmentId,
      conversationId: itemId,
    });
    if (tracking) {
      await markResolved(tracking.id);
    }
  } catch (err) {
    console.warn("[approval-gate] SLA tracking close on reject failed", err);
  }

  if (item.department.orgId) {
    await logAudit({
      orgId: item.department.orgId,
      actorUserId: userId,
      actorOrgId: scope?.orgId ?? null,
      action: "APPROVAL_REJECTED",
      resourceType: "BACKLOG_ITEM",
      resourceId: itemId,
      description: `Approval rejected: ${reason}`,
      severity: "INFO",
      metadata: { departmentId: item.departmentId, reason },
    });
  }
}
