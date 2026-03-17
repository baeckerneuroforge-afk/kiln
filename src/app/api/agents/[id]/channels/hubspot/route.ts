import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getHubSpotIntegrationForUser } from "@/lib/integrations/hubspot";
import { parseHubSpotAgentConfig } from "@/lib/services/hubspot-sync";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: agentId } = await params;
    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const hubspot = await getHubSpotIntegrationForUser(userId);
    if (!hubspot) {
      return Response.json({
        connected: false,
        hubspotConnected: false,
        pipelines: [],
        recentSyncs: [],
      });
    }

    const agentIntegration = await prisma.agentIntegration.findFirst({
      where: {
        agentId,
        integrationId: hubspot.connection.id,
      },
    });

    const agentConfig = parseHubSpotAgentConfig(agentIntegration?.config);
    const pipelines = await hubspot.integration.listDealPipelines().catch(() => []);
    const selectedPipeline =
      pipelines.find((pipeline) => pipeline.id === agentConfig.pipelineId) ||
      pipelines[0] ||
      null;
    const selectedStage =
      selectedPipeline?.stages.find((stage) => stage.id === agentConfig.stageId) ||
      selectedPipeline?.stages[0] ||
      null;

    return Response.json({
      connected: Boolean(agentIntegration),
      hubspotConnected: true,
      name: hubspot.connection.name,
      accountLabel: hubspot.config.accountLabel || hubspot.connection.name,
      isActive: hubspot.connection.isActive,
      autoSyncEnabled: agentConfig.autoSyncEnabled ?? true,
      selectedPipelineId: selectedPipeline?.id || null,
      selectedStageId: selectedStage?.id || null,
      pipelines,
      recentSyncs: agentConfig.recentSyncs || [],
      lastSyncAt: agentIntegration?.lastSyncAt || hubspot.connection.lastSyncAt || null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: agentId } = await params;
    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const hubspot = await getHubSpotIntegrationForUser(userId);
    if (!hubspot) {
      return Response.json(
        { error: "HubSpot not connected. Connect HubSpot first." },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const existing = await prisma.agentIntegration.findFirst({
      where: {
        agentId,
        integrationId: hubspot.connection.id,
      },
    });
    const currentConfig = parseHubSpotAgentConfig(existing?.config);
    const pipelines = await hubspot.integration.listDealPipelines().catch(() => []);

    const requestedPipelineId =
      typeof body.pipelineId === "string" && body.pipelineId
        ? body.pipelineId
        : currentConfig.pipelineId || pipelines[0]?.id || null;
    const selectedPipeline =
      pipelines.find((pipeline) => pipeline.id === requestedPipelineId) ||
      null;

    if (requestedPipelineId && pipelines.length > 0 && !selectedPipeline) {
      return Response.json({ error: "Selected pipeline not found" }, { status: 400 });
    }

    const requestedStageId =
      typeof body.stageId === "string" && body.stageId
        ? body.stageId
        : currentConfig.stageId ||
          selectedPipeline?.stages[0]?.id ||
          null;
    const selectedStage =
      selectedPipeline?.stages.find((stage) => stage.id === requestedStageId) ||
      null;

    if (requestedStageId && selectedPipeline && !selectedStage) {
      return Response.json({ error: "Selected stage not found in pipeline" }, { status: 400 });
    }

    const nextConfig = {
      ...currentConfig,
      autoSyncEnabled:
        typeof body.autoSyncEnabled === "boolean"
          ? body.autoSyncEnabled
          : currentConfig.autoSyncEnabled ?? true,
      pipelineId: selectedPipeline?.id || null,
      stageId: selectedStage?.id || null,
    };

    const assignment = await prisma.agentIntegration.upsert({
      where: {
        agentId_integrationId: {
          agentId,
          integrationId: hubspot.connection.id,
        },
      },
      create: {
        agentId,
        integrationId: hubspot.connection.id,
        enabled: true,
        config: JSON.stringify(nextConfig),
      },
      update: {
        enabled: true,
        config: JSON.stringify(nextConfig),
      },
    });

    return Response.json({
      success: true,
      connected: true,
      assignmentId: assignment.id,
      autoSyncEnabled: nextConfig.autoSyncEnabled,
      selectedPipelineId: nextConfig.pipelineId,
      selectedStageId: nextConfig.stageId,
      pipelines,
      recentSyncs: currentConfig.recentSyncs || [],
      lastSyncAt: assignment.lastSyncAt || hubspot.connection.lastSyncAt || null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: agentId } = await params;
    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const hubspot = await getHubSpotIntegrationForUser(userId);
    if (hubspot) {
      await prisma.agentIntegration.deleteMany({
        where: {
          agentId,
          integrationId: hubspot.connection.id,
        },
      });
    }

    return Response.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
