import { prisma } from "@/lib/prisma";
import { type PlanType } from "@/lib/stripe";

interface InstallResult {
  agentId: string;
  setupSteps: string[];
}

interface CreatorStats {
  publishedCount: number;
  totalInstalls: number;
  totalRevenueCents: number;
  templates: { name: string; installs: number; revenue: number }[];
}

// Plan-Hierarchie für Vergleiche
const planHierarchy: Record<string, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  business: 3,
  enterprise: 4,
};

/**
 * Slugifiziert einen Namen und hängt zufällige Zeichen an
 */
function generateUniqueSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const rand = Math.random().toString(36).substring(2, 6);
  return `${base}-${rand}`;
}

/**
 * Installiert einen Marketplace-Agent in den Account des Users.
 * Klont die Agent-Config, erstellt Actions/Custom Tools und gibt Setup-Steps zurück.
 */
export async function installAgent(
  userId: string,
  templateId: string
): Promise<InstallResult> {
  // Template laden
  const template = await prisma.marketplaceTemplate.findUnique({
    where: { id: templateId },
  });

  if (!template || template.status !== "published") {
    throw new Error("Template nicht gefunden oder nicht veröffentlicht");
  }

  // Plan-Check: User muss den erforderlichen Plan haben
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error("User nicht gefunden");
  }

  const userPlan = user.plan as PlanType;
  // AGENCY wird für den Hierarchie-Vergleich auf "business" gemappt
  const userPlanKey = userPlan === "AGENCY" ? "business" : userPlan.toLowerCase();
  const requiredPlan = template.requiredPlan;
  const userLevel = planHierarchy[userPlanKey] ?? 0;
  const requiredLevel = planHierarchy[requiredPlan] ?? 0;

  if (userLevel < requiredLevel) {
    throw new Error(`Upgrade to ${requiredPlan} to install this agent`);
  }

  // Bezahlte Templates: Purchase prüfen
  if (template.price > 0) {
    const existingPurchase = await prisma.marketplacePurchase.findUnique({
      where: {
        userId_templateId: { userId, templateId },
      },
    });

    if (!existingPurchase) {
      throw new Error("Payment required");
    }
  }

  // Agent-Config aus Snapshot extrahieren
  const agentConfig =
    typeof template.agentConfigSnapshot === "string"
      ? JSON.parse(template.agentConfigSnapshot)
      : template.agentConfigSnapshot;

  const slug = generateUniqueSlug(template.name);

  // Agent erstellen
  const agent = await prisma.agent.create({
    data: {
      userId,
      name: agentConfig.name ?? template.name,
      slug,
      systemPrompt: agentConfig.systemPrompt ?? "",
      personality: agentConfig.personality ?? undefined,
      welcomeMessage: agentConfig.welcomeMessage ?? undefined,
      suggestedQuestions: agentConfig.suggestedQuestions ?? [],
      llmModel: agentConfig.llmModel ?? "claude-sonnet-4-20250514",
      temperature: agentConfig.temperature ?? 0.7,
      modelProvider: agentConfig.modelProvider ?? "ANTHROPIC",
      agentMode: agentConfig.agentMode ?? "CHAT",
      status: "DRAFT",
      clonedFromName: template.name,
    },
  });

  // Actions anlegen
  const actions = (agentConfig.actions ?? []) as Array<Record<string, unknown>>;
  if (actions.length > 0) {
    await Promise.all(
      actions.map((action) =>
        prisma.agentAction.create({
          data: {
            agentId: agent.id,
            type: action.type as import("@prisma/client").ActionType,
            enabled: (action.enabled as boolean) ?? false,
            config: action.config as import("@prisma/client").Prisma.InputJsonValue ?? undefined,
          },
        })
      )
    );
  }

  // Custom Tools anlegen (deaktiviert — User muss URLs konfigurieren)
  const customTools = (agentConfig.customTools ?? []) as Array<Record<string, unknown>>;
  if (customTools.length > 0) {
    await Promise.all(
      customTools.map((tool) =>
        prisma.agentCustomTool.create({
          data: {
            agentId: agent.id,
            name: String(tool.name || ""),
            description: String(tool.description || ""),
            method: String(tool.method || "GET"),
            url: String(tool.urlTemplate || tool.url || ""),
            headers: String(tool.headers || ""),
            bodyTemplate: String(tool.bodyTemplate || ""),
            responseMapping: String(tool.responseMapping || ""),
            enabled: false,
          },
        })
      )
    );
  }

  // Setup-Steps zusammenbauen
  const setupSteps: string[] = [
    "Agent erstellt — prüfe die Konfiguration",
  ];

  if (customTools.length > 0) {
    setupSteps.push(
      "Konfiguriere Custom Tool URLs in den Agent-Einstellungen"
    );
  }

  const mcpConnections = template.mcpConnections as Array<Record<string, unknown>> | null;
  if (mcpConnections && mcpConnections.length > 0) {
    const names = mcpConnections.map((c) => String(c.name || "")).join(", ");
    setupSteps.push(`Verbinde MCP Server: ${names}`);
  }

  if (template.workflowConfig) {
    setupSteps.push(
      "Workflow-Vorlage verfügbar — deploy über Workflows"
    );
  }

  // Install-Count erhöhen
  await prisma.marketplaceTemplate.update({
    where: { id: templateId },
    data: { installCount: { increment: 1 } },
  });

  return { agentId: agent.id, setupSteps };
}

/**
 * Zeichnet einen Marketplace-Kauf auf und splittet den Revenue (70/30).
 */
export async function recordPurchase(
  userId: string,
  templateId: string,
  stripePaymentId: string,
  amount: number
): Promise<void> {
  const creatorRevenue = Math.round(amount * 0.7);
  const platformRevenue = amount - creatorRevenue;

  await prisma.marketplacePurchase.create({
    data: {
      userId,
      templateId,
      stripePaymentId,
      amount,
      creatorRevenue,
      platformRevenue,
    },
  });

  await prisma.marketplaceTemplate.update({
    where: { id: templateId },
    data: { installCount: { increment: 1 } },
  });
}

/**
 * Liefert Statistiken für einen Marketplace-Creator.
 */
export async function getCreatorStats(
  userId: string
): Promise<CreatorStats> {
  const templates = await prisma.marketplaceTemplate.findMany({
    where: { authorId: userId, status: "published" },
    select: {
      id: true,
      name: true,
      installCount: true,
    },
  });

  const publishedCount = templates.length;
  const totalInstalls = templates.reduce((sum, t) => sum + t.installCount, 0);

  // Revenue pro Template aggregieren
  const purchases = await prisma.marketplacePurchase.groupBy({
    by: ["templateId"],
    where: {
      template: { authorId: userId },
    },
    _sum: { creatorRevenue: true },
  });

  const revenueByTemplate = new Map(
    purchases.map((p) => [p.templateId, p._sum.creatorRevenue ?? 0])
  );

  const totalRevenueCents = purchases.reduce(
    (sum, p) => sum + (p._sum.creatorRevenue ?? 0),
    0
  );

  const templateStats = templates.map((t) => ({
    name: t.name,
    installs: t.installCount,
    revenue: revenueByTemplate.get(t.id) ?? 0,
  }));

  return {
    publishedCount,
    totalInstalls,
    totalRevenueCents,
    templates: templateStats,
  };
}
