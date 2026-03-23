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
import type { QuickUseResult } from "@/lib/quick-use/types";
import { executeAgentSwarm } from "@/lib/workflow-nodes/agent-swarm-node";

export const dynamic = "force-dynamic";

const DECOMPOSITION_MODEL = "claude-sonnet-4-6";

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

  const body = await request.json().catch(() => null) as { message?: string; userId?: string } | null;
  const message = body?.message?.trim();

  if (!message) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  const decomposition = await decomposeGoal(message, {
    maxTasks: 8,
    model: DECOMPOSITION_MODEL,
    availableTools: ["computer_use", "code_sandbox", "mcp", "deep_research", "web_search"],
  });

  const decompositionCreditCost = getCreditCost(DECOMPOSITION_MODEL);
  const hasComputerUse = decomposition.tasks.some((task) => task.tools?.includes("computer_use"));

  // Model selection: computer_use tasks need Sonnet (Vision), text-only can use Haiku
  const modelPlan = decomposition.tasks.map((task) => {
    if (task.tools?.includes("computer_use")) return "claude-sonnet-4-6"; // Vision required
    if (task.suggestedModelTier === "fast") return "claude-haiku-4-5-20251001";
    return "claude-sonnet-4-6";
  });

  // Budget: 15 calls per agent for computer_use tasks, 8 for LLM-only
  const callsPerAgent = hasComputerUse ? 15 : 8;
  const baseEstimate = estimateSwarmCost(modelPlan, callsPerAgent, hasComputerUse);
  const estimatedCredits = baseEstimate.totalCredits + decompositionCreditCost;
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

        const resultKey = "quickSwarmResult";
        const result = await executeAgentSwarm(
          {
            goal: message,
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
            swarmMeta || {}
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
