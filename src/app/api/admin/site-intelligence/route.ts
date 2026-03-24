/**
 * Admin API: Site Intelligence
 * GET — Stats overview
 * POST — Seed database from static recipes
 */

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  getIntelligenceStats,
  seedFromStaticRecipes,
} from "@/lib/browser/collective-learning";

// Static recipes import (the exported SITE_RECIPES is not exported, so we re-import the getter)
import { getRecipeForUrl } from "@/lib/browser/site-recipes";

// Hardcoded domains for seeding (matches SITE_RECIPES keys)
const SEED_DOMAINS = [
  "amazon.de", "amazon.com", "mediamarkt.de", "saturn.de",
  "apple.com", "ebay.de", "ebay.com", "idealo.de",
  "google.com", "otto.de", "zalando.de",
];

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin check
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user?.email?.endsWith("@hephaistos.systems")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const stats = await getIntelligenceStats();
    return Response.json(stats);
  } catch (error) {
    return Response.json(
      { error: "Failed to fetch stats", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 },
    );
  }
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user?.email?.endsWith("@hephaistos.systems")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Build recipes map from known domains
    const recipes: Record<string, import("@/lib/browser/site-recipes").SiteRecipe> = {};
    for (const domain of SEED_DOMAINS) {
      const match = getRecipeForUrl(`https://www.${domain}/`);
      if (match) {
        recipes[match.domain] = match.recipe;
      }
    }

    const seeded = await seedFromStaticRecipes(recipes);
    const stats = await getIntelligenceStats();

    return Response.json({
      success: true,
      seeded,
      stats,
    });
  } catch (error) {
    return Response.json(
      { error: "Seed failed", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 },
    );
  }
}
