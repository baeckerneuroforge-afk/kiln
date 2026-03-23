import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { canAffordExecution, estimateGenericCost } from "@/lib/cost/cost-estimator";
import { deductCreditsByAmount, getCreditCost } from "@/lib/credits";
import { checkFeatureAccess } from "@/lib/feature-access";
import {
  QUICK_USE_STREAM_HEADERS,
  createQuickUseExecutionContext,
  getExecutionIdFromContext,
  writeQuickUseDone,
  writeQuickUseEvent,
} from "@/lib/quick-use/server";
import type { QuickUseResult, QuickUseSource } from "@/lib/quick-use/types";
import {
  executeDeepResearch,
  type ResearchDepth,
  type ResearchResult,
} from "@/lib/workflow-nodes/deep-research-node";

export const dynamic = "force-dynamic";

function selectResearchDepth(topic: string): ResearchDepth {
  if (topic.length > 140 || /\b(regulations?|market size|latest|2026|compare|pros and cons|key players)\b/i.test(topic)) {
    return "deep";
  }
  if (topic.length < 60) return "quick";
  return "standard";
}

function detectOutputLanguage(topic: string): "en" | "de" {
  if (/[äöüß]/i.test(topic)) return "de";
  if (/\b(der|die|das|und|für|mit|markt|deutsch|eu)\b/i.test(topic)) return "de";
  return "en";
}

function estimateResearchCredits(depth: ResearchDepth): number {
  const queryCount = depth === "quick" ? 2 : depth === "deep" ? 8 : 4;
  const consolidationModel = depth === "quick" ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6";

  return (
    getCreditCost("claude-haiku-4-5-20251001") +
    queryCount * getCreditCost("sonar") +
    getCreditCost(consolidationModel)
  );
}

function buildResearchResult(topic: string, research: ResearchResult): QuickUseResult {
  const sources: QuickUseSource[] = research.sources.map((source) => ({
    title: source.title,
    url: source.url,
    domain: source.domain,
    snippet: source.snippet,
  }));

  return {
    title: topic,
    summary: research.summary,
    markdown: research.fullReport,
    sources,
    data: {
      depth: research.depth,
      confidence: research.confidence,
      queriesUsed: research.queriesUsed,
      totalDurationMs: research.totalDurationMs,
    },
    meta: {
      depth: research.depth,
      confidence: research.confidence,
      queriesUsed: research.queriesUsed,
      totalDurationMs: research.totalDurationMs,
    },
  };
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await checkFeatureAccess(userId, "deepResearch");
  if (!access.allowed) {
    return Response.json({ error: access.upgradeMessage }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { message?: string; userId?: string } | null;
  const message = body?.message?.trim();

  if (!message) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  const depth = selectResearchDepth(message);
  const estimatedCredits = estimateResearchCredits(depth);
  const affordability = await canAffordExecution(
    userId,
    { ...estimateGenericCost("claude-sonnet-4-6", 1), totalCredits: estimatedCredits }
  );

  if (!affordability.affordable) {
    return Response.json(
      {
        error: `Not enough credits. This run is estimated at ${estimatedCredits} credits and your balance is ${affordability.balance}.`,
      },
      { status: 402 }
    );
  }

  const context = createQuickUseExecutionContext("deep-research", userId);
  const executionId = getExecutionIdFromContext(context);
  const language = detectOutputLanguage(message);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        writeQuickUseEvent(controller, encoder, {
          type: "meta",
          meta: {
            estimatedCredits,
            executionId,
          },
        });

        writeQuickUseEvent(controller, encoder, {
          type: "progress",
          message: `Starting ${depth} research on "${message}"...`,
        });

        const resultKey = "quickDeepResearchResult";
        const result = await executeDeepResearch(
          {
            topic: message,
            depth,
            language,
            resultKey,
            onProgress: (progressMessage: string) => {
              writeQuickUseEvent(controller, encoder, {
                type: "progress",
                message: progressMessage,
              });
            },
          },
          context
        );

        if (!result.success) {
          throw new Error(result.error || "Deep Research failed");
        }

        const research = result.contextDelta[resultKey] as ResearchResult | undefined;
        if (!research) {
          throw new Error("Deep Research returned no report");
        }

        const charge = await deductCreditsByAmount(
          userId,
          estimatedCredits,
          "TASK_RUN",
          "quick_use_deep_research"
        );

        writeQuickUseEvent(controller, encoder, {
          type: "result",
          result: buildResearchResult(message, research),
          credits: {
            estimatedCredits,
            creditsUsed: estimatedCredits,
            creditsRemaining: charge.newBalance,
          },
        });
      } catch (error) {
        writeQuickUseEvent(controller, encoder, {
          type: "error",
          error: error instanceof Error ? error.message : "Deep Research failed",
          suggestions: [
            "Narrow the topic slightly.",
            "Try a different phrasing or angle.",
            "Retry in a few moments if a provider timed out.",
          ],
        });
      } finally {
        writeQuickUseDone(controller, encoder);
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: QUICK_USE_STREAM_HEADERS });
}
