import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ActionType } from "@prisma/client";
import { deployWorkflow } from "@/lib/workflow-templates";
import { deployTeamTemplate } from "@/lib/team-templates";
import { NextRequest } from "next/server";
import crypto from "crypto";

function generateSlug(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

// GET: List marketplace templates (public)
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const category = url.searchParams.get("category");
    const search = url.searchParams.get("search");
    const sort = url.searchParams.get("sort") || "popular";
    let authorId = url.searchParams.get("authorId");

    // Resolve "me" to current user
    if (authorId === "me") {
      const { userId } = await auth();
      if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
      authorId = userId;
    }

    const where: Record<string, unknown> = {};
    // When filtering by author, show all their templates (including unapproved)
    if (authorId) {
      where.authorId = authorId;
    } else {
      where.isApproved = true;
    }
    if (category && category !== "all") where.category = category;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const orderBy = sort === "newest"
      ? { createdAt: "desc" as const }
      : sort === "rating"
      ? { rating: "desc" as const }
      : { downloads: "desc" as const };

    const templates = await prisma.marketplaceTemplate.findMany({
      where,
      orderBy,
      take: 50,
    });

    return Response.json({ templates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST: Publish an agent as a template
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Check plan — Pro/Agency/Admin only
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, firstName: true, lastName: true, email: true },
    });
    if (!user || user.plan === "FREE") {
      return Response.json({ error: "Publishing requires a Pro or Agency plan." }, { status: 403 });
    }

    const body = await request.json();
    const { agentId, name, description, category, price, screenshotUrl } = body;

    if (!agentId || !name || !description || !category) {
      return Response.json({ error: "Name, description, and category are required." }, { status: 400 });
    }

    // Load agent with config
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, userId },
      include: {
        actions: true,
        customTools: { where: { enabled: true } },
      },
    });

    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    // Sanitize: strip personal data, API keys, custom tool URLs, white-label, memories
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
        // Strip sensitive config values (API keys, URLs)
        config: a.type === "BOOK_APPOINTMENT" ? { calendlyUrl: "" } : {},
      })),
      // Custom tools: include structure but strip URLs and headers
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

    const authorName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email.split("@")[0];

    const template = await prisma.marketplaceTemplate.create({
      data: {
        authorId: userId,
        authorName,
        name,
        description,
        category,
        price: Math.max(0, Number(price) || 0),
        agentConfigSnapshot: sanitizedConfig,
        screenshotUrl: screenshotUrl || null,
      },
    });

    return Response.json({ template }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// PATCH: Use template (clone to user's account) or rate template
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    // Rate a template
    if (body.action === "rate") {
      const { templateId, rating } = body;
      if (!templateId || !rating || rating < 1 || rating > 5) {
        return Response.json({ error: "Valid templateId and rating (1-5) required" }, { status: 400 });
      }

      await prisma.marketplaceRating.upsert({
        where: { userId_templateId: { userId, templateId } },
        create: { userId, templateId, rating },
        update: { rating },
      });

      // Recalculate average
      const agg = await prisma.marketplaceRating.aggregate({
        where: { templateId },
        _avg: { rating: true },
        _count: { rating: true },
      });

      await prisma.marketplaceTemplate.update({
        where: { id: templateId },
        data: {
          rating: Math.round((agg._avg.rating || 0) * 10) / 10,
          ratingCount: agg._count.rating,
        },
      });

      return Response.json({ success: true, rating: agg._avg.rating, count: agg._count.rating });
    }

    // Use template (clone)
    if (body.action === "use") {
      const { templateId } = body;
      if (!templateId) return Response.json({ error: "Template ID required" }, { status: 400 });

      const template = await prisma.marketplaceTemplate.findUnique({
        where: { id: templateId },
      });

      if (!template) return Response.json({ error: "Template not found" }, { status: 404 });

      // Check if paid template requires purchase
      if (template.price > 0) {
        const purchase = await prisma.marketplacePurchase.findUnique({
          where: { userId_templateId: { userId, templateId } },
        });
        if (!purchase) {
          return Response.json({ error: "Purchase required", requiresPayment: true, price: template.price }, { status: 402 });
        }
      }

      const config = template.agentConfigSnapshot as Record<string, unknown>;

      if (typeof config.teamTemplateId === "string") {
        const deployedTeam = await deployTeamTemplate(userId, config.teamTemplateId);

        await prisma.marketplaceTemplate.update({
          where: { id: templateId },
          data: { downloads: { increment: 1 } },
        });

        return Response.json({
          teamId: deployedTeam.teamId,
          teamName: deployedTeam.teamName,
          agentIds: deployedTeam.agentIds,
        });
      }

      if (typeof config.workflowTemplateId === "string") {
        const workflow = await deployWorkflow(userId, config.workflowTemplateId);

        await prisma.marketplaceTemplate.update({
          where: { id: templateId },
          data: { downloads: { increment: 1 } },
        });

        return Response.json({
          teamId: workflow.teamId,
          teamName: workflow.teamName,
          agentIds: workflow.agentIds,
        });
      }

      // Create agent from template
      const agent = await prisma.agent.create({
        data: {
          userId,
          name: (config.name as string) || template.name,
          slug: generateSlug(template.name),
          description: template.description,
          systemPrompt: (config.systemPrompt as string) || "",
          personality: config.personality as object ?? undefined,
          welcomeMessage: config.welcomeMessage as string ?? null,
          suggestedQuestions: (config.suggestedQuestions as string[]) || [],
          llmModel: (config.llmModel as string) || "claude-sonnet-4-20250514",
          status: "DRAFT",
          memoryEnabled: (config.memoryEnabled as boolean) || false,
          imageAnalysisEnabled: (config.imageAnalysisEnabled as boolean) || false,
          showAiDisclaimer: (config.showAiDisclaimer as boolean) !== false,
          promptBranches: config.promptBranches as object ?? undefined,
        },
      });

      // Clone actions
      const actions = (config.actions as { type: string; enabled: boolean; config: object }[]) || [];
      if (actions.length > 0) {
        await prisma.agentAction.createMany({
          data: actions.map((a) => ({
            agentId: agent.id,
            type: a.type as ActionType,
            enabled: a.enabled,
            config: a.config ?? undefined,
          })),
        });
      }

      // Clone custom tools (with placeholder URLs)
      const tools = (config.customTools as { name: string; description: string; method: string; url: string; bodyTemplate: string | null; responseMapping: string | null }[]) || [];
      if (tools.length > 0) {
        await prisma.agentCustomTool.createMany({
          data: tools.map((t) => ({
            agentId: agent.id,
            name: t.name,
            description: t.description,
            method: t.method,
            url: t.url,
            bodyTemplate: t.bodyTemplate,
            responseMapping: t.responseMapping,
            enabled: false, // Disabled by default — user must configure URLs
          })),
        });
      }

      // Increment download count
      await prisma.marketplaceTemplate.update({
        where: { id: templateId },
        data: { downloads: { increment: 1 } },
      });

      return Response.json({ agentId: agent.id, agentName: agent.name });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// DELETE: Remove a template (author only)
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { templateId } = await request.json();
    if (!templateId) return Response.json({ error: "Template ID required" }, { status: 400 });

    const template = await prisma.marketplaceTemplate.findFirst({
      where: { id: templateId, authorId: userId },
    });
    if (!template) return Response.json({ error: "Template not found" }, { status: 404 });

    await prisma.marketplaceTemplate.delete({ where: { id: templateId } });
    return Response.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
