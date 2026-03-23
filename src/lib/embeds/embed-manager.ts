/**
 * Embed Manager
 * Generiert Embed-Codes und verwaltet Embed-Tokens fuer oeffentliche Agent-Komponenten.
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/* ── Types ── */

export const EMBED_COMPONENT_TYPES = [
  "chat",
  "price_table",
  "diff_timeline",
  "agent_status",
  "knowledge_search",
  "report_viewer",
] as const;

export type EmbedComponentType = (typeof EMBED_COMPONENT_TYPES)[number];

export interface EmbedConfig {
  theme: "light" | "dark" | "auto";
  width: string;
  height: string;
  showBranding: boolean;
  primaryColor?: string;
  borderRadius?: string;
}

const DEFAULT_CONFIG: EmbedConfig = {
  theme: "dark",
  width: "100%",
  height: "500px",
  showBranding: true,
  primaryColor: "#F97316",
  borderRadius: "12px",
};

const COMPONENT_LABELS: Record<EmbedComponentType, string> = {
  chat: "Chat Widget",
  price_table: "Preistabelle",
  diff_timeline: "Diff Timeline",
  agent_status: "Agent Status",
  knowledge_search: "Wissenssuche",
  report_viewer: "Report Viewer",
};

export interface EmbedCodeResult {
  embedCode: string;
  iframeCode: string;
  previewUrl: string;
}

export interface TokenValidationResult {
  valid: boolean;
  userId?: string;
  agentId?: string;
  allowedComponents?: EmbedComponentType[] | null;
  error?: string;
}

/* ── Embed Manager ── */

export class EmbedManager {
  private static readonly BASE_URL =
    process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";

  /**
   * Neues Embed-Token generieren und in DB speichern
   */
  static async generateEmbedToken(
    userId: string,
    agentId: string,
    label?: string,
    allowedComponents?: EmbedComponentType[]
  ) {
    const token = crypto.randomBytes(32).toString("hex");

    const record = await prisma.embedToken.create({
      data: {
        userId,
        agentId,
        token,
        label: label || "Embed Token",
        allowedComponents: (allowedComponents ?? undefined) as unknown as import("@prisma/client").Prisma.InputJsonValue | undefined,
      },
    });

    return record;
  }

  /**
   * Token validieren — prüft ob aktiv, aktualisiert lastUsedAt
   */
  static async validateToken(
    token: string,
    agentId?: string,
    componentType?: EmbedComponentType
  ): Promise<TokenValidationResult> {
    const record = await prisma.embedToken.findUnique({ where: { token } });

    if (!record || !record.isActive) {
      return { valid: false, error: "Token ungueltig oder deaktiviert" };
    }

    // Agent-ID pruefen falls angegeben
    if (agentId && record.agentId !== agentId) {
      return { valid: false, error: "Token nicht fuer diesen Agent" };
    }

    // Komponenten-Berechtigung pruefen
    if (componentType) {
      const allowed = record.allowedComponents as string[] | null;
      if (allowed && !allowed.includes(componentType)) {
        return {
          valid: false,
          error: `Komponente "${componentType}" nicht erlaubt`,
        };
      }
    }

    // lastUsedAt aktualisieren (fire-and-forget)
    prisma.embedToken
      .update({
        where: { id: record.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {
        /* non-critical */
      });

    return {
      valid: true,
      userId: record.userId,
      agentId: record.agentId,
      allowedComponents:
        (record.allowedComponents as EmbedComponentType[] | null) || null,
    };
  }

  /**
   * Embed-Code generieren (Script-Tag, iframe, Preview-URL)
   */
  static generateEmbedCode(
    agentId: string,
    componentType: EmbedComponentType,
    token: string,
    config: Partial<EmbedConfig> = {}
  ): EmbedCodeResult {
    const merged = { ...DEFAULT_CONFIG, ...config };
    const previewUrl = `${this.BASE_URL}/embed/components/${agentId}/${componentType}?token=${token}&theme=${merged.theme}&branding=${merged.showBranding}`;

    // Script-basiertes Embed (loader.js)
    const embedCode = `<script src="${this.BASE_URL}/embed/loader.js" data-agent-id="${agentId}" data-component="${componentType}" data-theme="${merged.theme}" data-token="${token}" data-width="${merged.width}" data-height="${merged.height}" data-branding="${merged.showBranding}"></script>`;

    // Iframe-basiertes Embed
    const iframeCode = `<iframe src="${previewUrl}" width="${merged.width}" height="${merged.height}" style="border:none;border-radius:${merged.borderRadius}" allow="clipboard-write" loading="lazy" title="KILN ${COMPONENT_LABELS[componentType]}"></iframe>`;

    return { embedCode, iframeCode, previewUrl };
  }

  /**
   * Alle Embed-Tokens eines Nutzers auflisten
   */
  static async listTokens(userId: string) {
    return prisma.embedToken.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        agentId: true,
        token: true,
        label: true,
        allowedComponents: true,
        rateLimit: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
  }

  /**
   * Token widerrufen (deaktivieren)
   */
  static async revokeToken(tokenId: string, userId: string) {
    return prisma.embedToken.update({
      where: { id: tokenId, userId },
      data: { isActive: false },
    });
  }
}
