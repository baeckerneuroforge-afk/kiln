import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export interface CreatePortalInput {
  userId: string;
  name: string;
  clientEmail: string;
  clientName?: string;
  agentIds: string[];
  branding?: {
    logo?: string;
    primaryColor?: string;
    companyName?: string;
    customCss?: string;
  };
  permissions?: {
    viewAnalytics?: boolean;
    viewConversations?: boolean;
    viewReports?: boolean;
    downloadExports?: boolean;
  };
}

/**
 * ClientPortal — White-Label Dashboard für Agency-Kunden.
 * Token-basierte Auth (kein Clerk), Branding, Agent-Sichtbarkeit.
 */
export class ClientPortal {

  /**
   * Erstellt ein neues Client-Portal.
   */
  static async create(input: CreatePortalInput) {
    const slug = this.generateSlug(input.name);
    const accessToken = crypto.randomBytes(48).toString("hex");
    // Token gültig für 90 Tage
    const tokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60_000);

    return prisma.clientPortal.create({
      data: {
        userId: input.userId,
        name: input.name,
        slug,
        clientEmail: input.clientEmail,
        clientName: input.clientName,
        accessToken,
        tokenExpiresAt,
        branding: input.branding ?? {},
        agentIds: input.agentIds,
        permissions: input.permissions ?? {
          viewAnalytics: true,
          viewConversations: false,
          viewReports: true,
          downloadExports: false,
        },
      },
    });
  }

  /**
   * Authentifiziert einen Portal-Zugriff per Token.
   */
  static async authenticateByToken(token: string) {
    const portal = await prisma.clientPortal.findUnique({
      where: { accessToken: token },
    });

    if (!portal || !portal.isActive) return null;
    if (portal.tokenExpiresAt && portal.tokenExpiresAt < new Date()) return null;

    // Letzten Zugriff aktualisieren
    await prisma.clientPortal.update({
      where: { id: portal.id },
      data: { lastAccessedAt: new Date() },
    });

    return portal;
  }

  /**
   * Authentifiziert per Slug + Token (URL-basiert).
   */
  static async authenticateBySlug(slug: string, token: string) {
    const portal = await prisma.clientPortal.findUnique({
      where: { slug },
    });

    if (!portal || !portal.isActive) return null;
    if (portal.accessToken !== token) return null;
    if (portal.tokenExpiresAt && portal.tokenExpiresAt < new Date()) return null;

    await prisma.clientPortal.update({
      where: { id: portal.id },
      data: { lastAccessedAt: new Date() },
    });

    return portal;
  }

  /**
   * Lädt alle Portale eines Users.
   */
  static async listByUser(userId: string) {
    return prisma.clientPortal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Lädt die Agents die in einem Portal sichtbar sind.
   */
  static async getPortalAgents(portalId: string) {
    const portal = await prisma.clientPortal.findUnique({
      where: { id: portalId },
    });
    if (!portal) return [];

    const agentIds = portal.agentIds as string[];
    return prisma.agent.findMany({
      where: { id: { in: agentIds } },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        status: true,
        createdAt: true,
        analytics: {
          orderBy: { date: "desc" },
          take: 7,
          select: {
            date: true,
            totalConversations: true,
            leadsCollected: true,
            estimatedValue: true,
          },
        },
      },
    });
  }

  /**
   * Lädt Portal-Analytics für die sichtbaren Agents.
   */
  static async getPortalAnalytics(portalId: string) {
    const portal = await prisma.clientPortal.findUnique({
      where: { id: portalId },
    });
    if (!portal) return null;

    const permissions = portal.permissions as Record<string, boolean> | null;
    if (!permissions?.viewAnalytics) return null;

    const agentIds = portal.agentIds as string[];
    const analytics = await prisma.agentAnalytics.findMany({
      where: { agentId: { in: agentIds } },
      orderBy: { date: "desc" },
      take: 30 * agentIds.length,
    });

    // Aggregieren nach Datum
    const byDate = new Map<string, { conversations: number; leads: number; value: number }>();
    for (const a of analytics) {
      const key = a.date.toISOString().slice(0, 10);
      const existing = byDate.get(key) || { conversations: 0, leads: 0, value: 0 };
      existing.conversations += a.totalConversations;
      existing.leads += a.leadsCollected;
      existing.value += a.estimatedValue || 0;
      byDate.set(key, existing);
    }

    return Array.from(byDate.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  /**
   * Aktualisiert ein Portal.
   */
  static async update(portalId: string, userId: string, data: Partial<CreatePortalInput>) {
    return prisma.clientPortal.update({
      where: { id: portalId, userId },
      data: {
        name: data.name,
        clientEmail: data.clientEmail,
        clientName: data.clientName,
        agentIds: data.agentIds,
        branding: data.branding ?? undefined,
        permissions: data.permissions ?? undefined,
      },
    });
  }

  /**
   * Regeneriert den Access-Token eines Portals.
   */
  static async regenerateToken(portalId: string, userId: string) {
    const newToken = crypto.randomBytes(48).toString("hex");
    const tokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60_000);

    return prisma.clientPortal.update({
      where: { id: portalId, userId },
      data: { accessToken: newToken, tokenExpiresAt },
    });
  }

  /**
   * Deaktiviert ein Portal.
   */
  static async deactivate(portalId: string, userId: string) {
    return prisma.clientPortal.update({
      where: { id: portalId, userId },
      data: { isActive: false },
    });
  }

  /**
   * Löscht ein Portal.
   */
  static async remove(portalId: string, userId: string) {
    return prisma.clientPortal.delete({
      where: { id: portalId, userId },
    });
  }

  private static generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const suffix = crypto.randomBytes(4).toString("hex");
    return `${base}-${suffix}`;
  }
}
