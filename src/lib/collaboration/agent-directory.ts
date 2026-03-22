import { prisma } from "@/lib/prisma";

type Visibility = "private" | "public";

class AgentDirectory {
  /**
   * Agent im Verzeichnis veröffentlichen
   */
  async publishAgent(
    userId: string,
    agentId: string,
    publicName: string,
    publicDescription: string,
    category: string,
    visibility: Visibility
  ) {
    // Prüfen ob Agent dem Nutzer gehört
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, userId },
    });

    if (!agent) {
      throw new Error("Agent nicht gefunden oder keine Berechtigung");
    }

    // Upsert: erstellen oder aktualisieren
    const publication = await prisma.agentPublication.upsert({
      where: { agentId },
      create: {
        agentId,
        userId,
        publicName,
        publicDescription,
        category,
        visibility,
      },
      update: {
        publicName,
        publicDescription,
        category,
        visibility,
      },
    });

    return publication;
  }

  /**
   * Agent aus dem Verzeichnis entfernen
   */
  async unpublishAgent(userId: string, agentId: string) {
    await prisma.agentPublication.deleteMany({
      where: { agentId, userId },
    });
  }

  /**
   * Öffentliche Agents suchen
   */
  async searchPublicAgents(query?: string, category?: string) {
    const where: Record<string, unknown> = {
      visibility: "public",
    };

    if (category) {
      where.category = category;
    }

    if (query) {
      where.OR = [
        { publicName: { contains: query, mode: "insensitive" } },
        { publicDescription: { contains: query, mode: "insensitive" } },
      ];
    }

    const publications = await prisma.agentPublication.findMany({
      where,
      take: 50,
    });

    // Agents separat laden
    const agentIds = publications.map((p) => p.agentId);
    const agents = await prisma.agent.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true, status: true },
    });
    const agentMap = new Map(agents.map((a) => [a.id, a]));

    return publications.map((pub) => ({
      ...pub,
      agent: agentMap.get(pub.agentId) || null,
    }));
  }

  /**
   * Eigene Veröffentlichungen abrufen
   */
  async getMyPublications(userId: string) {
    const publications = await prisma.agentPublication.findMany({
      where: { userId },
    });

    return publications;
  }
}

export const agentDirectory = new AgentDirectory();
