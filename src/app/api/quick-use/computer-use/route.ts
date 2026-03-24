import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { canAffordExecution, estimateComputerUseCost } from "@/lib/cost/cost-estimator";
import { deductCreditsByAmount } from "@/lib/credits";
import { checkFeatureAccess } from "@/lib/feature-access";
import {
  QUICK_USE_STREAM_HEADERS,
  createQuickUseExecutionContext,
  firstUrlFromText,
  getExecutionIdFromContext,
  normalizeUrl,
  writeQuickUseDone,
  writeQuickUseEvent,
} from "@/lib/quick-use/server";
import type { QuickUseFileAttachment, QuickUseResult } from "@/lib/quick-use/types";
import { enhanceQuickUseResult, urlsToSources } from "@/lib/quick-use/result-presentation";
import { processFiles, buildFileContext } from "@/lib/quick-use/file-processor";
import { quickUseSessionMemory } from "@/lib/quick-use/session-memory";
import { executeComputerUse } from "@/lib/workflow-nodes/computer-use-node";
import {
  createBackgroundTask,
  updateTaskProgress,
  completeTask,
  failTask,
} from "@/lib/quick-use/background-executor";

export const dynamic = "force-dynamic";

const EXTRACTION_MODEL = "claude-haiku-4-5-20251001";

interface ComputerUseSessionLike {
  task: string;
  startUrl: string;
  steps: Array<{
    stepIndex: number;
    action: string;
    actionDetail: string;
    url: string;
    screenshot: string | null;
  }>;
  summary: string;
  extractedData: Record<string, unknown> | null;
  totalDurationMs: number;
  urlsVisited: string[];
  completionReason: string;
  browserBackend?: string;
  warning?: string;
}

async function extractComputerUseRequest(message: string): Promise<{
  url: string;
  task: string;
  maxSteps: number;
}> {
  const fallbackUrl = firstUrlFromText(message) || "";
  const fallbackTask = message.trim();
  const fallbackMaxSteps = /extract|compare|fill|form|price|prices|all/i.test(message)
    ? 12
    : 10;

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      url: fallbackUrl,
      task: fallbackTask,
      maxSteps: fallbackMaxSteps,
    };
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 400,
      system: `Extract browser automation intent from the user's message.

Return ONLY valid JSON in this format:
{
  "url": "https://example.com or empty string if missing",
  "task": "clear browser task for the automation engine",
  "maxSteps": 10
}

Rules:
- Normalize URLs to absolute https URLs when possible
- maxSteps must be an integer between 4 and 20
- Keep the task short, direct, and execution-focused`,
      messages: [{ role: "user", content: message }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text) as {
      url?: string;
      task?: string;
      maxSteps?: number;
    };

    return {
      url: parsed.url ? normalizeUrl(parsed.url) : fallbackUrl,
      task: parsed.task?.trim() || fallbackTask,
      maxSteps: Math.min(Math.max(Number(parsed.maxSteps) || fallbackMaxSteps, 4), 20),
    };
  } catch {
    return {
      url: fallbackUrl,
      task: fallbackTask,
      maxSteps: fallbackMaxSteps,
    };
  }
}

function buildComputerUseResult(session: ComputerUseSessionLike): QuickUseResult {
  // Log internal backend warnings server-side only
  if ("warning" in session && typeof session.warning === "string") {
    console.log(`[ComputerUse] Backend warning: ${session.warning}`);
  }

  const screenshots = [...session.steps]
    .reverse()
    .filter((step) => typeof step.screenshot === "string" && step.screenshot.length > 0)
    .slice(0, 3);

  return enhanceQuickUseResult({
    title: session.task,
    summary: session.summary || "Computer Use completed.",
    markdown: [
      session.summary || "Computer Use completed.",
      session.urlsVisited.length > 0
        ? `Visited ${session.urlsVisited.length} page${session.urlsVisited.length === 1 ? "" : "s"}.`
        : null,
      `Completion reason: ${session.completionReason}.`,
    ].filter(Boolean).join("\n\n"),
    model: "claude-sonnet-4-6",
    durationMs: session.totalDurationMs,
    sources: urlsToSources(session.urlsVisited),
    data: session.extractedData || {
      startUrl: session.startUrl,
      urlsVisited: session.urlsVisited,
      totalSteps: session.steps.length,
      totalDurationMs: session.totalDurationMs,
    },
    artifacts: screenshots.length > 0
      ? screenshots.map((step) => ({
          kind: "image" as const,
          name: `Screenshot after step ${step.stepIndex + 1}`,
          dataUrl: `data:image/png;base64,${step.screenshot}`,
          mimeType: "image/png",
        }))
      : undefined,
    meta: {
      startUrl: session.startUrl,
      urlsVisited: session.urlsVisited,
      totalSteps: session.steps.length,
      totalDurationMs: session.totalDurationMs,
      completionReason: session.completionReason,
      browserBackend: "browserBackend" in session ? session.browserBackend : undefined,
      warning: "warning" in session ? session.warning : undefined,
    },
  }, {
    quickUseType: "computer-use",
    model: "claude-sonnet-4-6",
    durationMs: session.totalDurationMs,
  });
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await checkFeatureAccess(userId, "computerUse");
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
    quickUseType: "computer-use",
    selectedMemoryIds,
  });
  const memoryPrompt = quickUseSessionMemory.buildContextPrompt(relevantMemories, message);

  // Process uploaded files and append context to task
  let taskWithFiles = message;
  if (fileAttachments.length > 0) {
    const processed = await processFiles(fileAttachments);
    const fileContext = buildFileContext(processed);
    taskWithFiles = `${message}\n\n${fileContext}`;
  }
  if (memoryPrompt) {
    taskWithFiles = `${taskWithFiles}\n\n${memoryPrompt}`;
  }

  const extracted = await extractComputerUseRequest(taskWithFiles);
  const fallbackMemoryUrl = relevantMemories
    .flatMap((memory) => memory.visitedUrls)
    .find((url) => Boolean(url));
  if (!extracted.url && fallbackMemoryUrl) {
    extracted.url = normalizeUrl(fallbackMemoryUrl);
  }

  if (!extracted.url) {
    return Response.json(
      { error: "I need a URL to run Computer Use. Include the page you want me to open." },
      { status: 400 }
    );
  }

  const creditEstimate = estimateComputerUseCost("claude-sonnet-4-6", extracted.maxSteps, false, false);
  const affordability = await canAffordExecution(userId, creditEstimate);

  if (!affordability.affordable) {
    return Response.json(
      {
        error: `Not enough credits. This run is estimated at ${creditEstimate.totalCredits} credits and your balance is ${affordability.balance}.`,
      },
      { status: 402 }
    );
  }

  const context = createQuickUseExecutionContext("computer-use", userId);
  const executionId = getExecutionIdFromContext(context);

  // Hintergrund-Task erstellen
  const taskId = await createBackgroundTask(
    userId,
    "computer_use",
    { message, files: fileAttachments },
    {
      url: extracted.url,
      task: extracted.task,
      maxSteps: extracted.maxSteps,
      memoriesApplied: relevantMemories.map((memory) => quickUseSessionMemory.toPreview(memory)),
    },
    creditEstimate.totalCredits
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
            estimatedCredits: creditEstimate.totalCredits,
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
          message: `Preparing browser automation for ${extracted.url}...`,
        });
        void updateTaskProgress(taskId, { currentStep: `Preparing browser automation for ${extracted.url}...` });

        let lastScreenshotTime = 0;
        const SCREENSHOT_THROTTLE_MS = 1000; // Max 1 screenshot per second

        const resultKey = "quickComputerUseResult";
        const result = await executeComputerUse(
          {
            task: extracted.task,
            startUrl: extracted.url,
            maxSteps: extracted.maxSteps,
            captureScreenshots: true,
            extractData: true,
            enableVerification: true,
            enableProceduralMemory: true,
            preferMCPOverBrowser: false,
            browserMode: "real",
            resultKey,
            onProgress: (progressMessage: string) => {
              safeWrite({
                type: "progress",
                message: progressMessage,
              });
              void updateTaskProgress(taskId, { currentStep: progressMessage });
            },
            onBrowserEvent: (event: Record<string, unknown>) => {
              const eventType = String(event.eventType || "");

              if (eventType === "navigation") {
                safeWrite({
                  type: "browser_navigation",
                  url: String(event.url || ""),
                  stepIndex: Number(event.stepIndex) || 0,
                });
              }

              if (eventType === "screenshot") {
                const now = Date.now();
                if (now - lastScreenshotTime >= SCREENSHOT_THROTTLE_MS) {
                  lastScreenshotTime = now;
                  safeWrite({
                    type: "browser_screenshot",
                    imageData: String(event.imageData || ""),
                    stepIndex: Number(event.stepIndex) || 0,
                    url: String(event.url || ""),
                  });
                }
              }

              if (eventType === "action") {
                safeWrite({
                  type: "browser_action",
                  step: {
                    stepIndex: Number(event.stepIndex) || 0,
                    action: String(event.action || ""),
                    actionDetail: String(event.actionDetail || ""),
                    url: String(event.url || ""),
                    success: event.success as boolean | undefined,
                    durationMs: event.durationMs as number | undefined,
                  },
                });
              }

              if (eventType === "thinking") {
                safeWrite({
                  type: "browser_thinking",
                  thought: String(event.thought || ""),
                  stepIndex: Number(event.stepIndex) || 0,
                });
              }

              if (eventType === "step_complete") {
                safeWrite({
                  type: "browser_step_complete",
                  stepIndex: Number(event.stepIndex) || 0,
                  action: String(event.action || ""),
                  success: Boolean(event.success),
                });
              }

              if (eventType === "finding") {
                safeWrite({
                  type: "finding",
                  message: String(event.finding || ""),
                });
              }
            },
          },
          context
        );

        if (!result.success) {
          throw new Error(result.error || "Computer Use failed");
        }

        const session = result.contextDelta[resultKey] as ComputerUseSessionLike | undefined;
        if (!session) {
          throw new Error("Computer Use returned no session data");
        }

        const actualCreditEstimate = estimateComputerUseCost(
          "claude-sonnet-4-6",
          Math.max(session.steps.length, 1),
          false,
          false
        );

        const charge = await deductCreditsByAmount(
          userId,
          actualCreditEstimate.totalCredits,
          "TASK_RUN",
          "quick_use_computer_use"
        );

        const finalResult = buildComputerUseResult(session);
        const finalCredits = {
          estimatedCredits: creditEstimate.totalCredits,
          creditsUsed: actualCreditEstimate.totalCredits,
          creditsRemaining: charge.newBalance,
        };

        safeWrite({
          type: "result",
          result: finalResult,
          credits: finalCredits,
        });

        await completeTask(taskId, finalResult, finalCredits);
        void quickUseSessionMemory.saveTaskContext(userId, taskId, {
          type: "computer-use",
          inputMessage: message,
          result: finalResult,
        }).catch(() => {});
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Computer Use failed";
        safeWrite({
          type: "error",
          error: errorMessage,
          suggestions: [
            "Check that the URL is reachable.",
            "Make the task more specific.",
            "Try a smaller scope or fewer steps.",
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
