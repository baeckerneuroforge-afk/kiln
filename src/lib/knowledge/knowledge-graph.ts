import { prisma } from "@/lib/prisma";

// Entity-Typen für den Knowledge Graph
export type EntityType =
  | "Company"
  | "Person"
  | "Product"
  | "Website"
  | "Price"
  | "Event"
  | "Document"
  | "Insight";

export interface EntitySource {
  agentId: string;
  executionId?: string;
  timestamp: Date;
}

export interface EntityInput {
  type: EntityType;
  name: string;
  properties: Record<string, unknown>;
  source: EntitySource;
}

export interface GraphOptions {
  type?: string;
  agentId?: string;
  limit?: number;
}

/**
 * KnowledgeGraph — verwaltet Entitäten, Relationen und Events
 * für den nutzerspezifischen Knowledge Graph.
 */
class KnowledgeGraph {
  /**
   * Entität hinzufügen oder aktualisieren (Upsert).
   * Bei existierender Entität werden Properties gemerged (neuere Werte gewinnen)
   * und die Source zum sources-Array hinzugefügt.
   */
  async addEntity(userId: string, entity: EntityInput) {
    const existing = await prisma.knowledgeEntity.findUnique({
      where: {
        userId_type_name: {
          userId,
          type: entity.type,
          name: entity.name,
        },
      },
    });

    if (existing) {
      // Deep merge: bestehende Properties mit neuen mergen (neuere gewinnen)
      const existingProps =
        (existing.properties as Record<string, unknown>) || {};
      const mergedProperties = { ...existingProps, ...entity.properties };

      // Source zum Array hinzufügen
      const existingSources = (existing.sources as unknown as EntitySource[]) || [];
      const updatedSources = [
        ...existingSources,
        {
          agentId: entity.source.agentId,
          executionId: entity.source.executionId,
          timestamp: entity.source.timestamp,
        },
      ];

      const updated = await prisma.knowledgeEntity.update({
        where: { id: existing.id },
        data: {
          properties: mergedProperties as unknown as import("@prisma/client").Prisma.InputJsonValue,
          sources: updatedSources as unknown as import("@prisma/client").Prisma.InputJsonValue,
        },
      });

      // Event: updated
      await prisma.knowledgeEvent.create({
        data: {
          entityId: existing.id,
          eventType: "updated",
          previousValue: existingProps as unknown as import("@prisma/client").Prisma.InputJsonValue,
          newValue: mergedProperties as unknown as import("@prisma/client").Prisma.InputJsonValue,
          sourceAgentId: entity.source.agentId,
          sourceExecutionId: entity.source.executionId,
        },
      });

      return updated;
    }

    // Neue Entität erstellen
    const created = await prisma.knowledgeEntity.create({
      data: {
        userId,
        type: entity.type,
        name: entity.name,
        properties: entity.properties as unknown as import("@prisma/client").Prisma.InputJsonValue,
        sources: [
          {
            agentId: entity.source.agentId,
            executionId: entity.source.executionId,
            timestamp: entity.source.timestamp,
          },
        ] as unknown as import("@prisma/client").Prisma.InputJsonValue,
      },
    });

    // Event: created
    await prisma.knowledgeEvent.create({
      data: {
        entityId: created.id,
        eventType: "created",
        newValue: entity.properties as unknown as import("@prisma/client").Prisma.InputJsonValue,
        sourceAgentId: entity.source.agentId,
        sourceExecutionId: entity.source.executionId,
      },
    });

    return created;
  }

  /**
   * Relation zwischen zwei Entitäten erstellen.
   */
  async addRelation(
    userId: string,
    fromEntityId: string,
    toEntityId: string,
    relationType: string,
    properties?: Record<string, unknown>,
    sourceAgentId?: string,
    sourceExecutionId?: string
  ) {
    const relation = await prisma.knowledgeRelation.create({
      data: {
        userId,
        fromEntityId,
        toEntityId,
        relationType,
        properties: (properties ?? undefined) as unknown as import("@prisma/client").Prisma.InputJsonValue | undefined,
        sourceAgentId,
        sourceExecutionId,
      },
    });

    // Event auf der From-Entität
    await prisma.knowledgeEvent.create({
      data: {
        entityId: fromEntityId,
        eventType: "relation_added",
        newValue: {
          relationType,
          toEntityId,
          properties: properties ?? null,
        } as unknown as import("@prisma/client").Prisma.InputJsonValue,
        sourceAgentId,
        sourceExecutionId,
      },
    });

    return relation;
  }

  /**
   * Keyword-Suche über Entitätsnamen und Properties.
   * Gibt gefundene Entitäten mit ihren Relationen zurück.
   */
  async search(userId: string, query: string) {
    const searchTerm = `%${query}%`;

    // Suche in Name und Properties (als Text gecastet)
    const entities = await prisma.$queryRaw<
      Array<{
        id: string;
        userId: string;
        type: string;
        name: string;
        properties: unknown;
        sources: unknown;
        createdAt: Date;
        updatedAt: Date;
      }>
    >`
      SELECT * FROM "KnowledgeEntity"
      WHERE "userId" = ${userId}
        AND (
          "name" ILIKE ${searchTerm}
          OR CAST("properties" AS TEXT) ILIKE ${searchTerm}
        )
      ORDER BY "updatedAt" DESC
      LIMIT 50
    `;

    if (entities.length === 0) {
      return { entities: [], relations: [] };
    }

    const entityIds = entities.map((e) => e.id);

    // Relationen laden, die diese Entitäten betreffen
    const relations = await prisma.knowledgeRelation.findMany({
      where: {
        OR: [
          { fromEntityId: { in: entityIds } },
          { toEntityId: { in: entityIds } },
        ],
      },
      include: {
        fromEntity: true,
        toEntity: true,
      },
    });

    return { entities, relations };
  }

  /**
   * Vollständige Event-Historie einer Entität laden.
   */
  async getEntityHistory(entityId: string) {
    const events = await prisma.knowledgeEvent.findMany({
      where: { entityId },
      orderBy: { createdAt: "desc" },
      include: {
        entity: true,
      },
    });

    return events;
  }

  /**
   * Vollständigen Graph für Visualisierung laden.
   * Optionale Filter nach Typ, AgentId, Limit.
   */
  async getGraph(userId: string, options?: GraphOptions) {
    const where: Record<string, unknown> = { userId };

    if (options?.type) {
      where.type = options.type;
    }

    // Filter nach AgentId: nur Entitäten, die von diesem Agent stammen
    // Sources ist ein JSON-Array, daher Raw Query für AgentId-Filter
    let nodes;
    if (options?.agentId) {
      nodes = await prisma.$queryRaw<
        Array<{
          id: string;
          userId: string;
          type: string;
          name: string;
          properties: unknown;
          sources: unknown;
          createdAt: Date;
          updatedAt: Date;
        }>
      >`
        SELECT * FROM "KnowledgeEntity"
        WHERE "userId" = ${userId}
          ${options.type ? prisma.$queryRaw`AND "type" = ${options.type}` : prisma.$queryRaw``}
          AND CAST("sources" AS TEXT) LIKE ${`%${options.agentId}%`}
        ORDER BY "updatedAt" DESC
        LIMIT ${options?.limit ?? 200}
      `;
    } else {
      nodes = await prisma.knowledgeEntity.findMany({
        where: {
          userId,
          ...(options?.type ? { type: options.type } : {}),
        },
        orderBy: { updatedAt: "desc" },
        take: options?.limit ?? 200,
      });
    }

    const nodeIds = nodes.map((n) => n.id);

    // Edges: Relationen zwischen den geladenen Nodes
    const edges =
      nodeIds.length > 0
        ? await prisma.knowledgeRelation.findMany({
            where: {
              OR: [
                { fromEntityId: { in: nodeIds } },
                { toEntityId: { in: nodeIds } },
              ],
            },
          })
        : [];

    return { nodes, edges };
  }

  /**
   * Einzelne Entität mit allen Relationen und Events laden.
   */
  async getEntity(entityId: string) {
    const entity = await prisma.knowledgeEntity.findUnique({
      where: { id: entityId },
      include: {
        relationsFrom: {
          include: { toEntity: true },
        },
        relationsTo: {
          include: { fromEntity: true },
        },
        events: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    return entity;
  }
}

export const knowledgeGraph = new KnowledgeGraph();
