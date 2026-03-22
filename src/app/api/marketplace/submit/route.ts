import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

// POST: Agent als Marketplace-Template einreichen
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Plan-Check: Pro oder Agency erforderlich
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, firstName: true, lastName: true, email: true },
    });

    if (!user || user.plan === "FREE") {
      return Response.json(
        { error: "Marketplace-Veröffentlichung erfordert einen Pro- oder Agency-Plan." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      agentId,
      name,
      description,
      longDescription,
      category,
      tags,
      price,
      pricingType,
      screenshots,
      demoConversation,
      requiredPlan,
    } = body;

    // Pflichtfelder validieren
    if (!agentId || !name || !description || !category) {
      return Response.json(
        { error: "agentId, name, description und category sind Pflichtfelder." },
        { status: 400 }
      );
    }

    // Agent laden und Besitz prüfen
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, userId },
      include: {
        actions: true,
        customTools: { where: { enabled: true } },
      },
    });

    if (!agent) {
      return Response.json({ error: "Agent nicht gefunden" }, { status: 404 });
    }

    // Config sanitisieren — Credentials, API-Keys und persönliche White-Label-Daten entfernen
    const sanitizedConfig = {
      name: agent.name,
      systemPrompt: agent.systemPrompt,
      personality: agent.personality,
      welcomeMessage: agent.welcomeMessage,
      suggestedQuestions: agent.suggestedQuestions,
      llmModel: agent.llmModel,
      memoryEnabled: agent.memoryEnabled,
      imageAnalysisEnabled: agent.imageAnalysisEnabled,
      showAiDisclaimer: agent.showAiDisclaimer,
      promptBranches: agent.promptBranches,
      actions: agent.actions.map((a) => ({
        type: a.type,
        enabled: a.enabled,
        // Sensible Config-Werte entfernen (API-Keys, URLs)
        config: a.type === "BOOK_APPOINTMENT" ? { calendlyUrl: "" } : {},
      })),
      // Custom Tools: Struktur beibehalten, URLs und Headers entfernen
      customTools: agent.customTools.map((t) => ({
        name: t.name,
        description: t.description,
        method: t.method,
        url: "[CONFIGURE_URL]",
        headers: {},
        bodyTemplate: t.bodyTemplate,
        responseMapping: t.responseMapping,
      })),
    };

    const authorName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.email.split("@")[0];

    // Template mit Status "pending_review" erstellen
    const template = await prisma.marketplaceTemplate.create({
      data: {
        authorId: userId,
        authorName,
        name,
        description,
        longDescription: longDescription || null,
        category,
        tags: tags || [],
        price: Math.max(0, Number(price) || 0),
        pricingType: pricingType || "free",
        agentConfigSnapshot: sanitizedConfig,
        screenshots: screenshots || null,
        demoConversation: demoConversation || null,
        requiredPlan: requiredPlan || "free",
        status: "pending_review",
        isApproved: false,
      },
    });

    return Response.json({ template }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
