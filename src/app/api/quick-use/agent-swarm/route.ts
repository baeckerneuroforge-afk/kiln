import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { canAffordExecution, estimateSwarmCost } from "@/lib/cost/cost-estimator";
import { deductCreditsByAmount, getCreditCost } from "@/lib/credits";
import { decomposeGoal } from "@/lib/execution/task-decomposer";
import { SwarmEventStream, type SwarmEvent } from "@/lib/execution/swarm-event-stream";
import { checkFeatureAccess } from "@/lib/feature-access";
import {
  QUICK_USE_STREAM_HEADERS,
  createQuickUseExecutionContext,
  getExecutionIdFromContext,
  writeQuickUseDone,
  writeQuickUseEvent,
} from "@/lib/quick-use/server";
import type { QuickUseFileAttachment, QuickUseResult } from "@/lib/quick-use/types";
import { processFiles, buildFileContext } from "@/lib/quick-use/file-processor";
import { executeAgentSwarm } from "@/lib/workflow-nodes/agent-swarm-node";

export const dynamic = "force-dynamic";

const DECOMPOSITION_MODEL_BROWSER = "claude-sonnet-4-6";
const DECOMPOSITION_MODEL_TEXT = "claude-haiku-4-5-20251001";
const DOMAIN_REGEX = /https?:\/\/|(?:^|\s)[a-z0-9-]+(?:\.[a-z0-9-]+)+/i;

function detectRequiredTools(message: string, hasFiles: boolean): Array<"computer_use" | "code_sandbox" | "mcp" | "deep_research" | "web_search"> {
  const lower = message.toLowerCase();
  const tools = new Set<"computer_use" | "code_sandbox" | "mcp" | "deep_research" | "web_search">(["web_search"]);

  const hasUrls = DOMAIN_REGEX.test(message);
  const browserKeywords = [
    "website",
    "browse",
    "check price on",
    "price on",
    "visit",
    "go to",
    "open",
    "screenshot",
    "fill form",
    "login",
    "navigate",
    "scrape",
    "check on",
  ];
  const hasBrowserIntent = browserKeywords.some((keyword) => lower.includes(keyword));
  const compareOnSitesPattern = /compare[\s\S]{0,80}\bon\b[\s\S]{0,120}(?:,| and )/i.test(lower);
  const checkSitePattern = /check[\s\S]{0,80}\b(?:on|at)\b[\s\S]{0,120}/i.test(lower);
  const fileOnlyIntent = hasFiles
    && !hasUrls
    && /(pdf|pdfs|csv|spreadsheet|file|files|document|documents)/i.test(lower)
    && !hasBrowserIntent;

  if (!fileOnlyIntent && (hasUrls || hasBrowserIntent || compareOnSitesPattern || checkSitePattern)) {
    tools.add("computer_use");
  }

  const codeKeywords = [
    "excel",
    "spreadsheet",
    "chart",
    "graph",
    "calculate",
    "csv",
    "data",
    "table",
    "analyze data",
    "compare data",
    "report",
    "pdf",
    "generate a pdf",
    "make an excel",
  ];
  const hasCodeIntent = codeKeywords.some((keyword) => lower.includes(keyword));
  const fileAnalysisIntent = hasFiles
    && /(analy[sz]e|compare|summari[sz]e|extract|review|report|table|chart|graph|calculate)/i.test(lower);

  if (hasCodeIntent || fileAnalysisIntent) {
    tools.add("code_sandbox");
  }

  const mcpKeywords = ["slack", "email", "gmail", "calendar", "notion", "sheets"];
  if (mcpKeywords.some((keyword) => lower.includes(keyword))) {
    tools.add("mcp");
  }

  const researchKeywords = ["research", "find out", "latest", "current", "news", "market", "regulation", "trends"];
  if (researchKeywords.some((keyword) => lower.includes(keyword))) {
    tools.add("deep_research");
  }

  if (hasFiles && !hasUrls) {
    tools.delete("computer_use");
  }

  return Array.from(tools);
}

function buildToolDetectionConstraints(
  detectedTools: string[],
  hasFiles: boolean,
  hasUrls: boolean
): string[] {
  const constraints: string[] = [];

  if (!detectedTools.includes("computer_use")) {
    constraints.push("Do not assign computer_use unless direct website interaction is explicitly required.");
  }

  if (hasFiles && !hasUrls) {
    constraints.push("The request appears file-centric. Prefer code_sandbox and text tools over browser work.");
  }

  if (detectedTools.includes("computer_use")) {
    constraints.push("When decomposing site comparisons, prefer one independent browse task per site.");
  }

  if (detectedTools.includes("code_sandbox")) {
    constraints.push("Include file generation or data-processing tasks when useful for the final output.");
  }

  return constraints;
}

function estimateDetectedSwarmCredits(agentCount: number, detectedTools: string[], decompositionCredits: number): {
  totalCredits: number;
  perAgentCredits: number;
  summary: string;
} {
  const hasComputerUse = detectedTools.includes("computer_use");
  const perAgentCredits = hasComputerUse ? 20 : 5;
  const codePremium = detectedTools.includes("code_sandbox") ? 5 : 0;
  const totalCredits = Math.max(1, (agentCount * perAgentCredits) + codePremium + decompositionCredits);
  const summary = `Estimated cost: ~${totalCredits} credits for ${agentCount} agent${agentCount === 1 ? "" : "s"} ${hasComputerUse ? "with browser" : "text only"}.`;

  return {
    totalCredits,
    perAgentCredits,
    summary,
  };
}

function summarizeSwarmEvent(event: SwarmEvent): string | null {
  switch (event.type) {
    case "swarm.started":
      return `Spawning ${Number(event.data.totalAgents) || 0} agents...`;
    case "agent.started":
      return `${String(event.data.agentId)} started: ${String(event.data.task || "")}`;
    case "agent.tool_called":
      return `${String(event.data.agentId)} is using ${String(event.data.tool)}...`;
    case "merge.started":
      return "Merging agent findings...";
    case "merge.completed":
      return `Merge completed with quality score ${Number(event.data.qualityScore) || 0}.`;
    case "swarm.completed":
      return "Agent Swarm completed.";
    default:
      return null;
  }
}

function summarizeFinding(event: SwarmEvent): string | null {
  if (event.type !== "agent.finding") return null;
  return `${String(event.data.agentId)} found ${String(event.data.key)}: ${String(event.data.value).slice(0, 180)}`;
}

function buildSwarmResult(goal: string, output: unknown, meta: Record<string, unknown>): QuickUseResult {
  const markdown = typeof output === "string" ? output : undefined;
  const summary = typeof output === "string"
    ? output.slice(0, 240) || "Agent Swarm completed."
    : `Agent Swarm completed with ${Number(meta.totalAgents) || 0} agents.`;

  return {
    title: goal,
    summary,
    markdown,
    data: typeof output === "string" ? undefined : output,
    qualityScore: Number(meta.mergeQualityScore) || undefined,
    meta,
  };
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await checkFeatureAccess(userId, "agentSwarm");
  if (!access.allowed) {
    return Response.json({ error: access.upgradeMessage }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as {
    message?: string;
    userId?: string;
    hasFiles?: boolean;
    files?: QuickUseFileAttachment[];
  } | null;
  const message = body?.message?.trim();
  const fileAttachments = Array.isArray(body?.files) ? body.files : [];
  const hasFiles = fileAttachments.length > 0 || Boolean(body?.hasFiles);

  if (!message) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  // Process uploaded files to extract content
  let fileContext = "";
  if (fileAttachments.length > 0) {
    const processed = await processFiles(fileAttachments);
    fileContext = buildFileContext(processed);
  }

  const detectedTools = detectRequiredTools(message, hasFiles);
  const hasUrls = DOMAIN_REGEX.test(message);
  const decompositionModel = detectedTools.includes("computer_use")
    ? DECOMPOSITION_MODEL_BROWSER
    : DECOMPOSITION_MODEL_TEXT;

  const goalWithFiles = fileContext
    ? `${message}\n\n${fileContext}`
    : message;

  const decomposition = await decomposeGoal(goalWithFiles, {
    maxTasks: 8,
    model: decompositionModel,
    availableTools: detectedTools,
    constraints: buildToolDetectionConstraints(detectedTools, hasFiles, hasUrls),
  });

  const decompositionCreditCost = getCreditCost(decompositionModel);
  const hasComputerUse = decomposition.tasks.some((task) => task.tools?.includes("computer_use"))
    || detectedTools.includes("computer_use");

  // Model selection: computer_use tasks need Sonnet (Vision), text-only can use Haiku
  const modelPlan = decomposition.tasks.map((task) => {
    if (task.tools?.includes("computer_use")) return "claude-sonnet-4-6"; // Vision required
    if (!hasComputerUse && task.suggestedModelTier !== "powerful" && task.modelPreference !== "deep_reasoning") {
      return "claude-haiku-4-5-20251001";
    }
    if (task.suggestedModelTier === "fast") return "claude-haiku-4-5-20251001";
    return "claude-sonnet-4-6";
  });

  // Budget: 15 calls per agent for computer_use tasks, 8 for LLM-only
  const callsPerAgent = hasComputerUse ? 15 : 8;
  const baseEstimate = estimateSwarmCost(modelPlan, callsPerAgent, hasComputerUse);
  const roughEstimate = estimateDetectedSwarmCredits(
    Math.max(1, decomposition.tasks.length),
    detectedTools,
    decompositionCreditCost
  );
  const estimatedCredits = Math.max(
    baseEstimate.totalCredits + decompositionCreditCost,
    roughEstimate.totalCredits
  );
  const affordability = await canAffordExecution(
    userId,
    { ...baseEstimate, totalCredits: estimatedCredits }
  );

  if (!affordability.affordable) {
    return Response.json(
      {
        error: `Not enough credits. This run is estimated at ${estimatedCredits} credits and your balance is ${affordability.balance}.`,
      },
      { status: 402 }
    );
  }

  const decompositionCharge = await deductCreditsByAmount(
    userId,
    decompositionCreditCost,
    "TASK_RUN",
    "quick_use_agent_swarm_decomposition"
  );

  if (!decompositionCharge.success) {
    return Response.json(
      { error: "Not enough credits to start the swarm." },
      { status: 402 }
    );
  }

  const context = createQuickUseExecutionContext("agent-swarm", userId);
  const executionId = getExecutionIdFromContext(context);
  const eventStream = new SwarmEventStream();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let streamClosed = false;

      const safeWrite = (event: Parameters<typeof writeQuickUseEvent>[2]) => {
        if (streamClosed) return;
        writeQuickUseEvent(controller, encoder, event);
      };

      const unsubscribe = eventStream.on((event) => {
        safeWrite({ type: "swarm_event", event });

        const progress = summarizeSwarmEvent(event);
        if (progress) {
          safeWrite({ type: "progress", message: progress });
        }

        const finding = summarizeFinding(event);
        if (finding) {
          safeWrite({ type: "finding", message: finding });
        }
      });

      try {
        safeWrite({
          type: "meta",
          meta: {
            estimatedCredits,
            executionId,
          },
        });

        safeWrite({
          type: "progress",
          message: `Prepared ${decomposition.tasks.length} subtask${decomposition.tasks.length === 1 ? "" : "s"} for the swarm.`,
        });

        safeWrite({
          type: "progress",
          message: roughEstimate.summary,
        });

        const resultKey = "quickSwarmResult";
        const result = await executeAgentSwarm(
          {
            goal: goalWithFiles,
            maxAgents: Math.max(2, decomposition.tasks.length),
            maxParallel: Math.max(2, Math.min(4, decomposition.tasks.length)),
            mergeStrategy: "synthesize",
            timeoutPerAgent: 180,
            budgetCredits: Math.max(1, estimatedCredits - decompositionCreditCost),
            taskDecomposition: decomposition,
            eventStream,
            resultKey,
          },
          context
        );

        if (!result.success) {
          throw new Error(result.error || "Agent Swarm failed");
        }

        const swarmMeta = result.contextDelta[`${resultKey}_meta`] as Record<string, unknown> | undefined;
        const totalCreditsUsed = Number(swarmMeta?.totalCreditsUsed) || 0;
        const finalCharge = await deductCreditsByAmount(
          userId,
          totalCreditsUsed,
          "TASK_RUN",
          "quick_use_agent_swarm"
        );

        safeWrite({
          type: "result",
          result: buildSwarmResult(
            message,
            result.contextDelta[resultKey],
            {
              ...(swarmMeta || {}),
              detectedTools,
              decompositionModel,
              roughPerAgentCredits: roughEstimate.perAgentCredits,
            }
          ),
          credits: {
            estimatedCredits,
            creditsUsed: totalCreditsUsed + decompositionCreditCost,
            creditsRemaining: finalCharge.newBalance,
          },
        });
      } catch (error) {
        safeWrite({
          type: "error",
          error: error instanceof Error ? error.message : "Agent Swarm failed",
          suggestions: [
            "Reduce the scope of the task.",
            "List the comparison targets explicitly.",
            "Retry if one of the providers timed out.",
          ],
        });
      } finally {
        streamClosed = true;
        unsubscribe();
        writeQuickUseDone(controller, encoder);
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: QUICK_USE_STREAM_HEADERS });
}
