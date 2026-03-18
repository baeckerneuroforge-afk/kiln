import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { searchRelevantChunks } from "@/lib/rag";
import { deductCredits } from "@/lib/credits";
import {
  runAgentComparisonVariant,
  sanitizeTestCompareConfig,
  serializeComparisonConfig,
} from "@/lib/agent-test-compare";

function buildComparisonSummary(comparisons: { winner: "A" | "B" | "SAME" | null }[]) {
  return comparisons.reduce(
    (acc, comparison) => {
      acc.total += 1;
      if (comparison.winner === "A") acc.winnerA += 1;
      if (comparison.winner === "B") acc.winnerB += 1;
      if (comparison.winner === "SAME") acc.winnerSame += 1;
      if (!comparison.winner) acc.unrated += 1;
      return acc;
    },
    { total: 0, winnerA: 0, winnerB: 0, winnerSame: 0, unrated: 0 }
  );
}

async function getOwnedAgent(id: string, userId: string) {
  return prisma.agent.findFirst({
    where: { id, userId },
    include: {
      knowledgeBases: {
        where: { embeddingStatus: "READY" },
        select: { id: true },
      },
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agent = await prisma.agent.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });

  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  const [history, allComparisons] = await Promise.all([
    prisma.testComparison.findMany({
      where: { agentId: params.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.testComparison.findMany({
      where: { agentId: params.id },
      select: { winner: true },
    }),
  ]);

  return Response.json({
    summary: buildComparisonSummary(allComparisons),
    history,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agent = await getOwnedAgent(params.id, userId);
  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  const body = await request.json();
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!message) {
    return Response.json({ error: "Message is required." }, { status: 400 });
  }

  let knowledgeContext = "";
  if (agent.knowledgeBases.length > 0) {
    try {
      const chunks = await searchRelevantChunks(params.id, message, 5);
      if (chunks.length > 0) {
        knowledgeContext = chunks.map((chunk, index) => `[${index + 1}] ${chunk.content}`).join("\n\n");
      }
    } catch {
      knowledgeContext = "";
    }
  }

  const configA = sanitizeTestCompareConfig(body?.configA, {
    systemPrompt: agent.systemPrompt,
    llmModel: agent.llmModel,
    temperature: agent.temperature,
    modelProvider: agent.modelProvider,
  });

  const configB = sanitizeTestCompareConfig(body?.configB, {
    systemPrompt: agent.systemPrompt,
    llmModel: agent.llmModel,
    temperature: agent.temperature,
    modelProvider: agent.modelProvider,
  });

  try {
    const [responseA, responseB] = await Promise.all([
      runAgentComparisonVariant({
        userId,
        message,
        config: configA,
        knowledgeContext,
      }),
      runAgentComparisonVariant({
        userId,
        message,
        config: configB,
        knowledgeContext,
      }),
    ]);

    const comparison = await prisma.testComparison.create({
      data: {
        agentId: params.id,
        message,
        responseA: responseA.text,
        responseB: responseB.text,
        configA: serializeComparisonConfig(configA),
        configB: serializeComparisonConfig(configB),
        responseTimeA: responseA.responseTimeMs,
        responseTimeB: responseB.responseTimeMs,
        tokenCountA: responseA.tokenCount,
        tokenCountB: responseB.tokenCount,
      },
    });

    waitUntil(
      Promise.all([
        deductCredits(userId, configA.llmModel, "CHAT", params.id),
        deductCredits(userId, configB.llmModel, "CHAT", params.id),
      ]).catch((err) => {
        console.error("Test Lab credit deduction failed:", err);
      })
    );

    return Response.json({
      id: comparison.id,
      createdAt: comparison.createdAt,
      winner: comparison.winner,
      configA: comparison.configA,
      configB: comparison.configB,
      responseA,
      responseB,
      message,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Comparison failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agent = await prisma.agent.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!agent) {
    return Response.json({ error: "Agent not found" }, { status: 404 });
  }

  const body = await request.json();
  const comparisonId = typeof body?.comparisonId === "string" ? body.comparisonId : "";
  const winner = body?.winner;

  if (!comparisonId) {
    return Response.json({ error: "comparisonId is required." }, { status: 400 });
  }

  if (winner !== "A" && winner !== "B" && winner !== "SAME") {
    return Response.json({ error: "winner must be A, B, or SAME." }, { status: 400 });
  }

  const existing = await prisma.testComparison.findFirst({
    where: { id: comparisonId, agentId: params.id },
  });

  if (!existing) {
    return Response.json({ error: "Comparison not found." }, { status: 404 });
  }

  const updated = await prisma.testComparison.update({
    where: { id: comparisonId },
    data: { winner },
  });

  const summary = buildComparisonSummary(
    await prisma.testComparison.findMany({
      where: { agentId: params.id },
      select: { winner: true },
    })
  );

  return Response.json({ comparison: updated, summary });
}
