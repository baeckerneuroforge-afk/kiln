import { prisma } from "@/lib/prisma";
import {
  getHubSpotIntegrationForUser,
  type HubSpotPipeline,
} from "@/lib/integrations/hubspot";

export interface HubSpotRecentSync {
  id: string;
  type: "contact" | "deal" | "note";
  label: string;
  contactEmail?: string | null;
  contactName?: string | null;
  at: string;
  status: "success" | "error";
  error?: string | null;
}

export interface HubSpotAgentConfig {
  autoSyncEnabled?: boolean;
  pipelineId?: string | null;
  stageId?: string | null;
  recentSyncs?: HubSpotRecentSync[];
}

interface HubSpotAgentContext {
  agent: { id: string; userId: string; name: string };
  integrationConnectionId: string;
  agentIntegrationId: string;
  agentConfig: HubSpotAgentConfig;
  pipelines: HubSpotPipeline[];
}

function parseHubSpotAgentConfig(config?: string | null): HubSpotAgentConfig {
  if (!config) return {};
  try {
    return JSON.parse(config) as HubSpotAgentConfig;
  } catch {
    return {};
  }
}

function splitName(name?: string | null) {
  const trimmed = name?.trim();
  if (!trimmed) {
    return { firstName: "", lastName: "" };
  }

  const parts = trimmed.split(/\s+/);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

async function buildConversationSummary(conversationId: string) {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 12,
    select: {
      role: true,
      content: true,
    },
  });

  return messages
    .map((message) => `${message.role}: ${message.content.slice(0, 280)}`)
    .join("\n")
    .slice(0, 4000);
}

async function loadHubSpotAgentContext(agentId: string): Promise<HubSpotAgentContext | null> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      userId: true,
      name: true,
    },
  });

  if (!agent) {
    return null;
  }

  const hubspot = await getHubSpotIntegrationForUser(agent.userId);
  if (!hubspot) {
    return null;
  }

  const agentIntegration = await prisma.agentIntegration.findFirst({
    where: {
      agentId,
      integrationId: hubspot.connection.id,
      enabled: true,
    },
    select: {
      id: true,
      config: true,
    },
  });

  if (!agentIntegration) {
    return null;
  }

  const pipelines = await hubspot.integration.listDealPipelines().catch(() => []);

  return {
    agent,
    integrationConnectionId: hubspot.connection.id,
    agentIntegrationId: agentIntegration.id,
    agentConfig: parseHubSpotAgentConfig(agentIntegration.config),
    pipelines,
  };
}

async function markHubSpotSync(
  agentIntegrationId: string,
  integrationConnectionId: string,
  entry: HubSpotRecentSync
) {
  const latest = await prisma.agentIntegration.findUnique({
    where: { id: agentIntegrationId },
    select: { config: true },
  });

  const currentConfig = parseHubSpotAgentConfig(latest?.config);
  const recentSyncs = [entry, ...(currentConfig.recentSyncs || [])].slice(0, 8);

  await prisma.agentIntegration.update({
    where: { id: agentIntegrationId },
    data: {
      config: JSON.stringify({
        ...currentConfig,
        recentSyncs,
      }),
      lastSyncAt: new Date(),
    },
  });

  await prisma.integrationConnection.update({
    where: { id: integrationConnectionId },
    data: { lastSyncAt: new Date() },
  });
}

function buildLeadNote(params: {
  agentName: string;
  email: string;
  summary: string;
  name?: string | null;
}) {
  return [
    `Lead synced from KILN agent: ${params.agentName}`,
    params.name ? `Name: ${params.name}` : null,
    `Email: ${params.email}`,
    `Date: ${new Date().toISOString()}`,
    params.summary ? `Conversation summary:\n${params.summary}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildConversationNote(params: {
  agentName: string;
  summary: string;
  name?: string | null;
  email: string;
}) {
  return [
    `Conversation note from KILN agent: ${params.agentName}`,
    params.name ? `Visitor: ${params.name}` : null,
    `Email: ${params.email}`,
    `Captured at: ${new Date().toISOString()}`,
    params.summary ? `Summary:\n${params.summary}` : "No summary available.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function upsertHubSpotContact(params: {
  userId: string;
  email: string;
  name?: string | null;
  agentName: string;
  summary: string;
}) {
  const hubspot = await getHubSpotIntegrationForUser(params.userId);
  if (!hubspot) {
    return null;
  }

  const { integration } = hubspot;
  const { firstName, lastName } = splitName(params.name);
  const existing = await integration.searchContacts(params.email);
  const contact = existing[0] || null;

  const richProperties = {
    email: params.email,
    firstname: firstName || undefined,
    lastname: lastName || undefined,
    lifecyclestage: "lead",
    kiln_source_agent: params.agentName,
    kiln_last_conversation_date: new Date().toISOString(),
    kiln_last_conversation_summary: params.summary.slice(0, 2000) || undefined,
  };

  const fallbackProperties = {
    email: params.email,
    firstname: firstName || undefined,
    lastname: lastName || undefined,
    lifecyclestage: "lead",
  };

  if (contact) {
    try {
      return await integration.updateContact(contact.id, richProperties);
    } catch {
      return integration.updateContact(contact.id, fallbackProperties);
    }
  }

  try {
    return await integration.createContact(richProperties);
  } catch {
    return integration.createContact(fallbackProperties);
  }
}

export async function syncLeadToHubSpot(params: {
  agentId: string;
  email: string;
  name?: string | null;
  conversationId?: string;
}) {
  try {
    if (!params.email || !params.email.includes("@")) {
      return;
    }

    const context = await loadHubSpotAgentContext(params.agentId);
    if (!context || !context.agentConfig.autoSyncEnabled) {
      return;
    }

    const summary = params.conversationId
      ? await buildConversationSummary(params.conversationId)
      : "";
    const contact = await upsertHubSpotContact({
      userId: context.agent.userId,
      email: params.email,
      name: params.name,
      agentName: context.agent.name,
      summary,
    });

    const hubspot = await getHubSpotIntegrationForUser(context.agent.userId);
    if (!hubspot || !contact?.id) {
      return;
    }

    await hubspot.integration.addNote(
      contact.id,
      buildLeadNote({
        agentName: context.agent.name,
        email: params.email,
        name: params.name,
        summary,
      })
    );

    await markHubSpotSync(context.agentIntegrationId, context.integrationConnectionId, {
      id: `${Date.now()}-contact`,
      type: "contact",
      label: "Contact synced",
      contactEmail: params.email,
      contactName: params.name || null,
      at: new Date().toISOString(),
      status: "success",
    });
  } catch (error) {
    console.error("HubSpot lead sync failed:", error);
  }
}

export async function syncAppointmentDealToHubSpot(params: {
  agentId: string;
  email: string;
  name?: string | null;
  conversationId?: string;
  start?: string | null;
  reason?: string | null;
}) {
  try {
    if (!params.email || !params.email.includes("@")) {
      return;
    }

    const context = await loadHubSpotAgentContext(params.agentId);
    if (!context || !context.agentConfig.autoSyncEnabled) {
      return;
    }

    const hubspot = await getHubSpotIntegrationForUser(context.agent.userId);
    if (!hubspot) {
      return;
    }

    const summary = params.conversationId
      ? await buildConversationSummary(params.conversationId)
      : "";
    const contact = await upsertHubSpotContact({
      userId: context.agent.userId,
      email: params.email,
      name: params.name,
      agentName: context.agent.name,
      summary,
    });

    if (!contact?.id) {
      return;
    }

    const selectedPipeline =
      context.pipelines.find((pipeline) => pipeline.id === context.agentConfig.pipelineId) ||
      context.pipelines[0] ||
      null;
    const selectedStage =
      selectedPipeline?.stages.find((stage) => stage.id === context.agentConfig.stageId) ||
      selectedPipeline?.stages[0] ||
      null;

    await hubspot.integration.createDeal({
      dealname: `${context.agent.name} appointment`,
      pipeline: selectedPipeline?.id || undefined,
      dealstage: selectedStage?.id || undefined,
      closedate: params.start || new Date().toISOString(),
      description: params.reason || summary || `Appointment booked via ${context.agent.name}`,
      associations: [
        {
          to: { id: contact.id },
          types: [
            {
              associationCategory: "HUBSPOT_DEFINED",
              associationTypeId: 3,
            },
          ],
        },
      ],
    });

    await markHubSpotSync(context.agentIntegrationId, context.integrationConnectionId, {
      id: `${Date.now()}-deal`,
      type: "deal",
      label: "Deal created",
      contactEmail: params.email,
      contactName: params.name || null,
      at: new Date().toISOString(),
      status: "success",
    });
  } catch (error) {
    console.error("HubSpot deal sync failed:", error);
  }
}

export async function logConversationToHubSpot(params: {
  agentId: string;
  conversationId: string;
}) {
  try {
    const context = await loadHubSpotAgentContext(params.agentId);
    if (!context || !context.agentConfig.autoSyncEnabled) {
      return;
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: params.conversationId },
      select: {
        visitorEmail: true,
        visitorName: true,
      },
    });

    if (!conversation?.visitorEmail) {
      return;
    }

    const summary = await buildConversationSummary(params.conversationId);
    const hubspot = await getHubSpotIntegrationForUser(context.agent.userId);
    if (!hubspot) {
      return;
    }

    const contact = await upsertHubSpotContact({
      userId: context.agent.userId,
      email: conversation.visitorEmail,
      name: conversation.visitorName,
      agentName: context.agent.name,
      summary,
    });

    if (!contact?.id) {
      return;
    }

    await hubspot.integration.addNote(
      contact.id,
      buildConversationNote({
        agentName: context.agent.name,
        summary,
        email: conversation.visitorEmail,
        name: conversation.visitorName,
      })
    );

    await markHubSpotSync(context.agentIntegrationId, context.integrationConnectionId, {
      id: `${Date.now()}-note`,
      type: "note",
      label: "Conversation note added",
      contactEmail: conversation.visitorEmail,
      contactName: conversation.visitorName,
      at: new Date().toISOString(),
      status: "success",
    });
  } catch (error) {
    console.error("HubSpot conversation note sync failed:", error);
  }
}

export { parseHubSpotAgentConfig };
