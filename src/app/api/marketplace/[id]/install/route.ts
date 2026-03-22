import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { installAgent } from "@/lib/marketplace/agent-installer";
import { NextRequest } from "next/server";

// POST: Installiert einen Marketplace-Agent in den User-Account
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Template laden und prüfen
    const template = await prisma.marketplaceTemplate.findUnique({
      where: { id: id },
    });

    if (!template || template.status !== "published") {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }

    // Bezahltes Template: Purchase prüfen
    if (template.price > 0) {
      const existingPurchase = await prisma.marketplacePurchase.findUnique({
        where: { userId_templateId: { userId, templateId: id } },
      });

      if (!existingPurchase) {
        return Response.json(
          { error: "Payment required", price: template.price },
          { status: 402 }
        );
      }
    }

    // Agent installieren (klont Config, Actions, Custom Tools)
    const result = await installAgent(userId, id);

    return Response.json({
      agentId: result.agentId,
      setupSteps: result.setupSteps,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
