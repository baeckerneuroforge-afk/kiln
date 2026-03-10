import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { canCreateAgent } from "@/lib/plan-limits";

// Alle Agents des Users laden
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Nicht autorisiert" }, { status: 401 });
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
    const message = err instanceof Error ? err.message : "Server-Fehler";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Neuen Agent erstellen
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Nicht autorisiert" }, { status: 401 });
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
        { error: "Name, Slug und System-Prompt sind erforderlich." },
        { status: 400 }
      );
    }

    // Plan-Limit prüfen
    const agentCheck = await canCreateAgent(userId);
    if (!agentCheck.allowed) {
      return Response.json(
        { error: `Agent-Limit erreicht (${agentCheck.current}/${agentCheck.limit}). Bitte upgrade deinen Plan.` },
        { status: 403 }
      );
    }

    // User in DB sicherstellen (Clerk Sync)
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `${userId}@clerk.temp` },
    });

    // Slug-Kollision prüfen
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
        // Actions aus suggested_actions erstellen
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
            // FAQ ist keine Action — filtern und Duplikate vermeiden
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
    const message = err instanceof Error ? err.message : "Server-Fehler";
    return Response.json({ error: message }, { status: 500 });
  }
}
