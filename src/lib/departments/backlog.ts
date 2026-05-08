import type { DepartmentBacklogItem, TriggerType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toPrismaJson } from "./json";

export async function enqueueTask(args: {
  departmentId: string;
  triggerType: TriggerType;
  triggerPayload: Record<string, unknown>;
}): Promise<DepartmentBacklogItem> {
  return prisma.$transaction(async (tx) => {
    const item = await tx.departmentBacklogItem.create({
      data: {
        departmentId: args.departmentId,
        triggerType: args.triggerType,
        triggerPayload: toPrismaJson(args.triggerPayload),
      },
    });

    await tx.department.update({
      where: { id: args.departmentId },
      data: { totalTasks: { increment: 1 } },
    });

    return item;
  });
}

export async function claimNextPending(
  departmentId: string
): Promise<DepartmentBacklogItem | null> {
  return prisma.$transaction(async (tx) => {
    const next = await tx.departmentBacklogItem.findFirst({
      where: { departmentId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });

    if (!next) return null;

    const claimed = await tx.departmentBacklogItem.updateMany({
      where: { id: next.id, status: "PENDING" },
      data: { status: "CLAIMED", claimedAt: new Date() },
    });

    if (claimed.count !== 1) return null;

    return tx.departmentBacklogItem.findUnique({ where: { id: next.id } });
  });
}

export async function markRunning(itemId: string): Promise<void> {
  await prisma.departmentBacklogItem.update({
    where: { id: itemId },
    data: { status: "RUNNING" },
  });
}

export async function markDone(
  itemId: string,
  result: Record<string, unknown>
): Promise<void> {
  await prisma.departmentBacklogItem.update({
    where: { id: itemId },
    data: {
      status: "DONE",
      completedAt: new Date(),
      result: toPrismaJson(result),
      error: null,
    },
  });
}

export async function markNeedsApproval(
  itemId: string,
  draft: Record<string, unknown>
): Promise<void> {
  await prisma.departmentBacklogItem.update({
    where: { id: itemId },
    data: {
      status: "NEEDS_APPROVAL",
      approvalDraft: toPrismaJson(draft),
    },
  });
}

export async function markFailed(itemId: string, error: string): Promise<void> {
  await prisma.departmentBacklogItem.update({
    where: { id: itemId },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      error,
    },
  });
}
