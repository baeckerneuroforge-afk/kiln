import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { createDatabaseEntry, buildLeadProperties } from "@/lib/integrations/notion";

/**
 * Export a captured lead to Notion database (if configured).
 * Designed to be called inside waitUntil() for non-blocking execution.
 */
export async function exportLeadToNotion(
  agentId: string,
  userId: string,
  data: {
    email: string;
    name?: string;
    conversationId?: string;
  }
): Promise<void> {
  try {
    // Find Notion connection
    const connection = await prisma.integrationConnection.findUnique({
      where: { userId_provider: { userId, provider: "notion" } },
    });

    if (!connection || !connection.isActive) return;

    // Find agent-level Notion integration
    const agentIntegration = await prisma.agentIntegration.findFirst({
      where: { agentId, integrationId: connection.id, enabled: true },
    });

    if (!agentIntegration?.config) return;

    const config = JSON.parse(agentIntegration.config) as {
      leadDatabaseId?: string | null;
    };

    if (!config.leadDatabaseId) return;

    // Get Notion access token
    const notionConfig = JSON.parse(decrypt(connection.config)) as {
      accessToken: string;
    };

    // Build conversation summary
    let summary = "";
    if (data.conversationId) {
      try {
        const messages = await prisma.message.findMany({
          where: { conversationId: data.conversationId },
          orderBy: { createdAt: "asc" },
          take: 10,
          select: { role: true, content: true },
        });
        summary = messages
          .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
          .join("\n");
      } catch {
        // Continue without summary
      }
    }

    // Create Notion database entry
    const properties = buildLeadProperties({
      name: data.name,
      email: data.email,
      summary,
      date: new Date().toISOString().split("T")[0],
    });

    await createDatabaseEntry(
      notionConfig.accessToken,
      config.leadDatabaseId,
      properties,
      summary ? `# Conversation Summary\n\n${summary}` : undefined
    );
  } catch (err) {
    console.error("Notion lead export failed:", err);
    // Silent failure — lead is already saved in KILN's own database
  }
}
