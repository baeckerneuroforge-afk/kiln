import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { TeamExecutionTaskStatus } from "@prisma/client";
import { estimateCost, singleAgentEquivalentCost, MODEL_PRICING } from "@/lib/model-pricing";
import { getModelDef } from "@/lib/ai";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const team = await prisma.agentTeam.findFirst({
      where: { id: params.id, userId },
      include: {
        members: {
          include: {
            agent: { select: { id: true, name: true, llmModel: true } },
          },
        },
      },
    });

    if (!team) {
      return Response.json({ error: "Team not found" }, { status: 404 });
    }

    // Lade alle completed Execution Logs mit Token-Daten
    const logs = await prisma.teamExecutionLog.findMany({
      where: {
        teamId: params.id,
        status: TeamExecutionTaskStatus.COMPLETED,
      },
      select: {
        agentId: true,
        tokensIn: true,
        tokensOut: true,
        model: true,
        estimatedCost: true,
        executionId: true,
      },
    });

    // Per-Agent Breakdown
    const agentStats = new Map<string, {
      agentId: string;
      agentName: string;
      model: string;
      modelLabel: string;
      totalTokensIn: number;
      totalTokensOut: number;
      totalCost: number;
      executionCount: number;
    }>();

    let totalTeamTokensIn = 0;
    let totalTeamTokensOut = 0;
    let totalTeamCost = 0;

    for (const log of logs) {
      const agentId = log.agentId || "unknown";
      const tokensIn = log.tokensIn || 0;
      const tokensOut = log.tokensOut || 0;
      const model = log.model || "claude-sonnet-4-20250514";
      const cost = log.estimatedCost || estimateCost(model, tokensIn, tokensOut);

      totalTeamTokensIn += tokensIn;
      totalTeamTokensOut += tokensOut;
      totalTeamCost += cost;

      const existing = agentStats.get(agentId);
      if (existing) {
        existing.totalTokensIn += tokensIn;
        existing.totalTokensOut += tokensOut;
        existing.totalCost += cost;
        existing.executionCount += 1;
      } else {
        const member = team.members.find((m) => m.agent?.id === agentId);
        const modelDef = getModelDef(model);
        agentStats.set(agentId, {
          agentId,
          agentName: member?.agent?.name || "Unknown Agent",
          model,
          modelLabel: modelDef?.shortLabel || model,
          totalTokensIn: tokensIn,
          totalTokensOut: tokensOut,
          totalCost: cost,
          executionCount: 1,
        });
      }
    }

    // Unique executions
    const uniqueExecutions = new Set(logs.map((l) => l.executionId));
    const executionCount = uniqueExecutions.size;

    // Single-agent equivalent (alles mit dem teuersten Modell)
    const singleAgentCost = singleAgentEquivalentCost(
      totalTeamTokensIn,
      totalTeamTokensOut
    );

    const savingsPercent = singleAgentCost > 0
      ? Math.round((1 - totalTeamCost / singleAgentCost) * 100)
      : 0;

    // Cost per execution
    const costPerExecution = executionCount > 0
      ? totalTeamCost / executionCount
      : 0;

    // Agent breakdown sorted by cost
    const agentBreakdown = Array.from(agentStats.values())
      .sort((a, b) => b.totalCost - a.totalCost)
      .map((agent) => ({
        ...agent,
        avgTokensIn: agent.executionCount > 0 ? Math.round(agent.totalTokensIn / agent.executionCount) : 0,
        avgTokensOut: agent.executionCount > 0 ? Math.round(agent.totalTokensOut / agent.executionCount) : 0,
        costPerExecution: agent.executionCount > 0 ? agent.totalCost / agent.executionCount : 0,
        totalCost: Number(agent.totalCost.toFixed(6)),
      }));

    // Modelle im Team und deren Preise
    const modelsUsed = Array.from(
      new Set(logs.map((l) => l.model).filter(Boolean))
    ).map((model) => {
      const modelDef = getModelDef(model!);
      const pricing = MODEL_PRICING[model!];
      return {
        model: model!,
        label: modelDef?.shortLabel || model!,
        inputPer1M: pricing?.inputPer1M || 0,
        outputPer1M: pricing?.outputPer1M || 0,
      };
    });

    return Response.json({
      totalCost: Number(totalTeamCost.toFixed(6)),
      totalTokensIn: totalTeamTokensIn,
      totalTokensOut: totalTeamTokensOut,
      executionCount,
      costPerExecution: Number(costPerExecution.toFixed(6)),
      singleAgentEquivalent: Number(singleAgentCost.toFixed(6)),
      savingsPercent: Math.max(0, savingsPercent),
      agentBreakdown,
      modelsUsed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
