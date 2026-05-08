import type { DepartmentBacklogItem } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { asJsonRecord, toPrismaJson, truncateError } from "./json";
import { invokeDraftedAction } from "./invocation";

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

export async function approveItem(itemId: string, userId: string): Promise<void> {
  const item = await prisma.departmentBacklogItem.findUnique({
    where: { id: itemId },
    include: { department: true },
  });

  if (!item || item.status !== "NEEDS_APPROVAL") {
    throw new Error("Approval item not found or not awaiting approval");
  }

  const draft = asJsonRecord(item.approvalDraft);
  const result = await invokeDraftedAction(draft, {
    departmentId: item.departmentId,
    orgId: item.department.orgId || "",
    userId: item.department.userId,
    backlogItemId: item.id,
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
}

export async function rejectItem(
  itemId: string,
  userId: string,
  reason: string
): Promise<void> {
  const item = await prisma.departmentBacklogItem.findUnique({
    where: { id: itemId },
    select: { status: true },
  });

  if (!item || item.status !== "NEEDS_APPROVAL") {
    throw new Error("Approval item not found or not awaiting approval");
  }

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
}
