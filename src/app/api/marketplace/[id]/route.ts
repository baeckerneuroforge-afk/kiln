import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

// GET: Load single marketplace template with reviews, ratings, and purchase status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await auth();

    // Lade Template mit Reviews und Ratings
    const template = await prisma.marketplaceTemplate.findUnique({
      where: { id: id },
      include: {
        reviews: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        ratings: true,
      },
    });

    if (!template) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }

    // Nur veröffentlichte Templates sind öffentlich sichtbar — Autor darf alle Status sehen
    if (template.status !== "published" && template.authorId !== userId) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }

    // Purchase-Status prüfen (wenn User eingeloggt)
    let hasPurchased = false;
    let userRating: number | null = null;

    if (userId) {
      const purchase = await prisma.marketplacePurchase.findUnique({
        where: { userId_templateId: { userId, templateId: id } },
      });
      hasPurchased = !!purchase;

      const rating = await prisma.marketplaceRating.findUnique({
        where: { userId_templateId: { userId, templateId: id } },
      });
      userRating = rating?.rating ?? null;
    }

    return Response.json({
      template: {
        ...template,
        hasPurchased,
        userRating,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
