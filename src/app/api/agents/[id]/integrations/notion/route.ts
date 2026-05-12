import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import {
  searchNotion,
  getPageContent,
  getDatabaseSchema,
} from "@/lib/integrations/notion";
import { chunkText, generateEmbeddings, storeChunks } from "@/lib/rag";
import { deductEmbeddingCredits } from "@/lib/credits";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface NotionAgentConfig {
  kbPageIds?: { id: string; title: string }[];
  leadDatabaseId?: string | null;
  leadDatabaseTitle?: string | null;
  autoSyncEnabled?: boolean;
}

// GET: Status, search pages/databases, current config
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;

    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    // Check Notion connection
    const connection = await prisma.integrationConnection.findFirst({
      where: { userId, provider: "notion" },
    });

    if (!connection || !connection.isActive) {
      return Response.json({ connected: false, notionConnected: false });
    }

    const notionConfig = JSON.parse(decrypt(connection.config)) as {
      accessToken: string;
      workspaceName: string;
    };

    // Check if agent has Notion integration configured
    const agentIntegration = await prisma.agentIntegration.findFirst({
      where: { agentId, integrationId: connection.id },
    });

    const config: NotionAgentConfig = agentIntegration?.config
      ? JSON.parse(agentIntegration.config)
      : {};

    // Optional: search for pages/databases
    const action = request.nextUrl.searchParams.get("action");
    const query = request.nextUrl.searchParams.get("q") || "";

    if (action === "searchPages") {
      const results = await searchNotion(notionConfig.accessToken, query, "page");
      return Response.json({
        connected: !!agentIntegration,
        notionConnected: true,
        workspaceName: notionConfig.workspaceName,
        config,
        lastSyncAt: agentIntegration?.lastSyncAt || null,
        searchResults: results,
      });
    }

    if (action === "searchDatabases") {
      const results = await searchNotion(notionConfig.accessToken, query, "database");
      return Response.json({
        connected: !!agentIntegration,
        notionConnected: true,
        workspaceName: notionConfig.workspaceName,
        config,
        lastSyncAt: agentIntegration?.lastSyncAt || null,
        searchResults: results,
      });
    }

    if (action === "databaseSchema" && request.nextUrl.searchParams.get("dbId")) {
      const schema = await getDatabaseSchema(
        notionConfig.accessToken,
        request.nextUrl.searchParams.get("dbId")!
      );
      return Response.json({ schema });
    }

    return Response.json({
      connected: !!agentIntegration,
      notionConnected: true,
      workspaceName: notionConfig.workspaceName,
      config,
      lastSyncAt: agentIntegration?.lastSyncAt || null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST: Configure Notion for agent — set KB pages and/or lead database
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;
    const body = await request.json();
    const { action } = body;

    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    const connection = await prisma.integrationConnection.findFirst({
      where: { userId, provider: "notion" },
    });

    if (!connection || !connection.isActive) {
      return Response.json({ error: "Notion not connected" }, { status: 400 });
    }

    // Ensure AgentIntegration exists
    let agentIntegration = await prisma.agentIntegration.findFirst({
      where: { agentId, integrationId: connection.id },
    });

    if (!agentIntegration) {
      agentIntegration = await prisma.agentIntegration.create({
        data: {
          agentId,
          integrationId: connection.id,
          enabled: true,
          config: JSON.stringify({}),
        },
      });
    }

    const currentConfig: NotionAgentConfig = agentIntegration.config
      ? JSON.parse(agentIntegration.config)
      : {};

    if (action === "setKbPages") {
      // Save selected pages for KB sync
      const { pages } = body as { action: string; pages: { id: string; title: string }[] };
      currentConfig.kbPageIds = pages || [];

      await prisma.agentIntegration.update({
        where: { id: agentIntegration.id },
        data: { config: JSON.stringify(currentConfig) },
      });

      return Response.json({ success: true, config: currentConfig });
    }

    if (action === "setLeadDatabase") {
      // Save database for lead export
      const { databaseId, databaseTitle } = body as {
        action: string;
        databaseId: string | null;
        databaseTitle: string | null;
      };
      currentConfig.leadDatabaseId = databaseId;
      currentConfig.leadDatabaseTitle = databaseTitle;

      await prisma.agentIntegration.update({
        where: { id: agentIntegration.id },
        data: { config: JSON.stringify(currentConfig) },
      });

      return Response.json({ success: true, config: currentConfig });
    }

    if (action === "setAutoSync") {
      const { enabled } = body as { action: string; enabled: boolean };
      currentConfig.autoSyncEnabled = enabled;

      await prisma.agentIntegration.update({
        where: { id: agentIntegration.id },
        data: { config: JSON.stringify(currentConfig) },
      });

      return Response.json({ success: true, config: currentConfig });
    }

    if (action === "syncNow") {
      // Trigger immediate KB sync
      const notionTokens = JSON.parse(decrypt(connection.config)) as { accessToken: string };

      if (!currentConfig.kbPageIds || currentConfig.kbPageIds.length === 0) {
        return Response.json({ error: "No pages selected for sync" }, { status: 400 });
      }

      // Run sync in background
      waitUntil(
        syncNotionPages(
          agentId,
          userId,
          agentIntegration.id,
          notionTokens.accessToken,
          currentConfig.kbPageIds
        )
      );

      return Response.json({ success: true, syncing: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// DELETE: Disconnect Notion from agent
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id: agentId } = await params;

    const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });

    const connection = await prisma.integrationConnection.findFirst({
      where: { userId, provider: "notion" },
    });

    if (connection) {
      // Delete agent-level integration (not the user-level connection)
      await prisma.agentIntegration.deleteMany({
        where: { agentId, integrationId: connection.id },
      });
    }

    return Response.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Background: sync Notion pages → KB entries
async function syncNotionPages(
  agentId: string,
  userId: string,
  agentIntegrationId: string,
  accessToken: string,
  pages: { id: string; title: string }[]
) {
  const supabase = getSupabaseAdmin();
  let totalChunks = 0;

  for (const page of pages) {
    try {
      // Fetch page content from Notion
      const content = await getPageContent(accessToken, page.id);
      if (!content || content.trim().length < 50) continue;

      // Check if KB entry already exists for this Notion page
      const sourceName = `Notion: ${page.title}`;
      const existing = await prisma.knowledgeBase.findFirst({
        where: { agentId, sourceName },
      });

      if (existing) {
        // Delete old chunks
        await supabase
          .from("knowledge_chunks")
          .delete()
          .eq("knowledge_base_id", existing.id);

        // Update KB entry
        await prisma.knowledgeBase.update({
          where: { id: existing.id },
          data: {
            content: content.slice(0, 50000),
            embeddingStatus: "PROCESSING",
          },
        });

        // Re-embed
        const chunks = chunkText(content);
        const embeddings = await generateEmbeddings(chunks);
        await storeChunks(existing.id, agentId, chunks, embeddings);

        await prisma.knowledgeBase.update({
          where: { id: existing.id },
          data: { chunkCount: chunks.length, embeddingStatus: "READY" },
        });

        totalChunks += chunks.length;
      } else {
        // Create new KB entry
        const kb = await prisma.knowledgeBase.create({
          data: {
            agentId,
            type: "TEXT",
            sourceName,
            content: content.slice(0, 50000),
            embeddingStatus: "PROCESSING",
          },
        });

        const chunks = chunkText(content);
        const embeddings = await generateEmbeddings(chunks);
        await storeChunks(kb.id, agentId, chunks, embeddings);

        await prisma.knowledgeBase.update({
          where: { id: kb.id },
          data: { chunkCount: chunks.length, embeddingStatus: "READY" },
        });

        totalChunks += chunks.length;
      }
    } catch (err) {
      console.error(`Notion sync failed for page ${page.id}:`, err);
      // Continue with remaining pages
    }
  }

  // Update last sync time
  await prisma.agentIntegration.update({
    where: { id: agentIntegrationId },
    data: { lastSyncAt: new Date() },
  }).catch(() => {});

  // Deduct embedding credits
  if (totalChunks > 0) {
    deductEmbeddingCredits(userId, totalChunks, agentId).catch((err) => {
      console.error("Notion sync embedding credit deduction failed:", err);
    });
  }
}

// Exported for use in lead export and cron sync
