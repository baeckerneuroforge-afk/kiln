import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { MODEL_PRICING, estimateCost, singleAgentEquivalentCost } from "@/lib/model-pricing";
import { getModelDef } from "@/lib/ai";

// POST: accepts team config, returns cost estimate
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { agents } = body;
    // agents: Array<{ model: string; role?: string; name?: string }>

    if (!agents || !Array.isArray(agents) || agents.length === 0) {
      return Response.json({ error: "At least one agent is required." }, { status: 400 });
    }

    // Assumed average tokens per agent call
    const AVG_TOKENS_IN = 1500;
    const AVG_TOKENS_OUT = 800;

    const breakdown = agents.map((agent: { model: string; role?: string; name?: string }) => {
      const modelDef = getModelDef(agent.model);
      const pricing = MODEL_PRICING[agent.model];
      const cost = pricing
        ? estimateCost(agent.model, AVG_TOKENS_IN, AVG_TOKENS_OUT)
        : 0;

      return {
        name: agent.name || modelDef?.shortLabel || agent.model,
        model: agent.model,
        modelLabel: modelDef?.label || agent.model,
        role: agent.role || "EXECUTOR",
        estimatedTokensIn: AVG_TOKENS_IN,
        estimatedTokensOut: AVG_TOKENS_OUT,
        estimatedCost: cost,
      };
    });

    const totalCostPerExecution = breakdown.reduce((sum, a) => sum + a.estimatedCost, 0);
    const totalTokensIn = AVG_TOKENS_IN * agents.length;
    const totalTokensOut = AVG_TOKENS_OUT * agents.length;
    const singleAgentCost = singleAgentEquivalentCost(totalTokensIn, totalTokensOut);
    const savingsPercent = singleAgentCost > 0
      ? Math.round((1 - totalCostPerExecution / singleAgentCost) * 100)
      : 0;

    return Response.json({
      costPerExecution: totalCostPerExecution,
      singleAgentEquivalent: singleAgentCost,
      savingsPercent: Math.max(0, savingsPercent),
      breakdown,
      projections: {
        monthly100: totalCostPerExecution * 100,
        monthly500: totalCostPerExecution * 500,
        monthly1000: totalCostPerExecution * 1000,
      },
    });
  } catch (err) {
    console.error("POST /api/teams/estimate-cost error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
