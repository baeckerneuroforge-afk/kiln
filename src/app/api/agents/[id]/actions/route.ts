import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// Load actions for an agent
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
    });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const actions = await prisma.agentAction.findMany({
      where: { agentId: params.id },
    });

    return Response.json(actions);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Create or toggle action
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
    });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const { type, enabled, config } = await request.json();

    // Upsert: create if not exists, otherwise update
    const action = await prisma.agentAction.upsert({
      where: {
        agentId_type: { agentId: params.id, type },
      },
      update: {
        enabled: enabled ?? true,
        config: config ?? {},
      },
      create: {
        agentId: params.id,
        type,
        enabled: enabled ?? true,
        config: config ?? {},
      },
    });

    return Response.json(action);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
