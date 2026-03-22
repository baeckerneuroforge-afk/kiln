import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

// POST: Review und Rating für ein Marketplace-Template abgeben
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
    const body = await request.json();
    const { rating, reviewText } = body;

    // Validierung
    if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
      return Response.json(
        { error: "Rating muss zwischen 1 und 5 liegen" },
        { status: 400 }
      );
    }

    // Template prüfen
    const template = await prisma.marketplaceTemplate.findUnique({
      where: { id: id },
    });

    if (!template || template.status !== "published") {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }

    // Nur bewerten, wenn User das Template gekauft hat oder es kostenlos ist
    if (template.price > 0) {
      const purchase = await prisma.marketplacePurchase.findUnique({
        where: { userId_templateId: { userId, templateId: id } },
      });

      if (!purchase) {
        return Response.json(
          { error: "Du musst dieses Template erst kaufen, um es zu bewerten" },
          { status: 403 }
        );
      }
    }

    // User-Name aus DB oder Fallback
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true },
    });

    const userName = user
      ? [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        user.email.split("@")[0]
      : "Anonym";

    // Review upserten (ein Review pro User pro Template)
    await prisma.marketplaceReview.upsert({
      where: { userId_templateId: { userId, templateId: id } },
      create: {
        userId,
        templateId: id,
        userName,
        rating: Math.round(rating),
        reviewText: reviewText || null,
      },
      update: {
        userName,
        rating: Math.round(rating),
        reviewText: reviewText || null,
      },
    });

    // Rating upserten
    await prisma.marketplaceRating.upsert({
      where: { userId_templateId: { userId, templateId: id } },
      create: { userId, templateId: id, rating: Math.round(rating) },
      update: { rating: Math.round(rating) },
    });

    // Durchschnittsbewertung neu berechnen
    const agg = await prisma.marketplaceRating.aggregate({
      where: { templateId: id },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await prisma.marketplaceTemplate.update({
      where: { id: id },
      data: {
        rating: Math.round((agg._avg.rating || 0) * 10) / 10,
        ratingCount: agg._count.rating,
      },
    });

    return Response.json({
      success: true,
      rating: agg._avg.rating,
      ratingCount: agg._count.rating,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
