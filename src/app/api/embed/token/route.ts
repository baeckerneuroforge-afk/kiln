import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  EmbedManager,
  EMBED_COMPONENT_TYPES,
  type EmbedComponentType,
} from "@/lib/embeds/embed-manager";
import { getPlanLimits, type PlanType } from "@/lib/stripe";

/**
 * Aktuellen Plan des Nutzers ermitteln
 */
async function getUserPlanLevel(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  const plan = (user?.plan as PlanType) || "FREE";
  const limits = getPlanLimits(plan);
  return limits.embedComponents;
}

/**
 * GET /api/embed/token — Alle Embed-Tokens des Nutzers auflisten
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Nicht authentifiziert" },
      { status: 401 }
    );
  }

  const planLevel = await getUserPlanLevel(userId);
  if (planLevel === false) {
    return NextResponse.json(
      { error: "Embed-Komponenten sind in deinem Plan nicht verfügbar. Bitte upgrade deinen Plan." },
      { status: 403 }
    );
  }

  const tokens = await EmbedManager.listTokens(userId);
  return NextResponse.json({ tokens });
}

/**
 * POST /api/embed/token — Neues Embed-Token erstellen
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Nicht authentifiziert" },
      { status: 401 }
    );
  }

  const planLevel = await getUserPlanLevel(userId);
  if (planLevel === false) {
    return NextResponse.json(
      { error: "Embed-Komponenten sind in deinem Plan nicht verfügbar. Bitte upgrade deinen Plan." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { agentId, label, allowedComponents } = body as {
      agentId: string;
      label?: string;
      allowedComponents?: EmbedComponentType[];
    };

    if (!agentId) {
      return NextResponse.json(
        { error: "agentId ist erforderlich" },
        { status: 400 }
      );
    }

    // Prüfen ob Agent dem Nutzer gehört
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, userId },
      select: { id: true },
    });

    if (!agent) {
      return NextResponse.json(
        { error: "Agent nicht gefunden" },
        { status: 404 }
      );
    }

    // Komponenten-Berechtigung nach Plan filtern
    let filteredComponents = allowedComponents;
    if (planLevel === "chat_only" && allowedComponents) {
      filteredComponents = allowedComponents.filter((c) => c === "chat");
      if (filteredComponents.length === 0) {
        return NextResponse.json(
          { error: "In deinem Plan ist nur die Chat-Komponente verfügbar." },
          { status: 403 }
        );
      }
    }

    // Erlaubte Komponenten validieren
    if (filteredComponents) {
      const invalid = filteredComponents.filter(
        (c) => !EMBED_COMPONENT_TYPES.includes(c)
      );
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: `Ungültige Komponententypen: ${invalid.join(", ")}` },
          { status: 400 }
        );
      }
    }

    const embedToken = await EmbedManager.generateEmbedToken(
      userId,
      agentId,
      label,
      filteredComponents
    );

    return NextResponse.json({ token: embedToken }, { status: 201 });
  } catch (err) {
    console.error("[EmbedToken] Fehler beim Erstellen:", err);
    return NextResponse.json(
      { error: "Token konnte nicht erstellt werden" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/embed/token — Embed-Token widerrufen
 */
export async function DELETE(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Nicht authentifiziert" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { tokenId } = body as { tokenId: string };

    if (!tokenId) {
      return NextResponse.json(
        { error: "tokenId ist erforderlich" },
        { status: 400 }
      );
    }

    await EmbedManager.revokeToken(tokenId, userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[EmbedToken] Fehler beim Widerrufen:", err);
    return NextResponse.json(
      { error: "Token konnte nicht widerrufen werden" },
      { status: 500 }
    );
  }
}
