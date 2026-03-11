import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { canCreateAgent } from "@/lib/plan-limits";

// Load all agents for the user
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agents = await prisma.agent.findMany({
      where: { userId },
      include: {
        _count: { select: { conversations: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(agents);
  } catch (err) {
    console.error("GET /api/agents error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Create new agent
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      slug,
      description,
      systemPrompt,
      personality,
      welcomeMessage,
      suggestedQuestions,
      suggestedActions,
    } = body;

    if (!name || !slug || !systemPrompt) {
      return Response.json(
        { error: "Name, slug, and system prompt are required." },
        { status: 400 }
      );
    }

    // Check plan limit
    const agentCheck = await canCreateAgent(userId);
    if (!agentCheck.allowed) {
      return Response.json(
        { error: `Agent limit reached (${agentCheck.current}/${agentCheck.limit}). Please upgrade your plan.` },
        { status: 403 }
      );
    }

    // Ensure user exists in DB (Clerk Sync)
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `${userId}@clerk.temp` },
    });

    // Check slug collision
    const existingSlug = await prisma.agent.findUnique({ where: { slug } });
    const finalSlug = existingSlug ? `${slug}-${Date.now().toString(36)}` : slug;

    const agent = await prisma.agent.create({
      data: {
        userId,
        name,
        slug: finalSlug,
        description,
        systemPrompt,
        personality: personality || {},
        welcomeMessage: welcomeMessage || "",
        suggestedQuestions: suggestedQuestions || [],
        llmModel: "claude-sonnet-4-20250514",
        status: "DRAFT",
        whiteLabel: { primaryColor: "#F97316", position: "bottom-right" },
        // Create actions from suggested_actions
        actions: {
          create: (() => {
            const typeMap: Record<string, string> = {
              booking: "BOOK_APPOINTMENT",
              email: "COLLECT_EMAIL",
              send_email: "SEND_EMAIL",
              lead_scoring: "SCORE_LEAD",
              notification: "NOTIFY_OWNER",
              webhook: "FIRE_WEBHOOK",
              handoff: "HANDOFF_HUMAN",
            };
            // FAQ is not an action — filter and avoid duplicates
            const seen = new Set<string>();
            return (suggestedActions || [])
              .filter((action: string) => {
                const mapped = typeMap[action];
                if (!mapped || seen.has(mapped)) return false;
                seen.add(mapped);
                return true;
              })
              .map((action: string) => ({
                type: typeMap[action],
                enabled: true,
                config: {},
              }));
          })(),
        },
      },
    });

    return Response.json(agent, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
