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
import type { QuickUseFileAttachment, QuickUseGeneratedFile, QuickUseResult, QuickUseSource } from "@/lib/quick-use/types";
import { enhanceQuickUseResult } from "@/lib/quick-use/result-presentation";
import { generateFile, buildSmartFileName, extractTableFromMarkdown } from "@/lib/output/file-generator";
import { processFiles, buildFileContext } from "@/lib/quick-use/file-processor";
import { quickUseSessionMemory } from "@/lib/quick-use/session-memory";
import {
  executeDeepResearch,
  detectResearchLayer,
  type ResearchDepth,
  type ResearchResult,
  type ResearchLayer,
} from "@/lib/workflow-nodes/deep-research-node";
import {
  createBackgroundTask,
  updateTaskProgress,
  completeTask,
  failTask,
} from "@/lib/quick-use/background-executor";

export const dynamic = "force-dynamic";

function layerToDepth(layer: ResearchLayer): ResearchDepth {
  switch (layer) {
    case "extract": return "quick";
    case "search": return "standard";
    case "deep": return "deep";
  }
}

function detectOutputLanguage(topic: string): "en" | "de" {
  if (/[äöüß]/i.test(topic)) return "de";
  if (/\b(der|die|das|und|für|mit|markt|deutsch|eu)\b/i.test(topic)) return "de";
  return "en";
}

function estimateResearchCredits(layer: ResearchLayer): number {
  switch (layer) {
    case "extract":
      return 0; // HTTP-only, no LLM calls
    case "search":
      return (
        getCreditCost("claude-haiku-4-5-20251001") + // query generation
        2 * getCreditCost("sonar") +                  // search
        getCreditCost("claude-haiku-4-5-20251001")    // synthesis
      );
    case "deep":
      return (
        getCreditCost("claude-haiku-4-5-20251001") + // query generation
        8 * getCreditCost("sonar") +                  // search
        getCreditCost("claude-sonnet-4-6")            // synthesis
      );
  }
}

function buildResearchResult(topic: string, research: ResearchResult): QuickUseResult {
  const sources: QuickUseSource[] = research.sources.map((source, index) => ({
    id: index + 1,
    title: source.title,
    url: source.url,
    domain: source.domain,
    snippet: source.snippet,
  }));

  const model = research.layer === "extract"
    ? "none"
    : research.layer === "search"
      ? "claude-haiku-4-5-20251001"
      : "claude-sonnet-4-6";

  return enhanceQuickUseResult({
    title: topic,
    summary: research.summary,
    markdown: research.fullReport,
    resultType: research.resultType === "instant_extract" ? "instant_extract" : "research",
    followUpQuestions: research.followUpQuestions,
    model,
    durationMs: research.totalDurationMs,
    sources,
    data: {
      depth: research.depth,
      layer: research.layer,
      confidence: research.confidence,
      queriesUsed: research.queriesUsed,
      totalDurationMs: research.totalDurationMs,
    },
    meta: {
      depth: research.depth,
      layer: research.layer,
      confidence: research.confidence,
      queriesUsed: research.queriesUsed,
      totalDurationMs: research.totalDurationMs,
    },
  }, {
    quickUseType: "deep-research",
    resultType: research.resultType === "instant_extract" ? "instant_extract" : "research",
    model,
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

  let topicWithFiles = message;
  if (fileAttachments.length > 0) {
    const processed = await processFiles(fileAttachments);
    const fileContext = buildFileContext(processed);
    topicWithFiles = `${message}\n\n${fileContext}`;
  }
  if (memoryPrompt) {
    topicWithFiles = `${topicWithFiles}\n\n${memoryPrompt}`;
  }

  // Detect layer from the raw message (before file context is appended)
  const layer = detectResearchLayer(message);
  const depth = layerToDepth(layer);
  const estimatedCredits = estimateResearchCredits(layer);
  const language = detectOutputLanguage(message);

  // Layer 1 (extract) is free — skip credit check
  if (layer !== "extract") {
    const affordability = await canAffordExecution(
      userId,
      { ...estimateGenericCost("claude-sonnet-4-6", 1), totalCredits: estimatedCredits },
    );

    if (!affordability.affordable) {
      return Response.json(
        { error: `You have ${affordability.balance} credits, but this research needs ~${estimatedCredits} credits. Top up at /dashboard/settings?tab=billing or add your own API key.` },
        { status: 402 },
      );
    }
  }

  const context = createQuickUseExecutionContext("deep-research", userId);
  const executionId = getExecutionIdFromContext(context);

  const taskId = await createBackgroundTask(
    userId,
    "deep_research",
    { message, files: fileAttachments },
    { depth, layer, language, estimatedCredits, memoriesApplied: relevantMemories.map((m) => quickUseSessionMemory.toPreview(m)) },
    estimatedCredits,
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
          meta: { estimatedCredits, executionId, taskId },
        });

        if (relevantMemories.length > 0) {
          safeWrite({
            type: "memory",
            memories: relevantMemories.map((m) => quickUseSessionMemory.toPreview(m)),
            autoApplied: true,
          });
        }

        const layerLabels: Record<ResearchLayer, string> = {
          extract: "⚡ Instant Extract",
          search: "🔍 Web Research",
          deep: "📊 Deep Research",
        };
        safeWrite({
          type: "progress",
          message: `${layerLabels[layer]} — "${message}"`,
        });
        void updateTaskProgress(taskId, { currentStep: `${layerLabels[layer]}` });

        const resultKey = "quickDeepResearchResult";
        const result = await executeDeepResearch(
          {
            topic: topicWithFiles,
            depth,
            language,
            resultKey,
            onProgress: (progressMessage: string) => {
              safeWrite({ type: "progress", message: progressMessage });
              void updateTaskProgress(taskId, { currentStep: progressMessage });
            },
          },
          context,
        );

        if (!result.success) {
          throw new Error(result.error || "Deep Research failed");
        }

        const research = result.contextDelta[resultKey] as ResearchResult | undefined;
        if (!research) {
          throw new Error("Deep Research returned no report");
        }

        // Only charge credits for Layer 2/3
        let finalCredits = { estimatedCredits, creditsUsed: 0, creditsRemaining: 0 };
        if (layer !== "extract" && estimatedCredits > 0) {
          const charge = await deductCreditsByAmount(userId, estimatedCredits, "TASK_RUN", "quick_use_deep_research");
          finalCredits = { estimatedCredits, creditsUsed: estimatedCredits, creditsRemaining: charge.newBalance };
        } else {
          // Layer 1 — free, just get balance
          finalCredits = { estimatedCredits: 0, creditsUsed: 0, creditsRemaining: 0 };
        }

        const finalResult = buildResearchResult(message, research);

        // Auto-generate file downloads für Layer 2/3 Ergebnisse
        if (layer !== "extract" && research.fullReport) {
          try {
            safeWrite({ type: "progress", message: "Generating downloadable files..." });
            const generatedFiles: QuickUseGeneratedFile[] = [];

            // PDF für Research-Reports
            generatedFiles.push(await generateFile({
              kind: "pdf",
              fileName: buildSmartFileName(message, "Research", "pdf"),
              content: research.fullReport,
              title: message.slice(0, 80),
              userId,
            }));

            // Excel/CSV wenn Tabellendaten vorhanden
            const tableData = extractTableFromMarkdown(research.fullReport);
            if (tableData && tableData.length > 0) {
              generatedFiles.push(await generateFile({
                kind: "xlsx",
                fileName: buildSmartFileName(message, "Daten", "xlsx"),
                data: tableData,
                title: message.slice(0, 80),
                userId,
              }));
            }

            if (generatedFiles.length > 0) {
              finalResult.generatedFiles = [
                ...(finalResult.generatedFiles || []),
                ...generatedFiles,
              ];
            }
          } catch {
            // File generation is optional — don't fail the result
          }
        }

        safeWrite({ type: "result", result: finalResult, credits: finalCredits });
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
        } catch { /* Client disconnected */ }
      }
    },
  });

  return new Response(stream, { headers: QUICK_USE_STREAM_HEADERS });
}
