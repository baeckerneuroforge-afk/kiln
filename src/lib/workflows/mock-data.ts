import type { Prisma, WorkflowMockData } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface SaveMockDataArgs {
  orgId: string;
  workflowId: string;
  nodeId: string;
  name: string;
  data: unknown;
  isDefault?: boolean;
}

const MAX_PAYLOAD_BYTES = 256 * 1024; // 256 KB cap to keep editor snappy

export async function saveMockData(args: SaveMockDataArgs): Promise<WorkflowMockData> {
  const serialized = JSON.stringify(args.data ?? null);
  if (Buffer.byteLength(serialized, "utf8") > MAX_PAYLOAD_BYTES) {
    throw new Error(`Mock data exceeds ${MAX_PAYLOAD_BYTES} bytes`);
  }
  if (!args.name?.trim()) throw new Error("Mock data name is required");

  return prisma.$transaction(async (tx) => {
    if (args.isDefault) {
      await tx.workflowMockData.updateMany({
        where: { workflowId: args.workflowId, nodeId: args.nodeId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.workflowMockData.create({
      data: {
        orgId: args.orgId,
        workflowId: args.workflowId,
        nodeId: args.nodeId,
        name: args.name.trim().slice(0, 80),
        data: (args.data ?? null) as Prisma.InputJsonValue,
        isDefault: args.isDefault === true,
      },
    });
  });
}

export interface ListMockDataArgs {
  orgId: string;
  workflowId: string;
  nodeId?: string;
}

export async function listMockData(args: ListMockDataArgs): Promise<WorkflowMockData[]> {
  return prisma.workflowMockData.findMany({
    where: {
      orgId: args.orgId,
      workflowId: args.workflowId,
      ...(args.nodeId ? { nodeId: args.nodeId } : {}),
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
}

export interface PickMockDataArgs {
  orgId: string;
  workflowId: string;
  nodeId: string;
  /** When set, prefer the named entry over the default. */
  name?: string;
}

/**
 * Returns the mock payload to feed into a node during a debug run, or null
 * if no mock is configured. Prefers explicit name match, then default,
 * then most-recent.
 */
export async function pickMockData(args: PickMockDataArgs): Promise<unknown | null> {
  const rows = await prisma.workflowMockData.findMany({
    where: {
      orgId: args.orgId,
      workflowId: args.workflowId,
      nodeId: args.nodeId,
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  if (rows.length === 0) return null;
  if (args.name) {
    const named = rows.find((row) => row.name === args.name);
    if (named) return named.data;
  }
  const def = rows.find((row) => row.isDefault) ?? rows[0];
  return def?.data ?? null;
}

export interface DeleteMockDataArgs {
  orgId: string;
  id: string;
}

export async function deleteMockData(args: DeleteMockDataArgs): Promise<boolean> {
  const result = await prisma.workflowMockData.deleteMany({
    where: { id: args.id, orgId: args.orgId },
  });
  return result.count > 0;
}

export interface SetDefaultMockDataArgs {
  orgId: string;
  id: string;
}

export async function setDefaultMockData(args: SetDefaultMockDataArgs): Promise<WorkflowMockData | null> {
  const existing = await prisma.workflowMockData.findFirst({
    where: { id: args.id, orgId: args.orgId },
  });
  if (!existing) return null;
  return prisma.$transaction(async (tx) => {
    await tx.workflowMockData.updateMany({
      where: { workflowId: existing.workflowId, nodeId: existing.nodeId, isDefault: true },
      data: { isDefault: false },
    });
    return tx.workflowMockData.update({
      where: { id: existing.id },
      data: { isDefault: true },
    });
  });
}
