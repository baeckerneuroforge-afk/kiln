/**
 * Collective Learning — KILN lernt aus jeder erfolgreichen Browser-Execution.
 * Anonymisiert, aggregiert: Nur technische Daten (Selektoren, Patterns),
 * keine User-Daten, keine Inhalte, keine URLs mit Query-Params.
 *
 * Priority Chain für Execution:
 * 1. Collective Intelligence (DB) → höchste Confidence, dynamisch
 * 2. Static Recipes (Code) → handkuratiert, 0 DB-Calls
 * 3. Smart Extractor → DOM-Analyse
 * 4. LLM Loop → teuerster Fallback
 */

import { prisma } from "@/lib/prisma";
import type { SiteRecipe } from "./site-recipes";

/* ── Types ── */

export interface LearnableExecution {
  url: string;
  task: string;
  /** Selectors that successfully extracted data */
  successfulSelectors: Record<string, string>;
  /** Fields that were found */
  fieldsFound: string[];
  /** How data was extracted */
  extractionMethod: string;
  /** Was a recipe used? */
  recipeUsed?: string;
  /** Obstacles that were dismissed */
  obstaclesDismissed?: Record<string, string>;
  /** Duration in ms */
  durationMs: number;
}

export interface IntelligenceStrategy {
  /** Dynamic recipe generated from collective intelligence */
  recipe: SiteRecipe | null;
  /** Confidence of the generated recipe (0-1) */
  confidence: number;
  /** Domain matched */
  domain: string;
  /** Number of successful executions backing this recipe */
  executionCount: number;
  /** Suggested path pattern */
  pathPattern: string;
}

/* ── Constants ── */

const MIN_CONFIDENCE_THRESHOLD = 0.6;
const MIN_SUCCESS_COUNT = 3;
const CONFIDENCE_BOOST_PER_SUCCESS = 0.05;
const CONFIDENCE_PENALTY_PER_FAILURE = 0.15;
const MAX_CONFIDENCE = 0.98;
const DECAY_FACTOR_PER_WEEK = 0.02;
const PRUNE_CONFIDENCE_THRESHOLD = 0.15;
const PRUNE_AGE_DAYS = 90;

/* ── Privacy ── */

/**
 * Sanitize URL: Remove query params, fragments, auth tokens.
 * Keep only domain + path pattern.
 */
function sanitizeUrl(url: string): { domain: string; pathPattern: string } {
  try {
    const u = new URL(url);
    const domain = u.hostname.replace(/^www\./, "");
    // Normalize path: replace IDs/UUIDs/numbers with :id
    const pathPattern = u.pathname
      .replace(/\/\d+/g, "/:id")
      .replace(/\/[a-f0-9]{24,}/gi, "/:id")
      .replace(/\/[a-z0-9-]{36}/gi, "/:id")
      .replace(/\/B[A-Z0-9]{9}/g, "/:id") // Amazon ASINs
      .replace(/\/$/, "") || "/";
    return { domain, pathPattern };
  } catch {
    return { domain: "unknown", pathPattern: "/" };
  }
}

/**
 * Strip any potential PII from selector values.
 * Selectors are pure CSS — no user content should be there,
 * but we sanitize defensively.
 */
function sanitizeSelector(selector: string): string {
  // Remove any attribute values that look like emails or long strings
  return selector
    .replace(/\[.*?=["'][^"']{50,}["']\]/g, "") // Long attr values
    .replace(/\[.*?=["'].*?@.*?["']\]/g, "")    // Email-like attrs
    .slice(0, 500);
}

/* ── Learn from Execution ── */

/**
 * Records successful selector usage from a browser execution.
 * Non-blocking — fire and forget from the execution pipeline.
 */
export async function learnFromExecution(execution: LearnableExecution): Promise<void> {
  try {
    const { domain, pathPattern } = sanitizeUrl(execution.url);
    if (domain === "unknown") return;

    const upserts: Promise<unknown>[] = [];

    // Learn successful selectors
    for (const [key, selector] of Object.entries(execution.successfulSelectors)) {
      const sanitized = sanitizeSelector(selector);
      if (!sanitized) continue;

      upserts.push(
        prisma.siteIntelligence.upsert({
          where: {
            domain_pathPattern_dataType_selectorKey: {
              domain,
              pathPattern,
              dataType: "product_selector",
              selectorKey: key,
            },
          },
          create: {
            domain,
            pathPattern,
            dataType: "product_selector",
            selectorKey: key,
            selectorValue: sanitized,
            successCount: 1,
            confidence: 0.6,
            source: "execution",
          },
          update: {
            selectorValue: sanitized,
            successCount: { increment: 1 },
            confidence: {
              // Clamp to MAX_CONFIDENCE via raw SQL later; Prisma doesn't support min()
              increment: CONFIDENCE_BOOST_PER_SUCCESS,
            },
            lastSeenAt: new Date(),
          },
        }),
      );
    }

    // Learn obstacles
    if (execution.obstaclesDismissed) {
      for (const [key, selector] of Object.entries(execution.obstaclesDismissed)) {
        const sanitized = sanitizeSelector(selector);
        if (!sanitized) continue;

        upserts.push(
          prisma.siteIntelligence.upsert({
            where: {
              domain_pathPattern_dataType_selectorKey: {
                domain,
                pathPattern: "/", // Obstacles are domain-wide
                dataType: "obstacle_selector",
                selectorKey: key,
              },
            },
            create: {
              domain,
              pathPattern: "/",
              dataType: "obstacle_selector",
              selectorKey: key,
              selectorValue: sanitized,
              successCount: 1,
              confidence: 0.7,
              source: "execution",
            },
            update: {
              selectorValue: sanitized,
              successCount: { increment: 1 },
              confidence: { increment: CONFIDENCE_BOOST_PER_SUCCESS },
              lastSeenAt: new Date(),
            },
          }),
        );
      }
    }

    // Learn page pattern (what type of page this URL pattern represents)
    if (execution.fieldsFound.length > 0) {
      const pageType = execution.fieldsFound.includes("title") && execution.fieldsFound.includes("price")
        ? "product"
        : execution.fieldsFound.includes("results")
          ? "search_results"
          : "data";

      upserts.push(
        prisma.siteIntelligence.upsert({
          where: {
            domain_pathPattern_dataType_selectorKey: {
              domain,
              pathPattern,
              dataType: "page_pattern",
              selectorKey: "type",
            },
          },
          create: {
            domain,
            pathPattern,
            dataType: "page_pattern",
            selectorKey: "type",
            selectorValue: pageType,
            successCount: 1,
            confidence: 0.6,
            source: "execution",
            metadata: { fieldsFound: execution.fieldsFound, method: execution.extractionMethod },
          },
          update: {
            selectorValue: pageType,
            successCount: { increment: 1 },
            confidence: { increment: CONFIDENCE_BOOST_PER_SUCCESS },
            lastSeenAt: new Date(),
            metadata: { fieldsFound: execution.fieldsFound, method: execution.extractionMethod },
          },
        }),
      );
    }

    await Promise.allSettled(upserts);

    // Clamp confidence to MAX_CONFIDENCE (Prisma increment can exceed it)
    await prisma.siteIntelligence.updateMany({
      where: { domain, confidence: { gt: MAX_CONFIDENCE } },
      data: { confidence: MAX_CONFIDENCE },
    });
  } catch {
    // Non-blocking — swallow errors silently
  }
}

/* ── Learn from Failure ── */

/**
 * Records a failed selector so confidence decays.
 */
export async function learnFromFailure(
  url: string,
  failedSelectors: Record<string, string>,
): Promise<void> {
  try {
    const { domain, pathPattern } = sanitizeUrl(url);
    if (domain === "unknown") return;

    const updates: Promise<unknown>[] = [];

    for (const [key, selector] of Object.entries(failedSelectors)) {
      const sanitized = sanitizeSelector(selector);
      if (!sanitized) continue;

      updates.push(
        prisma.siteIntelligence.updateMany({
          where: {
            domain,
            pathPattern,
            dataType: "product_selector",
            selectorKey: key,
            selectorValue: sanitized,
          },
          data: {
            failCount: { increment: 1 },
            confidence: { decrement: CONFIDENCE_PENALTY_PER_FAILURE },
            lastFailedAt: new Date(),
          },
        }),
      );
    }

    await Promise.allSettled(updates);

    // Floor confidence at 0
    await prisma.siteIntelligence.updateMany({
      where: { domain, confidence: { lt: 0 } },
      data: { confidence: 0 },
    });
  } catch {
    // Non-blocking
  }
}

/* ── Generate Recipe from Intelligence ── */

/**
 * Builds a SiteRecipe from collective intelligence data.
 * Only uses selectors above MIN_CONFIDENCE_THRESHOLD with enough successes.
 */
export async function generateRecipeFromIntelligence(
  url: string,
): Promise<IntelligenceStrategy | null> {
  try {
    const { domain, pathPattern } = sanitizeUrl(url);
    if (domain === "unknown") return null;

    // Fetch all intelligence for this domain
    const records = await prisma.siteIntelligence.findMany({
      where: {
        domain,
        confidence: { gte: MIN_CONFIDENCE_THRESHOLD },
        successCount: { gte: MIN_SUCCESS_COUNT },
      },
      orderBy: { confidence: "desc" },
    });

    if (records.length === 0) return null;

    // Build recipe from intelligence
    const recipe: SiteRecipe = {};
    let totalConfidence = 0;
    let totalExecutions = 0;
    let matchedRecords = 0;

    // Product selectors (matching path pattern or generic "/")
    const productSelectors = records.filter(
      (r) =>
        r.dataType === "product_selector" &&
        (r.pathPattern === pathPattern || r.pathPattern === "/"),
    );

    if (productSelectors.length > 0) {
      recipe.product = {};
      for (const ps of productSelectors) {
        recipe.product[ps.selectorKey] = ps.selectorValue;
        totalConfidence += ps.confidence;
        totalExecutions += ps.successCount;
        matchedRecords++;
      }
    }

    // Search selectors
    const searchSelectors = records.filter(
      (r) => r.dataType === "search_selector",
    );
    const searchInput = searchSelectors.find((r) => r.selectorKey === "searchInput");
    const searchSubmit = searchSelectors.find((r) => r.selectorKey === "searchSubmit");
    if (searchInput) {
      recipe.search = {
        selector: searchInput.selectorValue,
        submitSelector: searchSubmit?.selectorValue ?? null,
      };
      totalConfidence += searchInput.confidence;
      totalExecutions += searchInput.successCount;
      matchedRecords++;
    }

    // Search result selectors
    const resultSelectors = searchSelectors.filter(
      (r) => r.selectorKey.startsWith("result_"),
    );
    if (resultSelectors.length > 0) {
      const items = resultSelectors.find((r) => r.selectorKey === "result_items");
      const title = resultSelectors.find((r) => r.selectorKey === "result_itemTitle");
      if (items && title) {
        recipe.searchResults = {
          items: items.selectorValue,
          itemTitle: title.selectorValue,
          itemPrice: resultSelectors.find((r) => r.selectorKey === "result_itemPrice")?.selectorValue,
          itemLink: resultSelectors.find((r) => r.selectorKey === "result_itemLink")?.selectorValue,
        };
      }
    }

    // Obstacles
    const obstacleRecords = records.filter(
      (r) => r.dataType === "obstacle_selector",
    );
    if (obstacleRecords.length > 0) {
      recipe.obstacles = {};
      for (const obs of obstacleRecords) {
        if (obs.selectorKey === "cookieBanner") {
          recipe.obstacles.cookieBanner = obs.selectorValue;
        } else if (obs.selectorKey === "captcha") {
          recipe.obstacles.captcha = obs.selectorValue;
        }
      }
    }

    // Need at least product OR search selectors to be useful
    if (!recipe.product && !recipe.search) return null;

    const avgConfidence = matchedRecords > 0 ? totalConfidence / matchedRecords : 0;

    return {
      recipe,
      confidence: Math.min(avgConfidence, MAX_CONFIDENCE),
      domain,
      executionCount: totalExecutions,
      pathPattern,
    };
  } catch {
    return null;
  }
}

/* ── Execution Strategy ── */

/**
 * Determines the best execution strategy for a URL.
 * Returns intelligence-based recipe if available and confident enough.
 */
export async function getExecutionStrategy(
  url: string,
): Promise<IntelligenceStrategy | null> {
  try {
    const strategy = await generateRecipeFromIntelligence(url);
    if (!strategy || strategy.confidence < MIN_CONFIDENCE_THRESHOLD) return null;
    return strategy;
  } catch {
    return null;
  }
}

/* ── Confidence Decay ── */

/**
 * Decays confidence of all records based on age.
 * Called by cron job weekly.
 * Also prunes records below threshold or older than PRUNE_AGE_DAYS.
 */
export async function decayAndPrune(): Promise<{
  decayed: number;
  pruned: number;
}> {
  const now = new Date();

  // Decay: reduce confidence based on weeks since last seen
  // Using raw query for efficiency on large tables
  const decayResult = await prisma.$executeRaw`
    UPDATE "SiteIntelligence"
    SET confidence = GREATEST(
      0,
      confidence - (${DECAY_FACTOR_PER_WEEK} * EXTRACT(EPOCH FROM (${now} - "lastSeenAt")) / 604800)
    ),
    "updatedAt" = ${now}
    WHERE confidence > 0
    AND "lastSeenAt" < ${new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)}
  `;

  // Prune: remove very low confidence or very old records
  const pruneDate = new Date(now.getTime() - PRUNE_AGE_DAYS * 24 * 60 * 60 * 1000);
  const pruneResult = await prisma.siteIntelligence.deleteMany({
    where: {
      OR: [
        { confidence: { lt: PRUNE_CONFIDENCE_THRESHOLD }, source: { not: "static_recipe" } },
        { lastSeenAt: { lt: pruneDate }, confidence: { lt: 0.3 }, source: { not: "static_recipe" } },
      ],
    },
  });

  return {
    decayed: typeof decayResult === "number" ? decayResult : 0,
    pruned: pruneResult.count,
  };
}

/* ── Seed from Static Recipes ── */

/**
 * Converts the static SITE_RECIPES into SiteIntelligence rows.
 * Idempotent — only creates, never overwrites existing data.
 */
export async function seedFromStaticRecipes(
  recipes: Record<string, SiteRecipe>,
): Promise<number> {
  let seeded = 0;

  for (const [domain, recipe] of Object.entries(recipes)) {
    const creates: Parameters<typeof prisma.siteIntelligence.upsert>[0][] = [];

    // Product selectors
    if (recipe.product) {
      for (const [key, selector] of Object.entries(recipe.product)) {
        creates.push({
          where: {
            domain_pathPattern_dataType_selectorKey: {
              domain,
              pathPattern: "/:id",
              dataType: "product_selector",
              selectorKey: key,
            },
          },
          create: {
            domain,
            pathPattern: "/:id",
            dataType: "product_selector",
            selectorKey: key,
            selectorValue: selector,
            successCount: 100, // High initial count for static recipes
            confidence: 0.95,
            source: "static_recipe",
          },
          update: {}, // Don't overwrite if exists
        });
      }
    }

    // Search selectors
    if (recipe.search) {
      creates.push({
        where: {
          domain_pathPattern_dataType_selectorKey: {
            domain,
            pathPattern: "/",
            dataType: "search_selector",
            selectorKey: "searchInput",
          },
        },
        create: {
          domain,
          pathPattern: "/",
          dataType: "search_selector",
          selectorKey: "searchInput",
          selectorValue: recipe.search.selector,
          successCount: 100,
          confidence: 0.95,
          source: "static_recipe",
        },
        update: {},
      });

      if (recipe.search.submitSelector) {
        creates.push({
          where: {
            domain_pathPattern_dataType_selectorKey: {
              domain,
              pathPattern: "/",
              dataType: "search_selector",
              selectorKey: "searchSubmit",
            },
          },
          create: {
            domain,
            pathPattern: "/",
            dataType: "search_selector",
            selectorKey: "searchSubmit",
            selectorValue: recipe.search.submitSelector,
            successCount: 100,
            confidence: 0.95,
            source: "static_recipe",
          },
          update: {},
        });
      }
    }

    // Search result selectors
    if (recipe.searchResults) {
      const srMap: Record<string, string> = {
        result_items: recipe.searchResults.items,
        result_itemTitle: recipe.searchResults.itemTitle,
      };
      if (recipe.searchResults.itemPrice) srMap.result_itemPrice = recipe.searchResults.itemPrice;
      if (recipe.searchResults.itemLink) srMap.result_itemLink = recipe.searchResults.itemLink;
      if (recipe.searchResults.itemImage) srMap.result_itemImage = recipe.searchResults.itemImage;
      if (recipe.searchResults.itemSnippet) srMap.result_itemSnippet = recipe.searchResults.itemSnippet;

      for (const [key, val] of Object.entries(srMap)) {
        creates.push({
          where: {
            domain_pathPattern_dataType_selectorKey: {
              domain,
              pathPattern: "/",
              dataType: "search_selector",
              selectorKey: key,
            },
          },
          create: {
            domain,
            pathPattern: "/",
            dataType: "search_selector",
            selectorKey: key,
            selectorValue: val,
            successCount: 100,
            confidence: 0.95,
            source: "static_recipe",
          },
          update: {},
        });
      }
    }

    // Obstacles
    if (recipe.obstacles) {
      for (const [key, selector] of Object.entries(recipe.obstacles)) {
        if (!selector) continue;
        creates.push({
          where: {
            domain_pathPattern_dataType_selectorKey: {
              domain,
              pathPattern: "/",
              dataType: "obstacle_selector",
              selectorKey: key,
            },
          },
          create: {
            domain,
            pathPattern: "/",
            dataType: "obstacle_selector",
            selectorKey: key,
            selectorValue: selector,
            successCount: 100,
            confidence: 0.95,
            source: "static_recipe",
          },
          update: {},
        });
      }
    }

    // Execute upserts
    for (const args of creates) {
      try {
        await prisma.siteIntelligence.upsert(args);
        seeded++;
      } catch {
        // Duplicate — skip
      }
    }
  }

  return seeded;
}

/* ── Admin Stats ── */

/**
 * Returns aggregate stats for the admin dashboard.
 */
export async function getIntelligenceStats(): Promise<{
  totalRecords: number;
  uniqueDomains: number;
  avgConfidence: number;
  topDomains: Array<{ domain: string; count: number; avgConfidence: number }>;
  byDataType: Record<string, number>;
  recentLearnings: number;
}> {
  const [totalRecords, domainGroups, typeGroups, recentCount] = await Promise.all([
    prisma.siteIntelligence.count(),
    prisma.siteIntelligence.groupBy({
      by: ["domain"],
      _count: true,
      _avg: { confidence: true },
      orderBy: { _count: { domain: "desc" } },
      take: 20,
    }),
    prisma.siteIntelligence.groupBy({
      by: ["dataType"],
      _count: true,
    }),
    prisma.siteIntelligence.count({
      where: {
        lastSeenAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const avgConfidence = domainGroups.length > 0
    ? domainGroups.reduce((sum, d) => sum + (d._avg.confidence ?? 0), 0) / domainGroups.length
    : 0;

  return {
    totalRecords,
    uniqueDomains: domainGroups.length,
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    topDomains: domainGroups.slice(0, 10).map((d) => ({
      domain: d.domain,
      count: d._count,
      avgConfidence: Math.round((d._avg.confidence ?? 0) * 100) / 100,
    })),
    byDataType: Object.fromEntries(typeGroups.map((t) => [t.dataType, t._count])),
    recentLearnings: recentCount,
  };
}
