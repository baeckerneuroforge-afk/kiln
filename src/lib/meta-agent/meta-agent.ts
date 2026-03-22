import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { knowledgeGraph } from "@/lib/knowledge/knowledge-graph";

const META_AGENT_MODEL = "claude-sonnet-4-20250514";

const META_AGENT_SYSTEM_PROMPT = `Du bist KILN Assistant — der intelligente Assistent der KILN AI Creation Platform.

Du hilfst Nutzern, ihre KILN-Plattform zu verwalten:
- Neue AI Agents erstellen (frage nach Name, Beschreibung, Zweck)
- Bestehende Agents auflisten und beschreiben
- Agent-Analytics und ROI-Daten abrufen
- Workflows starten/stoppen
- Marketplace nach Agents durchsuchen
- KILN-Features erklären
- Bei Problemen helfen

Antworte immer auf Deutsch. Sei hilfreich, präzise und proaktiv.
Wenn du eine Aktion ausführst, erkläre kurz was du tust.`;

const META_AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "list_agents",
    description: "Alle Agents des Nutzers auflisten",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "create_agent",
    description: "Einen neuen AI Agent erstellen",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string" as const, description: "Name des Agents" },
        description: {
          type: "string" as const,
          description: "Beschreibung des Agents",
        },
        systemPrompt: {
          type: "string" as const,
          description: "System-Prompt für den Agent",
        },
      },
      required: ["name", "description", "systemPrompt"],
    },
  },
  {
    name: "get_agent_analytics",
    description: "Analytics eines Agents abrufen",
    input_schema: {
      type: "object" as const,
      properties: {
        agentId: { type: "string" as const, description: "ID des Agents" },
      },
      required: ["agentId"],
    },
  },
  {
    name: "get_roi_summary",
    description: "ROI-Übersicht über alle Agents",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "search_marketplace",
    description: "Agent Marketplace durchsuchen",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string" as const, description: "Suchbegriff" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_recent_activity",
    description: "Letzte Aktivitäten abrufen",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_credit_balance",
    description: "Aktuellen Credit-Stand abrufen",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "explain_feature",
    description: "Ein KILN-Feature erklären",
    input_schema: {
      type: "object" as const,
      properties: {
        featureName: {
          type: "string" as const,
          description: "Name des Features",
        },
      },
      required: ["featureName"],
    },
  },
  {
    name: "search_knowledge",
    description: "Knowledge Graph durchsuchen — findet Entities (Firmen, Personen, Produkte etc.) aus Agent-Aktivitäten",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string" as const, description: "Suchbegriff" },
        type: { type: "string" as const, description: "Entity-Typ Filter (Company, Person, Product, Website, Price, Event, Document, Insight)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_entity_history",
    description: "Änderungshistorie einer Knowledge Graph Entity abrufen",
    input_schema: {
      type: "object" as const,
      properties: {
        entityId: { type: "string" as const, description: "ID der Entity" },
      },
      required: ["entityId"],
    },
  },
  // Data Pipeline Tools
  {
    name: "query_database",
    description: "SQL-Abfrage auf einer verbundenen Datenbank ausfuehren",
    input_schema: {
      type: "object" as const,
      properties: {
        connectionId: { type: "string" as const, description: "ID der Datenbankverbindung" },
        query: { type: "string" as const, description: "SQL-Abfrage" },
      },
      required: ["connectionId", "query"],
    },
  },
  {
    name: "list_data_connections",
    description: "Alle Datenbankverbindungen des Users auflisten",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "analyze_data",
    description: "Datenanalyse: Stelle eine Frage in natuerlicher Sprache an eine verbundene Datenbank",
    input_schema: {
      type: "object" as const,
      properties: {
        connectionId: { type: "string" as const, description: "ID der Datenbankverbindung" },
        question: { type: "string" as const, description: "Frage in natuerlicher Sprache, z.B. 'Was waren die Top 10 Produkte nach Umsatz letzten Monat?'" },
      },
      required: ["connectionId", "question"],
    },
  },
];

interface MetaAgentResponse {
  response: string;
  toolCalls?: Array<{ name: string; result: string }>;
  actionsTaken?: string[];
}

class MetaAgent {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic();
  }

  async chat(
    userId: string,
    message: string,
    conversationHistory: Array<{ role: "user" | "assistant"; content: string }>
  ): Promise<MetaAgentResponse> {
    const messages: Anthropic.MessageParam[] = [
      ...conversationHistory.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      { role: "user" as const, content: message },
    ];

    const response = await this.anthropic.messages.create({
      model: META_AGENT_MODEL,
      system: META_AGENT_SYSTEM_PROMPT,
      messages,
      tools: META_AGENT_TOOLS,
      max_tokens: 2048,
    });

    const toolCalls: Array<{ name: string; result: string }> = [];
    const actionsTaken: string[] = [];
    let responseText = "";

    // Sammle Text-Blöcke aus der ersten Antwort
    for (const block of response.content) {
      if (block.type === "text") {
        responseText += block.text;
      }
    }

    // Prüfe ob Tool-Aufrufe vorhanden sind
    const toolUseBlocks = response.content.filter(
      (block) => block.type === "tool_use"
    ) as Array<{ type: "tool_use"; id: string; name: string; input: Record<string, unknown> }>;

    if (toolUseBlocks.length > 0) {
      const toolResults: Anthropic.MessageParam[] = [];

      for (const toolBlock of toolUseBlocks) {
        const result = await this.executeTool(
          userId,
          toolBlock.name,
          toolBlock.input as Record<string, unknown>
        );

        toolCalls.push({ name: toolBlock.name, result });
        actionsTaken.push(toolBlock.name);

        toolResults.push({
          role: "user" as const,
          content: [
            {
              type: "tool_result" as const,
              tool_use_id: toolBlock.id,
              content: result,
            },
          ],
        });
      }

      // Zweiter API-Aufruf mit Tool-Ergebnissen für finale Antwort
      const followUpMessages: Anthropic.MessageParam[] = [
        ...messages,
        { role: "assistant" as const, content: response.content },
        ...toolResults,
      ];

      const followUpResponse = await this.anthropic.messages.create({
        model: META_AGENT_MODEL,
        system: META_AGENT_SYSTEM_PROMPT,
        messages: followUpMessages,
        tools: META_AGENT_TOOLS,
        max_tokens: 2048,
      });

      // Überschreibe responseText mit der finalen Antwort
      responseText = "";
      for (const block of followUpResponse.content) {
        if (block.type === "text") {
          responseText += block.text;
        }
      }
    }

    return {
      response: responseText,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      actionsTaken: actionsTaken.length > 0 ? actionsTaken : undefined,
    };
  }

  private async executeTool(
    userId: string,
    toolName: string,
    toolInput: Record<string, unknown>
  ): Promise<string> {
    switch (toolName) {
      case "list_agents": {
        const agents = await prisma.agent.findMany({
          where: { userId },
          select: {
            id: true,
            name: true,
            status: true,
            agentMode: true,
            _count: {
              select: { conversations: true },
            },
          },
        });

        const summary = agents.map((a) => ({
          id: a.id,
          name: a.name,
          status: a.status,
          mode: a.agentMode,
          conversations: a._count.conversations,
        }));

        return JSON.stringify({
          total: agents.length,
          agents: summary,
        });
      }

      case "create_agent": {
        const name = toolInput.name as string;
        const description = toolInput.description as string;
        const systemPrompt = toolInput.systemPrompt as string;

        const slug =
          name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") +
          "-" +
          Math.random().toString(36).substring(2, 8);

        const agent = await prisma.agent.create({
          data: {
            userId,
            name,
            slug,
            description,
            systemPrompt,
            status: "DRAFT",
          },
        });

        return `Agent '${name}' erstellt (ID: ${agent.id}). Status: Entwurf.`;
      }

      case "get_agent_analytics": {
        const agentId = toolInput.agentId as string;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [conversationsCount, leadsCount, runsCount] = await Promise.all([
          prisma.conversation.count({
            where: {
              agentId,
              createdAt: { gte: thirtyDaysAgo },
            },
          }),
          prisma.conversation.count({
            where: {
              agentId,
              createdAt: { gte: thirtyDaysAgo },
              visitorEmail: { not: null },
            },
          }),
          prisma.agentRun.count({
            where: {
              agentId,
              createdAt: { gte: thirtyDaysAgo },
            },
          }),
        ]);

        return JSON.stringify({
          period: "30 Tage",
          conversations: conversationsCount,
          leads: leadsCount,
          runs: runsCount,
        });
      }

      case "get_roi_summary": {
        const agentsWithRoi = await prisma.agent.findMany({
          where: { userId },
          include: {
            roiConfig: true,
          },
        });

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const summaries = await Promise.all(
          agentsWithRoi
            .filter((a) => a.roiConfig)
            .map(async (agent) => {
              const roi = agent.roiConfig!;

              const [runsCount, conversationsCount] = await Promise.all([
                prisma.agentRun.count({
                  where: {
                    agentId: agent.id,
                    createdAt: { gte: thirtyDaysAgo },
                  },
                }),
                prisma.conversation.count({
                  where: {
                    agentId: agent.id,
                    createdAt: { gte: thirtyDaysAgo },
                  },
                }),
              ]);

              const timeSavedMinutes = runsCount * roi.manualTimeMinutes;
              const timeSavedHours = timeSavedMinutes / 60;
              const hourlyRate = roi.hourlyRateCents / 100;
              const moneySaved = timeSavedHours * hourlyRate;

              return {
                agentName: agent.name,
                runs: runsCount,
                conversations: conversationsCount,
                timeSavedHours: Math.round(timeSavedHours * 100) / 100,
                moneySaved: Math.round(moneySaved * 100) / 100,
              };
            })
        );

        const totalTimeSaved = summaries.reduce(
          (sum, s) => sum + s.timeSavedHours,
          0
        );
        const totalMoneySaved = summaries.reduce(
          (sum, s) => sum + s.moneySaved,
          0
        );

        return JSON.stringify({
          period: "30 Tage",
          agents: summaries,
          totalTimeSavedHours: Math.round(totalTimeSaved * 100) / 100,
          totalMoneySavedEur: Math.round(totalMoneySaved * 100) / 100,
        });
      }

      case "search_marketplace": {
        const query = toolInput.query as string;

        const templates = await prisma.marketplaceTemplate.findMany({
          where: {
            status: "published",
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
            ],
          },
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            price: true,
            rating: true,
            downloads: true,
          },
          take: 5,
        });

        return JSON.stringify({
          query,
          results: templates,
          total: templates.length,
        });
      }

      case "get_recent_activity": {
        const userAgents = await prisma.agent.findMany({
          where: { userId },
          select: { id: true },
        });

        const agentIds = userAgents.map((a) => a.id);

        const recentConversations = await prisma.conversation.findMany({
          where: {
            agentId: { in: agentIds },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
          include: {
            agent: { select: { name: true } },
            _count: { select: { messages: true } },
          },
        });

        const activity = recentConversations.map((c) => ({
          agentName: c.agent.name,
          timestamp: c.createdAt.toISOString(),
          messageCount: c._count.messages,
        }));

        return JSON.stringify({ recentActivity: activity });
      }

      case "get_credit_balance": {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            aiCreditsBalance: true,
            aiCreditsMonthly: true,
          },
        });

        if (!user) {
          return JSON.stringify({ error: "Nutzer nicht gefunden" });
        }

        return JSON.stringify({
          creditsUsed: user.aiCreditsMonthly - user.aiCreditsBalance,
          creditsTotal: user.aiCreditsMonthly,
          creditsRemaining: user.aiCreditsBalance,
        });
      }

      case "explain_feature": {
        const featureName = (toolInput.featureName as string).toLowerCase();

        const explanations: Record<string, string> = {
          "computer use":
            "Computer Use erlaubt deinen Agents, einen virtuellen Browser zu steuern — Webseiten aufrufen, Formulare ausfüllen, Screenshots analysieren. Ideal für Web-Recherche und Automatisierung.",
          mcp: "MCP (Model Context Protocol) verbindet deine Agents mit externen Diensten wie Slack, Google Calendar, Notion und mehr. Agents können so direkt auf deine Tools zugreifen und Aktionen ausführen.",
          workflows:
            "Workflows verbinden mehrere Agents zu automatisierten Prozessketten. Ein Agent kann das Ergebnis an den nächsten weitergeben — z.B. Recherche → Analyse → Bericht erstellen.",
          teams:
            "Teams gruppieren mehrere Agents, die zusammenarbeiten. Ein Orchestrator-Agent verteilt Aufgaben intelligent an spezialisierte Team-Mitglieder.",
          "roi dashboard":
            "Das ROI Dashboard zeigt dir, wie viel Zeit und Geld deine Agents sparen. Basierend auf manueller Bearbeitungszeit und deinem Stundensatz wird der Return on Investment berechnet.",
          marketplace:
            "Im Marketplace findest du vorgefertigte Agent-Templates von der Community. Du kannst Agents installieren, bewerten und eigene Templates veröffentlichen.",
          "knowledge base":
            "Die Knowledge Base speichert Dokumente (PDF, URLs, FAQs) als Vektoren. Dein Agent durchsucht diese Wissensbasis, um präzise und kontextbezogene Antworten zu geben.",
        };

        const explanation = explanations[featureName];
        if (explanation) {
          return explanation;
        }

        // Teilweise Übereinstimmung prüfen
        for (const [key, value] of Object.entries(explanations)) {
          if (
            featureName.includes(key) ||
            key.includes(featureName)
          ) {
            return value;
          }
        }

        return "Ich kann dir bei diesem Feature leider nicht weiterhelfen.";
      }

      case "search_knowledge": {
        const query = toolInput.query as string;
        const result = await knowledgeGraph.search(userId, query);
        return JSON.stringify({
          query,
          results: result.entities.map((e) => ({
            id: e.id,
            name: e.name,
            type: e.type,
            properties: e.properties,
          })),
          total: result.entities.length,
        });
      }

      case "get_entity_history": {
        const entityId = toolInput.entityId as string;
        const [entity, history] = await Promise.all([
          knowledgeGraph.getEntity(entityId),
          knowledgeGraph.getEntityHistory(entityId),
        ]);

        if (!entity) {
          return JSON.stringify({ error: "Entity nicht gefunden" });
        }

        return JSON.stringify({
          entity: {
            name: entity.name,
            type: entity.type,
            properties: entity.properties,
            sources: entity.sources,
          },
          history: history.map((h) => ({
            eventType: h.eventType,
            timestamp: h.createdAt.toISOString(),
            previousValue: h.previousValue,
            newValue: h.newValue,
          })),
        });
      }

      case "query_database": {
        const { dbConnector } = await import("@/lib/data-pipeline/db-connector");
        const connectionId = toolInput.connectionId as string;
        const query = toolInput.query as string;
        try {
          const result = await dbConnector.executeQuery(connectionId, userId, query);
          return JSON.stringify({
            columns: result.columns,
            rows: result.rows.slice(0, 50),
            rowCount: result.rowCount,
            executionTimeMs: result.executionTimeMs,
            truncated: result.rowCount > 50,
          });
        } catch (err) {
          return JSON.stringify({ error: err instanceof Error ? err.message : "Query fehlgeschlagen" });
        }
      }

      case "list_data_connections": {
        const { dbConnector } = await import("@/lib/data-pipeline/db-connector");
        try {
          const connections = await dbConnector.getConnections(userId);
          return JSON.stringify({
            connections: connections.map((c) => ({
              id: c.id,
              name: c.name,
              type: c.type,
              status: c.status,
            })),
          });
        } catch (err) {
          return JSON.stringify({ error: err instanceof Error ? err.message : "Fehler beim Laden" });
        }
      }

      case "analyze_data": {
        const { dbConnector } = await import("@/lib/data-pipeline/db-connector");
        const { queryBuilder } = await import("@/lib/data-pipeline/query-builder");
        const connectionId = toolInput.connectionId as string;
        const question = toolInput.question as string;
        try {
          const conn = await dbConnector.getConnection(connectionId, userId);
          if (!conn) return JSON.stringify({ error: "Verbindung nicht gefunden" });
          const schema = await dbConnector.getSchema(connectionId, userId);
          const built = await queryBuilder.buildQuery(schema, question, conn.type as "postgresql" | "mysql" | "sqlite");
          const result = await dbConnector.executeQuery(connectionId, userId, built.sql);
          return JSON.stringify({
            question,
            generatedSql: built.sql,
            explanation: built.explanation,
            columns: result.columns,
            rows: result.rows.slice(0, 50),
            rowCount: result.rowCount,
            executionTimeMs: result.executionTimeMs,
          });
        } catch (err) {
          return JSON.stringify({ error: err instanceof Error ? err.message : "Analyse fehlgeschlagen" });
        }
      }

      default:
        return JSON.stringify({ error: `Unbekanntes Tool: ${toolName}` });
    }
  }
}

export const metaAgent = new MetaAgent();
