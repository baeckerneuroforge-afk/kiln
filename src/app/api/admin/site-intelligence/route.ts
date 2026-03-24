/**
 * Admin API: Site Intelligence
 * GET — Stats overview
 * POST — Seed database from static recipes
 *
 * Auth: Clerk admin (email @hephaistos.systems) OR CRON_SECRET Bearer token.
 */

import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  getIntelligenceStats,
  seedFromStaticRecipes,
} from "@/lib/browser/collective-learning";
import { getRecipeForUrl } from "@/lib/browser/site-recipes";

// Domains matching SITE_RECIPES keys
const SEED_DOMAINS = [
  "amazon.de", "amazon.com", "mediamarkt.de", "saturn.de",
  "apple.com", "ebay.de", "ebay.com", "idealo.de",
  "google.com", "otto.de", "zalando.de",
];

/**
 * Checks admin access via Clerk session OR CRON_SECRET Bearer token.
 */
async function isAuthorized(request: NextRequest): Promise<boolean> {
  // Option 1: CRON_SECRET Bearer token
  const authHeader = request.headers.get("authorization");
  if (authHeader && process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }

  // Option 2: Clerk admin session
  try {
    const { userId } = await auth();
    if (!userId) return false;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    return !!user?.email?.endsWith("@hephaistos.systems");
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
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

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
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
