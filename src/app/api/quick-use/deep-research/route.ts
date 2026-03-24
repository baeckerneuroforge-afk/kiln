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
import type { QuickUseFileAttachment, QuickUseResult, QuickUseSource } from "@/lib/quick-use/types";
import { enhanceQuickUseResult } from "@/lib/quick-use/result-presentation";
import { processFiles, buildFileContext } from "@/lib/quick-use/file-processor";
import { quickUseSessionMemory } from "@/lib/quick-use/session-memory";
import {
  executeDeepResearch,
  type ResearchDepth,
  type ResearchResult,
} from "@/lib/workflow-nodes/deep-research-node";
import {
  createBackgroundTask,
  updateTaskProgress,
  completeTask,
  failTask,
} from "@/lib/quick-use/background-executor";

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
  const sources: QuickUseSource[] = research.sources.map((source, index) => ({
    id: index + 1,
    title: source.title,
    url: source.url,
    domain: source.domain,
    snippet: source.snippet,
  }));

  return enhanceQuickUseResult({
    title: topic,
    summary: research.summary,
    markdown: research.fullReport,
    resultType: research.resultType || "research",
    followUpQuestions: research.followUpQuestions,
    model: research.depth === "quick" ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6",
    durationMs: research.totalDurationMs,
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
  }, {
    quickUseType: "deep-research",
    resultType: "research",
    model: research.depth === "quick" ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6",
    durationMs: research.totalDurationMs,
  });
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

  const body = await request.json().catch(() => null) as {
    message?: string;
    userId?: string;
    files?: QuickUseFileAttachment[];
    memoryIds?: string[];
  } | null;
  const message = body?.message?.trim();
  const fileAttachments = Array.isArray(body?.files) ? body.files : [];
  const selectedMemoryIds = Array.isArray(body?.memoryIds) ? body.memoryIds : [];

  if (!message) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  const relevantMemories = await quickUseSessionMemory.getRelevantMemory(userId, message, {
    quickUseType: "deep-research",
    selectedMemoryIds,
  });
  const memoryPrompt = quickUseSessionMemory.buildContextPrompt(relevantMemories, message);

  // Process uploaded files and append context to research topic
  let topicWithFiles = message;
  if (fileAttachments.length > 0) {
    const processed = await processFiles(fileAttachments);
    const fileContext = buildFileContext(processed);
    topicWithFiles = `${message}\n\n${fileContext}`;
  }
  if (memoryPrompt) {
    topicWithFiles = `${topicWithFiles}\n\n${memoryPrompt}`;
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

  // Hintergrund-Task erstellen
  const taskId = await createBackgroundTask(
    userId,
    "deep_research",
    { message, files: fileAttachments },
    {
      depth,
      language,
      estimatedCredits,
      memoriesApplied: relevantMemories.map((memory) => quickUseSessionMemory.toPreview(memory)),
    },
    estimatedCredits
  );

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let streamClosed = false;

      const safeWrite = (event: Parameters<typeof writeQuickUseEvent>[2]) => {
        if (streamClosed) return;
        try {
          writeQuickUseEvent(controller, encoder, event);
        } catch {
          streamClosed = true;
        }
      };

      try {
        safeWrite({
          type: "meta",
          meta: {
            estimatedCredits,
            executionId,
            taskId,
          },
        });

        if (relevantMemories.length > 0) {
          safeWrite({
            type: "memory",
            memories: relevantMemories.map((memory) => quickUseSessionMemory.toPreview(memory)),
            autoApplied: true,
          });
        }

        safeWrite({
          type: "progress",
          message: `Starting ${depth} research on "${message}"...`,
        });
        void updateTaskProgress(taskId, { currentStep: `Starting ${depth} research on "${message}"...` });

        const resultKey = "quickDeepResearchResult";
        const result = await executeDeepResearch(
          {
            topic: topicWithFiles,
            depth,
            language,
            resultKey,
            onProgress: (progressMessage: string) => {
              safeWrite({
                type: "progress",
                message: progressMessage,
              });
              void updateTaskProgress(taskId, { currentStep: progressMessage });
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

        const finalResult = buildResearchResult(message, research);
        const finalCredits = {
          estimatedCredits,
          creditsUsed: estimatedCredits,
          creditsRemaining: charge.newBalance,
        };

        safeWrite({
          type: "result",
          result: finalResult,
          credits: finalCredits,
        });

        await completeTask(taskId, finalResult, finalCredits);
        void quickUseSessionMemory.saveTaskContext(userId, taskId, {
          type: "deep-research",
          inputMessage: message,
          result: finalResult,
        }).catch(() => {});
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Deep Research failed";
        safeWrite({
          type: "error",
          error: errorMessage,
          suggestions: [
            "Narrow the topic slightly.",
            "Try a different phrasing or angle.",
            "Retry in a few moments if a provider timed out.",
          ],
        });
        await failTask(taskId, errorMessage);
      } finally {
        streamClosed = true;
        try {
          writeQuickUseDone(controller, encoder);
          controller.close();
        } catch {
          // Client already disconnected
        }
      }
    },
  });

  return new Response(stream, { headers: QUICK_USE_STREAM_HEADERS });
}
