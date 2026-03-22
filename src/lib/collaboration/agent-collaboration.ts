import { prisma } from "@/lib/prisma";

type Permission = "read" | "trigger" | "full";

class AgentCollaboration {
  /**
   * Agent mit anderem Nutzer teilen
   */
  async shareAgent(
    ownerUserId: string,
    agentId: string,
    targetUserEmail: string,
    permissions: Permission
  ) {
    // Zielnutzer per E-Mail finden
    const targetUser = await prisma.user.findUnique({
      where: { email: targetUserEmail },
    });

    if (!targetUser) {
      return { error: "User nicht gefunden" };
    }

    // Prüfen ob Link bereits existiert
    const existing = await prisma.collaborationLink.findUnique({
      where: {
        ownerAgentId_targetUserId: {
          ownerAgentId: agentId,
          targetUserId: targetUser.id,
        },
      },
    });

    if (existing) {
      return { error: "Zusammenarbeit existiert bereits", linkId: existing.id };
    }

    // CollaborationLink erstellen
    const link = await prisma.collaborationLink.create({
      data: {
        ownerUserId,
        ownerAgentId: agentId,
        targetUserId: targetUser.id,
        permissions,
        status: "pending",
      },
    });

    return { linkId: link.id, status: "pending" as const };
  }

  /**
   * Einladung annehmen
   */
  async acceptCollaboration(linkId: string, targetUserId: string) {
    const link = await prisma.collaborationLink.findUnique({
      where: { id: linkId },
    });

    if (!link || link.targetUserId !== targetUserId) {
      throw new Error("Link nicht gefunden oder keine Berechtigung");
    }

    const updated = await prisma.collaborationLink.update({
      where: { id: linkId },
      data: { status: "active" },
    });

    return updated;
  }

  /**
   * Zusammenarbeit widerrufen
   */
  async revokeCollaboration(linkId: string, userId: string) {
    const link = await prisma.collaborationLink.findUnique({
      where: { id: linkId },
    });

    if (!link || (link.ownerUserId !== userId && link.targetUserId !== userId)) {
      throw new Error("Link nicht gefunden oder keine Berechtigung");
    }

    await prisma.collaborationLink.update({
      where: { id: linkId },
      data: { status: "revoked" },
    });
  }

  /**
   * Eigene geteilte Agents abrufen
   */
  async getMySharedAgents(userId: string) {
    const links = await prisma.collaborationLink.findMany({
      where: {
        ownerUserId: userId,
        status: "active",
      },
      orderBy: { createdAt: "desc" },
    });

    // Agents und Target-User separat laden
    const agentIds = [...new Set(links.map((l) => l.ownerAgentId))];
    const targetUserIds = [...new Set(links.map((l) => l.targetUserId))];

    const [agents, targetUsers] = await Promise.all([
      prisma.agent.findMany({
        where: { id: { in: agentIds } },
        select: { id: true, name: true, status: true },
      }),
      prisma.user.findMany({
        where: { id: { in: targetUserIds } },
        select: { id: true, email: true, firstName: true },
      }),
    ]);

    const agentMap = new Map(agents.map((a) => [a.id, a]));
    const userMap = new Map(targetUsers.map((u) => [u.id, u]));

    return links.map((link) => ({
      ...link,
      agent: agentMap.get(link.ownerAgentId) || null,
      targetUser: userMap.get(link.targetUserId) || null,
    }));
  }

  /**
   * Mit mir geteilte Agents abrufen
   */
  async getSharedWithMe(userId: string) {
    const links = await prisma.collaborationLink.findMany({
      where: {
        targetUserId: userId,
        status: { in: ["pending", "active"] },
      },
      orderBy: { createdAt: "desc" },
    });

    // Agents und Owner-User separat laden
    const agentIds = [...new Set(links.map((l) => l.ownerAgentId))];
    const ownerUserIds = [...new Set(links.map((l) => l.ownerUserId))];

    const [agents, ownerUsers] = await Promise.all([
      prisma.agent.findMany({
        where: { id: { in: agentIds } },
        select: { id: true, name: true, status: true },
      }),
      prisma.user.findMany({
        where: { id: { in: ownerUserIds } },
        select: { id: true, email: true, firstName: true },
      }),
    ]);

    const agentMap = new Map(agents.map((a) => [a.id, a]));
    const userMap = new Map(ownerUsers.map((u) => [u.id, u]));

    return links.map((link) => ({
      ...link,
      agent: agentMap.get(link.ownerAgentId) || null,
      ownerUser: userMap.get(link.ownerUserId) || null,
    }));
  }

  /**
   * Nachricht an anderen Agent senden (prüft Berechtigung)
   * Eigentliche A2A-Ausführung läuft über das bestehende A2A-Protokoll
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async sendToAgent(
    sourceAgentId: string,
    targetAgentId: string,
    sourceUserId: string,
    message: string,
    data?: Record<string, unknown>
  ) {
    // Berechtigung prüfen: Link zwischen Source-Agent-Owner und Target-Agent
    const link = await prisma.collaborationLink.findFirst({
      where: {
        ownerAgentId: targetAgentId,
        targetUserId: sourceUserId,
        status: "active",
        permissions: { in: ["trigger", "full"] },
      },
    });

    if (!link) {
      throw new Error("Keine Berechtigung");
    }

    // Letzte Aktivität aktualisieren
    await prisma.collaborationLink.update({
      where: { id: link.id },
      data: {
        lastActivityAt: new Date(),
        // Message und Data werden für zukünftige A2A-Integration gespeichert
      },
    });

    return { sent: true, linkId: link.id, message, data };
  }

  /**
   * Alle Kollaborationen eines Nutzers (geteilt + mit mir geteilt)
   */
  async getCollaborations(userId: string) {
    const [shared, sharedWithMe] = await Promise.all([
      this.getMySharedAgents(userId),
      this.getSharedWithMe(userId),
    ]);

    return { shared, sharedWithMe };
  }
}

export const agentCollaboration = new AgentCollaboration();
