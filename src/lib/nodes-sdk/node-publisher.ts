/**
 * Custom Node Publisher
 * Veroeffentlicht, installiert und verwaltet Custom Nodes im Marketplace.
 */

import { prisma } from "@/lib/prisma";
import { validateDefinition } from "./node-runtime";
import type { CustomNodeDefinitionJSON } from "./node-sdk-types";

/* ── Publish ── */

export async function publishNode(
  creatorId: string,
  definition: CustomNodeDefinitionJSON,
  readme?: string
): Promise<{ id: string; nodeId: string; status: string }> {
  const validation = validateDefinition(definition);
  if (!validation.valid) {
    throw new Error(`Ungueltige Definition: ${validation.errors.join(", ")}`);
  }

  // Pruefen ob bereits vorhanden (Update vs. Neu)
  const existing = await prisma.customNode.findUnique({
    where: { nodeId: definition.id },
  });

  if (existing && existing.creatorId !== creatorId) {
    throw new Error("Node-ID gehoert einem anderen Ersteller");
  }

  if (existing) {
    const updated = await prisma.customNode.update({
      where: { nodeId: definition.id },
      data: {
        name: definition.name,
        description: definition.description,
        readme: readme || existing.readme,
        definition: definition as unknown as import("@prisma/client").Prisma.InputJsonValue,
        category: definition.category,
        icon: definition.icon || "puzzle",
        color: definition.color || "#F97316",
        version: definition.version,
        status: "pending_review",
      },
    });
    return { id: updated.id, nodeId: updated.nodeId, status: updated.status };
  }

  const created = await prisma.customNode.create({
    data: {
      creatorId,
      nodeId: definition.id,
      name: definition.name,
      description: definition.description,
      readme,
      definition: definition as unknown as import("@prisma/client").Prisma.InputJsonValue,
      category: definition.category,
      icon: definition.icon || "puzzle",
      color: definition.color || "#F97316",
      version: definition.version,
      status: "pending_review",
    },
  });
  return { id: created.id, nodeId: created.nodeId, status: created.status };
}

/* ── Install ── */

export async function installNode(
  userId: string,
  customNodeId: string
): Promise<{ installed: boolean }> {
  const node = await prisma.customNode.findUnique({ where: { id: customNodeId } });
  if (!node || node.status !== "published") {
    throw new Error("Node nicht gefunden oder nicht veroeffentlicht");
  }

  await prisma.customNodeInstallation.upsert({
    where: {
      userId_customNodeId: { userId, customNodeId },
    },
    update: {},
    create: { userId, customNodeId },
  });

  // Installationszaehler erhoehen
  await prisma.customNode.update({
    where: { id: customNodeId },
    data: { installCount: { increment: 1 } },
  });

  return { installed: true };
}

/* ── Uninstall ── */

export async function uninstallNode(
  userId: string,
  customNodeId: string
): Promise<{ uninstalled: boolean }> {
  const installation = await prisma.customNodeInstallation.findUnique({
    where: {
      userId_customNodeId: { userId, customNodeId },
    },
  });

  if (!installation) {
    throw new Error("Node ist nicht installiert");
  }

  await prisma.$transaction([
    prisma.customNodeInstallation.delete({
      where: {
        userId_customNodeId: { userId, customNodeId },
      },
    }),
    prisma.customNode.update({
      where: { id: customNodeId },
      data: { installCount: { decrement: 1 } },
    }),
  ]);

  return { uninstalled: true };
}

/* ── Browse ── */

export async function getPublishedNodes(opts?: {
  category?: string;
  search?: string;
  sort?: "installs" | "rating" | "newest";
  limit?: number;
  offset?: number;
}) {
  const { category, search, sort = "newest", limit = 20, offset = 0 } = opts || {};

  const where: Record<string, unknown> = { status: "published" };
  if (category) where.category = category;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  const orderBy: Record<string, string> =
    sort === "installs" ? { installCount: "desc" }
    : sort === "rating" ? { rating: "desc" }
    : { createdAt: "desc" };

  const [nodes, total] = await Promise.all([
    prisma.customNode.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
      select: {
        id: true,
        nodeId: true,
        name: true,
        description: true,
        category: true,
        icon: true,
        color: true,
        version: true,
        installCount: true,
        rating: true,
        creatorId: true,
        createdAt: true,
      },
    }),
    prisma.customNode.count({ where }),
  ]);

  return { nodes, total };
}

/* ── Meine Nodes ── */

export async function getMyNodes(creatorId: string) {
  return prisma.customNode.findMany({
    where: { creatorId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      nodeId: true,
      name: true,
      description: true,
      category: true,
      icon: true,
      color: true,
      version: true,
      status: true,
      installCount: true,
      rating: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/* ── Meine Installationen ── */

export async function getMyInstallations(userId: string) {
  return prisma.customNodeInstallation.findMany({
    where: { userId },
    include: {
      customNode: {
        select: {
          id: true,
          nodeId: true,
          name: true,
          description: true,
          category: true,
          icon: true,
          color: true,
          version: true,
        },
      },
    },
    orderBy: { installedAt: "desc" },
  });
}
