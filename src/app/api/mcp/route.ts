// Next.js route segment config — allow streaming for SSE
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { authenticateApiKey } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { canCreateAgent } from "@/lib/plan-limits";
import { searchRelevantChunks } from "@/lib/rag";
import { getClaudeClient, getClaudeClientWithKey, MODEL_PROVIDER_MAP } from "@/lib/ai";
import { decrypt } from "@/lib/encryption";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import crypto from "crypto";

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${base}-${suffix}`;
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

// Build MCP server with all tools scoped to a userId
function createMcpServer(userId: string) {
  const server = new McpServer(
    { name: "kiln-mcp", version: "1.0.0" },
    {
      capabilities: { tools: {} },
      instructions: "KILN AI Creation Platform MCP Server. Manage AI agents, knowledge bases, automations, and conversations programmatically.",
    }
  );

  // ── kiln_list_agents ──
  server.tool(
    "kiln_list_agents",
    "List all AI agents for the authenticated user. Returns id, name, slug, status, model, conversation count, and public URL.",
    {},
    async () => {
      const agents = await prisma.agent.findMany({
        where: { userId },
        select: {
          id: true, name: true, slug: true, description: true,
          llmModel: true, status: true, createdAt: true,
          _count: { select: { conversations: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return ok(agents.map((a) => ({
        id: a.id, name: a.name, slug: a.slug, description: a.description,
        model: a.llmModel, status: a.status,
        conversationCount: a._count.conversations,
        publicUrl: `/embed/${a.slug}`,
        createdAt: a.createdAt.toISOString(),
      })));
    }
  );

  // ── kiln_create_agent ──
  server.tool(
    "kiln_create_agent",
    "Create a new AI agent with the given name, description, and optional industry context. Returns the agent ID, slug, and public URL.",
    {
      name: z.string().describe("Name of the agent"),
      description: z.string().describe("What the agent does"),
      industry: z.string().optional().describe("Industry context (e.g. 'real estate', 'saas', 'ecommerce')"),
    },
    async ({ name, description, industry }) => {
      const agentCheck = await canCreateAgent(userId);
      if (!agentCheck.allowed) {
        return err(`Agent limit reached (${agentCheck.current}/${agentCheck.limit}). Please upgrade your plan.`);
      }

      await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId, email: `${userId}@clerk.temp` },
      });

      const slug = generateSlug(name);
      const systemPrompt = industry
        ? `You are ${name}, an AI assistant for the ${industry} industry. ${description || ""}\n\nBe helpful, professional, and concise.`
        : `You are ${name}. ${description || ""}\n\nBe helpful, professional, and concise.`;

      const agent = await prisma.agent.create({
        data: {
          userId, name, slug,
          description: description || null,
          systemPrompt,
          personality: { tone: "professional", language: "en", formality: "balanced" },
          welcomeMessage: `Hi! I'm ${name}. How can I help you today?`,
          suggestedQuestions: [],
          llmModel: "claude-sonnet-4-20250514",
          status: "DRAFT",
          whiteLabel: { primaryColor: "#F97316", position: "bottom-right" },
        },
      });

      return ok({
        id: agent.id, slug: agent.slug, publicUrl: `/embed/${agent.slug}`,
        status: agent.status,
        message: `Agent "${name}" created. Deploy with kiln_deploy_agent to make it live.`,
      });
    }
  );

  // ── kiln_update_agent ──
  server.tool(
    "kiln_update_agent",
    "Update an existing agent's configuration. Only provided fields are changed.",
    {
      id: z.string().describe("Agent ID"),
      system_prompt: z.string().optional().describe("New system prompt"),
      personality: z.object({
        tone: z.string().optional(),
        language: z.string().optional(),
        formality: z.string().optional(),
      }).optional().describe("Personality settings"),
      welcome_message: z.string().optional().describe("New welcome message"),
      name: z.string().optional().describe("New agent name"),
      model: z.string().optional().describe("LLM model ID"),
    },
    async ({ id, system_prompt, personality, welcome_message, name: agentName, model }) => {
      const existing = await prisma.agent.findFirst({ where: { id, userId } });
      if (!existing) return err("Agent not found or unauthorized.");

      const data: Record<string, unknown> = {};
      if (system_prompt) data.systemPrompt = system_prompt;
      if (personality) data.personality = personality;
      if (welcome_message) data.welcomeMessage = welcome_message;
      if (agentName) data.name = agentName;
      if (model) data.llmModel = model;

      const updated = await prisma.agent.update({ where: { id }, data });

      return ok({
        id: updated.id, name: updated.name,
        updatedFields: Object.keys(data),
        message: "Agent updated successfully.",
      });
    }
  );

  // ── kiln_add_knowledge ──
  server.tool(
    "kiln_add_knowledge",
    "Add a knowledge base entry to an agent. Supports TEXT, URL, PDF, or FAQ content for RAG.",
    {
      agentId: z.string().describe("Agent ID"),
      type: z.enum(["TEXT", "URL", "PDF", "FAQ"]).describe("Knowledge type"),
      sourceName: z.string().describe("Name for this knowledge source (e.g. 'Product FAQ')"),
      content: z.string().describe("The content text, URL, or FAQ entries"),
    },
    async ({ agentId, type, sourceName, content }) => {
      const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
      if (!agent) return err("Agent not found or unauthorized.");

      const kb = await prisma.knowledgeBase.create({
        data: { agentId, type, sourceName, content, embeddingStatus: "PENDING" },
      });

      return ok({
        id: kb.id, type, sourceName, embeddingStatus: "PENDING",
        message: "Knowledge added. Embedding will be processed automatically.",
      });
    }
  );

  // ── kiln_deploy_agent ──
  server.tool(
    "kiln_deploy_agent",
    "Deploy or undeploy an agent by changing its status to LIVE, DRAFT, or PAUSED.",
    {
      id: z.string().describe("Agent ID"),
      status: z.enum(["LIVE", "DRAFT", "PAUSED"]).describe("Target status"),
    },
    async ({ id, status }) => {
      const agent = await prisma.agent.findFirst({ where: { id, userId } });
      if (!agent) return err("Agent not found or unauthorized.");

      const updated = await prisma.agent.update({
        where: { id },
        data: { status },
      });

      return ok({
        id: updated.id, name: updated.name, status: updated.status,
        publicUrl: `/embed/${updated.slug}`,
        message: status === "LIVE"
          ? `Agent "${updated.name}" is now live!`
          : `Agent "${updated.name}" status set to ${status}.`,
      });
    }
  );

  // ── kiln_get_analytics ──
  server.tool(
    "kiln_get_analytics",
    "Get analytics for an agent: total conversations, leads collected, average lead score, and daily breakdown.",
    {
      agentId: z.string().describe("Agent ID"),
      range: z.enum(["7d", "30d", "90d"]).describe("Time range"),
    },
    async ({ agentId, range }) => {
      const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
      if (!agent) return err("Agent not found or unauthorized.");

      const days = range === "90d" ? 90 : range === "30d" ? 30 : 7;
      const since = new Date();
      since.setDate(since.getDate() - days);

      const [conversations, leads, analytics, avgScore] = await Promise.all([
        prisma.conversation.count({ where: { agentId, createdAt: { gte: since } } }),
        prisma.conversation.count({ where: { agentId, createdAt: { gte: since }, leadScore: { not: null } } }),
        prisma.agentAnalytics.findMany({
          where: { agentId, date: { gte: since } },
          orderBy: { date: "asc" },
          select: { date: true, totalConversations: true, leadsCollected: true, estimatedValue: true },
        }),
        prisma.conversation.aggregate({
          where: { agentId, createdAt: { gte: since }, leadScore: { not: null } },
          _avg: { leadScore: true },
        }),
      ]);

      return ok({
        agentId, agentName: agent.name, range,
        totalConversations: conversations,
        leadsCollected: leads,
        avgLeadScore: avgScore._avg.leadScore || 0,
        dailyBreakdown: analytics.map((a) => ({
          date: a.date.toISOString().split("T")[0],
          conversations: a.totalConversations,
          leads: a.leadsCollected,
          estimatedValue: a.estimatedValue,
        })),
      });
    }
  );

  // ── kiln_clone_agent ──
  server.tool(
    "kiln_clone_agent",
    "Clone an existing agent with all its configuration, actions, custom tools, and knowledge base.",
    {
      id: z.string().describe("Source agent ID to clone"),
      name: z.string().describe("Name for the cloned agent"),
    },
    async ({ id, name: cloneName }) => {
      const source = await prisma.agent.findFirst({
        where: { id, userId },
        include: { actions: true, customTools: true, knowledgeBases: true },
      });
      if (!source) return err("Agent not found or unauthorized.");

      const agentCheck = await canCreateAgent(userId);
      if (!agentCheck.allowed) return err(`Agent limit reached (${agentCheck.current}/${agentCheck.limit}).`);

      const clone = await prisma.agent.create({
        data: {
          userId, name: cloneName, slug: generateSlug(cloneName),
          description: source.description, systemPrompt: source.systemPrompt,
          personality: source.personality ?? undefined,
          welcomeMessage: source.welcomeMessage,
          suggestedQuestions: source.suggestedQuestions,
          llmModel: source.llmModel, status: "DRAFT",
          whiteLabel: source.whiteLabel ?? undefined,
          showPoweredBy: source.showPoweredBy,
          memoryEnabled: source.memoryEnabled,
          imageAnalysisEnabled: source.imageAnalysisEnabled,
          clonedFromId: source.id, clonedFromName: source.name,
        },
      });

      if (source.actions.length > 0) {
        await prisma.agentAction.createMany({
          data: source.actions.map((a) => ({
            agentId: clone.id, type: a.type, enabled: a.enabled, config: a.config ?? undefined,
          })),
        });
      }
      if (source.customTools.length > 0) {
        await prisma.agentCustomTool.createMany({
          data: source.customTools.map((t) => ({
            agentId: clone.id, name: t.name, description: t.description,
            method: t.method, url: t.url, headers: t.headers ?? undefined,
            bodyTemplate: t.bodyTemplate, responseMapping: t.responseMapping, enabled: t.enabled,
          })),
        });
      }
      if (source.knowledgeBases.length > 0) {
        await prisma.knowledgeBase.createMany({
          data: source.knowledgeBases.map((kb) => ({
            agentId: clone.id, type: kb.type, sourceName: kb.sourceName,
            content: kb.content, chunkCount: kb.chunkCount, embeddingStatus: kb.embeddingStatus,
          })),
        });
      }

      return ok({
        id: clone.id, name: clone.name, slug: clone.slug,
        clonedFrom: source.name,
        message: `Agent cloned successfully as "${cloneName}".`,
      });
    }
  );

  // ── kiln_create_automation ──
  server.tool(
    "kiln_create_automation",
    "Create a scheduled automation rule for an agent. The agent will execute the task on the given schedule.",
    {
      agentId: z.string().describe("Agent ID"),
      name: z.string().describe("Automation name"),
      schedule: z.enum(["hourly", "daily", "weekly"]).describe("Schedule frequency"),
      task: z.string().describe("Task description for the agent to execute"),
    },
    async ({ agentId, name: automationName, schedule, task }) => {
      const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
      if (!agent) return err("Agent not found or unauthorized.");

      const cronMap: Record<string, string> = { hourly: "0 * * * *", daily: "0 9 * * *", weekly: "0 9 * * 1" };

      const automation = await prisma.automationRule.create({
        data: {
          agentId, name: automationName,
          cronExpression: cronMap[schedule],
          taskDescription: task, enabled: true,
        },
      });

      return ok({
        id: automation.id, name: automation.name, schedule,
        cronExpression: cronMap[schedule], enabled: true,
        message: `Automation "${automationName}" created with ${schedule} schedule.`,
      });
    }
  );

  // ── kiln_chat ──
  server.tool(
    "kiln_chat",
    "Send a message to an agent and get a response. Use sessionId to maintain conversation context across messages.",
    {
      agentId: z.string().describe("Agent ID"),
      message: z.string().describe("Message to send to the agent"),
      sessionId: z.string().optional().describe("Session ID for conversation continuity (auto-generated if omitted)"),
    },
    async ({ agentId, message, sessionId: clientSessionId }) => {
      const agent = await prisma.agent.findFirst({
        where: { id: agentId, userId },
        include: {
          knowledgeBases: { where: { embeddingStatus: "READY" } },
          actions: true,
          customTools: { where: { enabled: true } },
        },
      });
      if (!agent) return err("Agent not found or unauthorized.");

      const sessionId = clientSessionId || crypto.randomUUID();
      let conversation = await prisma.conversation.findFirst({
        where: { agentId, sessionId },
      });
      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: { agentId, sessionId, channel: "SLACK" },
        });
      }

      await prisma.message.create({
        data: { conversationId: conversation.id, role: "USER", content: message },
      });

      const existingMessages = await prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "asc" },
        take: 50,
      });

      // RAG
      let knowledgeContext = "";
      if (agent.knowledgeBases.length > 0) {
        try {
          const chunks = await searchRelevantChunks(agentId, message, 5);
          if (chunks.length > 0) {
            knowledgeContext =
              "\n\n---\nRELEVANT KNOWLEDGE:\n" +
              chunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n") +
              "\n---\nUse the above knowledge to answer. Do not make up information.";
          }
        } catch {
          // RAG failed
        }
      }

      const now = new Date();
      let systemPrompt = agent.systemPrompt
        .replace(/\{\{agent\.name\}\}/g, agent.name)
        .replace(/\{\{current\.time\}\}/g, now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }))
        .replace(/\{\{current\.date\}\}/g, now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }));

      if (knowledgeContext) {
        systemPrompt = systemPrompt.replace(/\{\{knowledge\.context\}\}/g, knowledgeContext);
      } else {
        systemPrompt = systemPrompt.replace(/\{\{knowledge\.context\}\}/g, "");
      }
      if (!systemPrompt.includes(knowledgeContext) && knowledgeContext) {
        systemPrompt += knowledgeContext;
      }

      // BYOK
      const selectedModel = agent.llmModel || "claude-sonnet-4-20250514";
      const modelProvider = MODEL_PROVIDER_MAP[selectedModel] || "anthropic";
      let userApiKey: string | null = null;
      try {
        const apiKeyRecord = await prisma.apiKey.findUnique({
          where: { userId_provider: { userId, provider: modelProvider } },
        });
        if (apiKeyRecord) userApiKey = decrypt(apiKeyRecord.encryptedKey);
      } catch {
        // Fallback to KILN key
      }

      const llmMessages = existingMessages.map((m) => ({
        role: m.role === "USER" ? "user" as const : "assistant" as const,
        content: m.content,
      }));

      let responseText = "";

      if (modelProvider === "openai") {
        const openai = new OpenAI({ apiKey: userApiKey || process.env.OPENAI_API_KEY });
        const response = await openai.chat.completions.create({
          model: selectedModel, max_tokens: 2048,
          messages: [{ role: "system", content: systemPrompt }, ...llmMessages],
        });
        responseText = response.choices[0]?.message?.content || "";
      } else {
        const client = userApiKey ? getClaudeClientWithKey(userApiKey) : getClaudeClient();
        const response = await client.messages.create({
          model: selectedModel, max_tokens: 2048,
          system: systemPrompt,
          messages: llmMessages as Anthropic.MessageParam[],
        });
        for (const block of response.content) {
          if (block.type === "text") responseText += block.text;
        }
      }

      if (responseText) {
        await prisma.message.create({
          data: { conversationId: conversation.id, role: "ASSISTANT", content: responseText },
        });
      }

      return ok({ response: responseText, sessionId, conversationId: conversation.id, model: selectedModel });
    }
  );

  // ── kiln_delete_agent ──
  server.tool(
    "kiln_delete_agent",
    "Permanently delete an agent and all its data (conversations, knowledge base, actions). This cannot be undone.",
    {
      id: z.string().describe("Agent ID to delete"),
    },
    async ({ id }) => {
      const existing = await prisma.agent.findFirst({ where: { id, userId } });
      if (!existing) return err("Agent not found or unauthorized.");

      await prisma.agent.delete({ where: { id } });

      return ok({ id, name: existing.name, message: `Agent "${existing.name}" has been permanently deleted.` });
    }
  );

  return server;
}

// Handler for all HTTP methods
async function handleMcpRequest(req: Request): Promise<Response> {
  try {
    // Authenticate
    const authResult = await authenticateApiKey(req.headers.get("authorization"));
    if (!authResult) {
      return Response.json(
        { error: "Invalid or missing API key. Use Authorization: Bearer sk-kiln-..." },
        { status: 401 }
      );
    }

    // Rate limit
    const rateCheck = checkRateLimit(authResult.keyId);
    if (!rateCheck.allowed) {
      return Response.json(
        { error: "Rate limit exceeded. 100 requests per minute." },
        { status: 429 }
      );
    }

    // Create stateless transport + server per request
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    });

    const server = createMcpServer(authResult.userId);
    await server.connect(transport);

    return transport.handleRequest(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handleMcpRequest(req);
}

export async function POST(req: Request) {
  return handleMcpRequest(req);
}

export async function DELETE(req: Request) {
  return handleMcpRequest(req);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version",
    },
  });
}
