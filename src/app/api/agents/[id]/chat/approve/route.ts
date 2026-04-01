import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import {
  executeApprovedWriteTool,
  type AgentIntegrationInfo,
} from "@/lib/services/integration-tools";

/**
 * POST /api/agents/[id]/chat/approve
 * Execute a previously approved write tool action.
 * Body: { toolName, params, conversationId }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { toolName, params: toolParams, conversationId } = body as {
      toolName: string;
      params: Record<string, unknown>;
      conversationId?: string;
    };

    if (!toolName || !toolParams) {
      return Response.json(
        { error: "toolName and params are required" },
        { status: 400 }
      );
    }

    // Verify agent ownership
    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId },
      include: {
        integrations: {
          where: { enabled: true },
          include: {
            integration: {
              select: { id: true, provider: true, config: true, isActive: true },
            },
          },
        },
      },
    });

    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const integrations: AgentIntegrationInfo[] = (agent.integrations || [])
      .filter((ai) => ai.integration.isActive)
      .map((ai) => ({
        provider: ai.integration.provider,
        connectionId: ai.integration.id,
        encryptedConfig: ai.integration.config,
      }));

    const result = await executeApprovedWriteTool(
      toolName,
      toolParams,
      params.id,
      integrations
    );

    // Log approved action
    if (conversationId) {
      await prisma.message.create({
        data: {
          conversationId,
          role: "SYSTEM",
          content: `[Approved: ${toolName}] ${result}`,
        },
      }).catch(() => {});
    }

    return Response.json(JSON.parse(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
