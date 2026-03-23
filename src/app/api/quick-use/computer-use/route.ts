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
import type { QuickUseResult } from "@/lib/quick-use/types";
import { executeComputerUse } from "@/lib/workflow-nodes/computer-use-node";

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
  const latestScreenshot = [...session.steps]
    .reverse()
    .find((step) => typeof step.screenshot === "string" && step.screenshot.length > 0);

  return {
    title: session.task,
    summary: session.summary || "Computer Use completed.",
    markdown: [
      session.summary || "Computer Use completed.",
      session.urlsVisited.length > 0
        ? `Visited ${session.urlsVisited.length} page${session.urlsVisited.length === 1 ? "" : "s"}.`
        : null,
      `Completion reason: ${session.completionReason}.`,
    ].filter(Boolean).join("\n\n"),
    data: session.extractedData || {
      startUrl: session.startUrl,
      urlsVisited: session.urlsVisited,
      totalSteps: session.steps.length,
      totalDurationMs: session.totalDurationMs,
    },
    artifacts: latestScreenshot
      ? [
          {
            kind: "image",
            name: `Screenshot after step ${latestScreenshot.stepIndex + 1}`,
            dataUrl: `data:image/png;base64,${latestScreenshot.screenshot}`,
            mimeType: "image/png",
          },
        ]
      : undefined,
    meta: {
      startUrl: session.startUrl,
      urlsVisited: session.urlsVisited,
      totalSteps: session.steps.length,
      totalDurationMs: session.totalDurationMs,
      completionReason: session.completionReason,
    },
  };
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

  const body = await request.json().catch(() => null) as { message?: string; userId?: string } | null;
  const message = body?.message?.trim();

  if (!message) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  const extracted = await extractComputerUseRequest(message);

  if (!extracted.url) {
    return Response.json(
      { error: "I need a URL to run Computer Use. Include the page you want me to open." },
      { status: 400 }
    );
  }

  const creditEstimate = estimateComputerUseCost(
    "claude-sonnet-4-6",
    extracted.maxSteps,
    true,
    true
  );
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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        writeQuickUseEvent(controller, encoder, {
          type: "meta",
          meta: {
            estimatedCredits: creditEstimate.totalCredits,
            executionId,
          },
        });

        writeQuickUseEvent(controller, encoder, {
          type: "progress",
          message: `Preparing browser automation for ${extracted.url}...`,
        });

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
              writeQuickUseEvent(controller, encoder, {
                type: "progress",
                message: progressMessage,
              });
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

        const charge = await deductCreditsByAmount(
          userId,
          creditEstimate.totalCredits,
          "TASK_RUN",
          "quick_use_computer_use"
        );

        writeQuickUseEvent(controller, encoder, {
          type: "result",
          result: buildComputerUseResult(session),
          credits: {
            estimatedCredits: creditEstimate.totalCredits,
            creditsUsed: creditEstimate.totalCredits,
            creditsRemaining: charge.newBalance,
          },
        });
      } catch (error) {
        writeQuickUseEvent(controller, encoder, {
          type: "error",
          error: error instanceof Error ? error.message : "Computer Use failed",
          suggestions: [
            "Check that the URL is reachable.",
            "Make the task more specific.",
            "Try a smaller scope or fewer steps.",
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
