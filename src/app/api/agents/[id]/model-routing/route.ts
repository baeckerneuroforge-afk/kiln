import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ModelRoutingStrategy } from "@prisma/client";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const agent = await prisma.agent.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!agent) return Response.json({ error: "Agent nicht gefunden" }, { status: 404 });

  const config = await prisma.modelRoutingConfig.findUnique({
    where: { agentId: params.id },
  });

  // Prüfe welche Provider verfügbar sind
  const availableProviders: string[] = [];
  if (process.env.ANTHROPIC_API_KEY) availableProviders.push("anthropic");
  if (process.env.OPENAI_API_KEY) availableProviders.push("openai");
  if (process.env.GOOGLE_AI_API_KEY) availableProviders.push("google");
  if (process.env.PERPLEXITY_API_KEY) availableProviders.push("perplexity");

  return Response.json({
    strategy: config?.strategy?.toLowerCase() || "auto",
    overrides: config?.overrides || {},
    availableProviders,
  });
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const agent = await prisma.agent.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!agent) return Response.json({ error: "Agent nicht gefunden" }, { status: 404 });

  const body = await request.json();
  const strategy = String(body.strategy || "auto").toUpperCase() as ModelRoutingStrategy;
  const overrides = body.overrides || {};

  // Validate strategy
  const validStrategies: ModelRoutingStrategy[] = ["AUTO", "COST_OPTIMIZED", "SPEED_OPTIMIZED", "MANUAL"];
  if (!validStrategies.includes(strategy)) {
    return Response.json({ error: "Ungültige Strategie" }, { status: 400 });
  }

  await prisma.modelRoutingConfig.upsert({
    where: { agentId: params.id },
    create: {
      agentId: params.id,
      strategy,
      overrides,
    },
    update: {
      strategy,
      overrides,
    },
  });

  return Response.json({ ok: true });
}
