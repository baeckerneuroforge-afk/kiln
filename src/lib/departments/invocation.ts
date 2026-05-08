import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { searchRelevantChunks } from "@/lib/rag";
import { executeWorkflow } from "@/lib/services/workflow-runtime";
import { executeAgentSwarm } from "@/lib/workflow-nodes/agent-swarm-node";
import { getAnthropicClientForUser } from "./anthropic-client";
import { asJsonRecord, toPrismaJson, truncateError } from "./json";
import type { DepartmentContext, InvocationResult } from "./types";

export async function invokeWorker(
  workerId: string,
  input: Record<string, unknown>,
  context: DepartmentContext
): Promise<InvocationResult> {
  const startedAt = Date.now();

  try {
    const worker = await prisma.departmentWorker.findFirst({
      where: {
        id: workerId,
        departmentId: context.departmentId,
        department: {
          OR: [
            { orgId: context.orgId },
            { orgId: null, userId: context.userId },
          ],
        },
      },
      include: { agent: true },
    });

    if (!worker) {
      return failure("AGENT", startedAt, `Worker ${workerId} not found`);
    }

    const agent = worker.agent;
    const model = agent.llmModel || "claude-sonnet-4-6";
    const client = await getAnthropicClientForUser(agent.userId, model);
    const knowledge = await loadKnowledgeContext(agent.id, input, context.orgId);

    const response = await client.messages.create({
      model,
      max_tokens: 1800,
      temperature: agent.temperature ?? 0.4,
      system: buildWorkerSystemPrompt(agent.systemPrompt, worker.role, knowledge),
      messages: [{ role: "user", content: JSON.stringify(input, null, 2) }],
    });

    const output = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    const durationMs = Date.now() - startedAt;
    const run = await prisma.agentRun.create({
      data: {
        orgId: context.orgId,
        agentId: agent.id,
        triggerType: "DEPARTMENT",
        input: toPrismaJson({
          departmentId: context.departmentId,
          backlogItemId: context.backlogItemId,
          workerRole: worker.role,
          input,
        }),
        output,
        outputAction: toPrismaJson({
          departmentId: context.departmentId,
          backlogItemId: context.backlogItemId,
          workerId,
        }),
        status: "SUCCESS",
        duration: durationMs,
        creditsUsed: 0,
      },
    });

    return {
      ok: true,
      invocationType: "AGENT",
      output: { text: output, agentId: agent.id, workerId, role: worker.role },
      runId: run.id,
      durationMs,
    };
  } catch (error) {
    const message = truncateError(error);
    await logFailedAgentRun(workerId, input, context, message, Date.now() - startedAt);
    return failure("AGENT", startedAt, message);
  }
}

export async function invokeWorkflow(
  workflowId: string,
  input: Record<string, unknown>,
  context: DepartmentContext
): Promise<InvocationResult> {
  const startedAt = Date.now();

  try {
    const workflow = await prisma.agentTeam.findFirst({
      where: {
        id: workflowId,
        OR: [
          { orgId: context.orgId },
          { orgId: null, userId: context.userId },
        ],
      },
      select: { id: true, goal: true },
    });

    if (!workflow) {
      return failure("WORKFLOW", startedAt, `Workflow ${workflowId} not found`);
    }

    const result = await executeWorkflow({
      teamId: workflow.id,
      userId: context.userId,
      triggerPayload: {
        ...input,
        departmentId: context.departmentId,
        backlogItemId: context.backlogItemId,
      },
      goal: workflow.goal || `Department workflow invocation ${workflow.id}`,
    });

    return {
      ok: true,
      invocationType: "WORKFLOW",
      output: result,
      runId: result.executionId,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return failure("WORKFLOW", startedAt, truncateError(error));
  }
}

export async function invokeSwarm(
  swarmConfig: Record<string, unknown>,
  input: Record<string, unknown>,
  context: DepartmentContext
): Promise<InvocationResult> {
  const startedAt = Date.now();

  try {
    const result = await executeAgentSwarm(
      {
        ...swarmConfig,
        userId: context.userId,
        goal:
          typeof swarmConfig.goal === "string"
            ? swarmConfig.goal
            : `Department swarm for ${context.departmentId}`,
      },
      {
        ...input,
        departmentId: context.departmentId,
        backlogItemId: context.backlogItemId,
        orgId: context.orgId,
        userId: context.userId,
      }
    );

    if (!result.success) {
      return failure("SWARM", startedAt, result.error || "Swarm invocation failed");
    }

    return {
      ok: true,
      invocationType: "SWARM",
      output: result.contextDelta,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return failure("SWARM", startedAt, truncateError(error));
  }
}

export async function invokeDraftedAction(
  draft: Record<string, unknown>,
  context: DepartmentContext
): Promise<InvocationResult> {
  const workerInvocation = asJsonRecord(draft.workerInvocation);
  if (workerInvocation.workerId) {
    return invokeWorker(
      String(workerInvocation.workerId),
      asJsonRecord(workerInvocation.input),
      context
    );
  }

  const workflowInvocation = asJsonRecord(draft.workflowInvocation);
  if (workflowInvocation.workflowId) {
    return invokeWorkflow(
      String(workflowInvocation.workflowId),
      asJsonRecord(workflowInvocation.input),
      context
    );
  }

  const swarmInvocation = asJsonRecord(draft.swarmInvocation);
  if (Object.keys(swarmInvocation).length > 0) {
    return invokeSwarm(
      asJsonRecord(swarmInvocation.config),
      asJsonRecord(swarmInvocation.input),
      context
    );
  }

  return {
    ok: true,
    invocationType: "DRAFT",
    output: {
      approvedDraft: draft,
      note: "No external action configured. Draft was approved and logged only.",
    },
    durationMs: 0,
  };
}

function buildWorkerSystemPrompt(rolePrompt: string, role: string, knowledge: string): string {
  return `${rolePrompt}

You are acting as the ${role} worker inside a Department. Return a concise, useful result for the manager.
${knowledge ? `\nRelevant knowledge:\n${knowledge}` : ""}`;
}

async function loadKnowledgeContext(
  agentId: string,
  input: Record<string, unknown>,
  orgId: string
): Promise<string> {
  try {
    const query = JSON.stringify(input).slice(0, 1000);
    const chunks = await searchRelevantChunks(agentId, query, 5, orgId);
    return chunks.map((chunk) => chunk.content).join("\n\n");
  } catch {
    return "";
  }
}

async function logFailedAgentRun(
  workerId: string,
  input: Record<string, unknown>,
  context: DepartmentContext,
  error: string,
  durationMs: number
) {
  const worker = await prisma.departmentWorker.findUnique({
    where: { id: workerId },
    select: { agentId: true },
  });
  if (!worker) return;

  await prisma.agentRun.create({
    data: {
      orgId: context.orgId,
      agentId: worker.agentId,
      triggerType: "DEPARTMENT",
      input: toPrismaJson({ departmentId: context.departmentId, input }),
      status: "ERROR",
      error,
      duration: durationMs,
      creditsUsed: 0,
    },
  });
}

function failure(
  invocationType: InvocationResult["invocationType"],
  startedAt: number,
  error: string
): InvocationResult {
  return {
    ok: false,
    invocationType,
    error,
    durationMs: Date.now() - startedAt,
  };
}
