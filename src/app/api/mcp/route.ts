// Next.js route segment config — allow streaming for SSE
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { waitUntil } from "@vercel/functions";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import {
  apiKeyAuthErrorResponse,
  apiKeyJson,
  authenticateApiKey,
  requireApiKeyScope,
  type ApiKeyAuthSuccess,
} from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { canCreateAgent } from "@/lib/plan-limits";
import { getUserEmailOrPlaceholder } from "@/lib/clerk-user-email";
import { searchRelevantChunks } from "@/lib/rag";
import { getClaudeClient, getClaudeClientWithKey, MODEL_PROVIDER_MAP } from "@/lib/ai";
import { buildStripeTools } from "@/lib/integrations/agent-stripe";
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
    "List all AI agents for the authenticated user. Returns id, name, slug, status, mode (CHAT or TASK), model, conversation/run count, and public URL.",
    {},
    async () => {
      const agents = await prisma.agent.findMany({
        where: { userId },
        select: {
          id: true, name: true, slug: true, description: true,
          llmModel: true, status: true, mode: true, createdAt: true,
          _count: { select: { conversations: true, runs: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return ok(agents.map((a) => ({
        id: a.id, name: a.name, slug: a.slug, description: a.description,
        model: a.llmModel, status: a.status, mode: a.mode,
        conversationCount: a._count.conversations,
        runCount: a._count.runs,
        publicUrl: a.mode === "CHAT" ? `/embed/${a.slug}` : undefined,
        createdAt: a.createdAt.toISOString(),
      })));
    }
  );

  // ── kiln_create_agent ──
  server.tool(
    "kiln_create_agent",
    "Create a new AI agent. Set mode to CHAT for conversational agents or TASK for autonomous background agents. Returns the agent ID, slug, and public URL.",
    {
      name: z.string().describe("Name of the agent"),
      description: z.string().describe("What the agent does"),
      industry: z.string().optional().describe("Industry context (e.g. 'real estate', 'saas', 'ecommerce')"),
      mode: z.enum(["CHAT", "TASK"]).optional().describe("Agent mode: CHAT (conversational, default) or TASK (autonomous background execution)"),
    },
    async ({ name, description, industry, mode = "CHAT" }) => {
      const agentCheck = await canCreateAgent(userId);
      if (!agentCheck.allowed) {
        return err(`Agent limit reached (${agentCheck.current}/${agentCheck.limit}). Please upgrade your plan.`);
      }

      const userEmail = await getUserEmailOrPlaceholder(userId);
      await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId, email: userEmail },
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
          mode: mode,
          personality: { tone: "professional", language: "en", formality: "balanced" },
          welcomeMessage: mode === "CHAT" ? `Hi! I'm ${name}. How can I help you today?` : "",
          suggestedQuestions: [],
          llmModel: "claude-sonnet-4-6",
          status: "DRAFT",
          whiteLabel: { primaryColor: "#F97316", position: "bottom-right" },
        },
      });

      return ok({
        id: agent.id, slug: agent.slug, mode: mode,
        publicUrl: mode === "CHAT" ? `/embed/${agent.slug}` : undefined,
        status: agent.status,
        message: mode === "TASK"
          ? `Task Agent "${name}" created. Run with kiln_run_agent or deploy with kiln_deploy_agent.`
          : `Agent "${name}" created. Deploy with kiln_deploy_agent to make it live.`,
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
      const selectedModel = agent.llmModel || "claude-sonnet-4-6";
      const modelProvider = MODEL_PROVIDER_MAP[selectedModel] || "ANTHROPIC";
      let userApiKey: string | null = null;
      try {
        const apiKeyRecord = await prisma.apiKey.findUnique({
          where: { userId_provider: { userId, provider: modelProvider.toLowerCase() } },
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

      if (modelProvider === "OPENAI") {
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

  // ── kiln_add_branch ──
  server.tool(
    "kiln_add_branch",
    "Add a prompt branch to an agent. When user messages match keywords, the prompt snippet is injected into the system prompt.",
    {
      agentId: z.string().describe("Agent ID"),
      name: z.string().describe("Branch name (e.g. 'Pricing Questions')"),
      keywords: z.array(z.string()).describe("Keywords that trigger this branch (case-insensitive)"),
      promptSnippet: z.string().describe("Prompt text injected when keywords match"),
    },
    async ({ agentId, name: branchName, keywords, promptSnippet }) => {
      const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
      if (!agent) return err("Agent not found or unauthorized.");

      const existing = (agent.promptBranches as { name: string; keywords: string[]; promptSnippet: string; enabled: boolean }[] | null) || [];
      const newBranch = { name: branchName, keywords, promptSnippet, enabled: true };
      const updated = [...existing, newBranch];

      await prisma.agent.update({ where: { id: agentId }, data: { promptBranches: updated } });

      return ok({
        agentId, branchName, keywords, totalBranches: updated.length,
        message: `Branch "${branchName}" added with ${keywords.length} keywords.`,
      });
    }
  );

  // ── kiln_set_white_label ──
  server.tool(
    "kiln_set_white_label",
    "Configure white-label branding for an agent: primary color, logo URL, and badge visibility.",
    {
      agentId: z.string().describe("Agent ID"),
      primaryColor: z.string().optional().describe("Hex color (e.g. '#F97316')"),
      logoUrl: z.string().optional().describe("URL to logo image"),
      hideBadge: z.boolean().optional().describe("Hide 'Powered by KILN' badge (Pro/Agency only)"),
    },
    async ({ agentId, primaryColor, logoUrl, hideBadge }) => {
      const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
      if (!agent) return err("Agent not found or unauthorized.");

      const currentWl = (agent.whiteLabel as Record<string, unknown>) || {};
      const data: Record<string, unknown> = {};

      if (primaryColor || logoUrl) {
        data.whiteLabel = {
          ...currentWl,
          ...(primaryColor ? { primaryColor } : {}),
          ...(logoUrl ? { logo: logoUrl } : {}),
        };
      }
      if (hideBadge !== undefined) {
        data.showPoweredBy = !hideBadge;
      }

      const updated = await prisma.agent.update({ where: { id: agentId }, data });

      return ok({
        agentId, whiteLabel: updated.whiteLabel, showPoweredBy: updated.showPoweredBy,
        message: "White-label settings updated.",
      });
    }
  );

  // ── kiln_add_action ──
  server.tool(
    "kiln_add_action",
    "Enable and configure a pre-built action on an agent (appointment booking, email collection, lead scoring, custom code, etc.).",
    {
      agentId: z.string().describe("Agent ID"),
      type: z.enum(["BOOK_APPOINTMENT", "COLLECT_EMAIL", "SCORE_LEAD", "CUSTOM_CODE", "SEND_EMAIL", "NOTIFY_OWNER", "FIRE_WEBHOOK", "HANDOFF_HUMAN"]).describe("Action type"),
      config: z.record(z.unknown()).optional().describe("Action config (e.g. { calendlyUrl, emailTemplate, webhookUrl, code })"),
    },
    async ({ agentId, type, config }) => {
      const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
      if (!agent) return err("Agent not found or unauthorized.");

      const action = await prisma.agentAction.upsert({
        where: { agentId_type: { agentId, type } },
        create: { agentId, type, enabled: true, config: config ? JSON.parse(JSON.stringify(config)) : undefined },
        update: { enabled: true, config: config ? JSON.parse(JSON.stringify(config)) : undefined },
      });

      return ok({
        id: action.id, agentId, type: action.type, enabled: action.enabled,
        message: `Action "${type}" enabled on agent.`,
      });
    }
  );

  // ── kiln_create_test ──
  server.tool(
    "kiln_create_test",
    "Create a test case for an agent. Tests check if the agent's response contains expected keywords.",
    {
      agentId: z.string().describe("Agent ID"),
      name: z.string().describe("Test case name"),
      inputMessage: z.string().describe("Message to send to the agent"),
      expectedKeywords: z.array(z.string()).describe("Keywords the response must contain to pass"),
    },
    async ({ agentId, name: testName, inputMessage, expectedKeywords }) => {
      const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
      if (!agent) return err("Agent not found or unauthorized.");

      const count = await prisma.agentTestCase.count({ where: { agentId } });
      if (count >= 50) return err("Maximum 50 test cases per agent.");

      const testCase = await prisma.agentTestCase.create({
        data: { agentId, name: testName, inputMessage, expectedKeywords },
      });

      return ok({
        id: testCase.id, name: testCase.name, inputMessage, expectedKeywords,
        message: `Test case "${testName}" created. Run with kiln_run_tests.`,
      });
    }
  );

  // ── kiln_run_tests ──
  server.tool(
    "kiln_run_tests",
    "Execute all test cases for an agent. Sends each input to the LLM and checks for expected keywords. Returns pass/fail score.",
    {
      agentId: z.string().describe("Agent ID"),
    },
    async ({ agentId }) => {
      const agent = await prisma.agent.findFirst({
        where: { id: agentId, userId },
        include: { knowledgeBases: { where: { embeddingStatus: "READY" } } },
      });
      if (!agent) return err("Agent not found or unauthorized.");

      const testCases = await prisma.agentTestCase.findMany({ where: { agentId } });
      if (testCases.length === 0) return err("No test cases found. Create tests with kiln_create_test first.");

      // BYOK
      const selectedModel = agent.llmModel || "claude-sonnet-4-6";
      const modelProvider = MODEL_PROVIDER_MAP[selectedModel] || "ANTHROPIC";
      let userApiKey: string | null = null;
      try {
        const apiKeyRecord = await prisma.apiKey.findUnique({
          where: { userId_provider: { userId, provider: modelProvider.toLowerCase() } },
        });
        if (apiKeyRecord) userApiKey = decrypt(apiKeyRecord.encryptedKey);
      } catch { /* fallback */ }

      const results: { name: string; result: string; matchedKeywords: string[]; missedKeywords: string[] }[] = [];
      let passed = 0;

      for (const tc of testCases) {
        // RAG context
        let systemPrompt = agent.systemPrompt;
        if (agent.knowledgeBases.length > 0) {
          try {
            const chunks = await searchRelevantChunks(agentId, tc.inputMessage, 5);
            if (chunks.length > 0) {
              systemPrompt += "\n\n---\nRELEVANT KNOWLEDGE:\n" +
                chunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n");
            }
          } catch { /* skip RAG */ }
        }

        // Prompt branching — inject matching snippets
        if (agent.promptBranches && Array.isArray(agent.promptBranches)) {
          const userText = tc.inputMessage.toLowerCase();
          const branches = agent.promptBranches as { name: string; keywords: string[]; promptSnippet: string; enabled: boolean }[];
          const snippets: string[] = [];
          for (const branch of branches) {
            if (!branch.enabled) continue;
            const matched = branch.keywords.some((kw) => {
              const pattern = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
              return pattern.test(userText);
            });
            if (matched) snippets.push(branch.promptSnippet);
          }
          if (snippets.length > 0) {
            systemPrompt += "\n\n---\nSpecial instructions for this type of question:\n" + snippets.join("\n\n");
          }
        }

        let responseText = "";
        try {
          if (modelProvider === "OPENAI") {
            const openai = new OpenAI({ apiKey: userApiKey || process.env.OPENAI_API_KEY });
            const resp = await openai.chat.completions.create({
              model: selectedModel, max_tokens: 1024,
              messages: [{ role: "system", content: systemPrompt }, { role: "user", content: tc.inputMessage }],
            });
            responseText = resp.choices[0]?.message?.content || "";
          } else {
            const client = userApiKey ? getClaudeClientWithKey(userApiKey) : getClaudeClient();
            const resp = await client.messages.create({
              model: selectedModel, max_tokens: 1024,
              system: systemPrompt,
              messages: [{ role: "user", content: tc.inputMessage }],
            });
            for (const block of resp.content) {
              if (block.type === "text") responseText += block.text;
            }
          }
        } catch (e) {
          responseText = `[ERROR] ${e instanceof Error ? e.message : "LLM call failed"}`;
        }

        const keywords = tc.expectedKeywords as string[];
        const lower = responseText.toLowerCase();
        const matched = keywords.filter((kw) => lower.includes(kw.toLowerCase()));
        const missed = keywords.filter((kw) => !lower.includes(kw.toLowerCase()));
        const pass = missed.length === 0;
        if (pass) passed++;

        results.push({ name: tc.name, result: pass ? "PASS" : "FAIL", matchedKeywords: matched, missedKeywords: missed });

        // Update test case with result
        waitUntil(
          prisma.agentTestCase.update({
            where: { id: tc.id },
            data: { lastResult: pass ? "PASS" : "FAIL", lastResponse: responseText.slice(0, 2000), lastRunAt: new Date() },
          }).catch((err) => {
            console.error("MCP test case result update failed:", err);
          })
        );
      }

      const score = testCases.length > 0 ? passed / testCases.length : 0;

      // Save test run
      waitUntil(
        prisma.agentTestRun.create({
          data: { agentId, totalTests: testCases.length, passed, failed: testCases.length - passed, score },
        }).catch((err) => {
          console.error("MCP test run save failed:", err);
        })
      );

      return ok({
        agentId, totalTests: testCases.length, passed, failed: testCases.length - passed,
        score: Math.round(score * 100) + "%",
        results,
      });
    }
  );

  // ── kiln_get_embed_code ──
  server.tool(
    "kiln_get_embed_code",
    "Get the embed code (script tag) and public URL for an agent's chat widget.",
    {
      agentId: z.string().describe("Agent ID"),
    },
    async ({ agentId }) => {
      const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
      if (!agent) return err("Agent not found or unauthorized.");

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";
      const publicUrl = `${baseUrl}/embed/${agent.slug}`;
      const scriptTag = `<script src="${baseUrl}/api/embed/${agent.slug}" async></script>`;
      const iframeTag = `<iframe src="${publicUrl}" width="400" height="600" frameborder="0"></iframe>`;

      return ok({
        agentId, slug: agent.slug, status: agent.status,
        publicUrl, scriptTag, iframeTag,
        message: agent.status !== "LIVE"
          ? `Warning: Agent is ${agent.status}. Deploy with kiln_deploy_agent to make it accessible.`
          : "Agent is live. Use the script tag or iframe to embed.",
      });
    }
  );

  // ── kiln_set_memory ──
  server.tool(
    "kiln_set_memory",
    "Toggle persistent memory for an agent. When enabled, the agent remembers user details across conversations.",
    {
      agentId: z.string().describe("Agent ID"),
      enabled: z.boolean().describe("Enable or disable persistent memory"),
    },
    async ({ agentId, enabled }) => {
      const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
      if (!agent) return err("Agent not found or unauthorized.");

      await prisma.agent.update({ where: { id: agentId }, data: { memoryEnabled: enabled } });

      return ok({
        agentId, memoryEnabled: enabled,
        message: enabled
          ? "Persistent memory enabled. The agent will remember user details across conversations."
          : "Persistent memory disabled. The agent will no longer persist user details.",
      });
    }
  );

  // ── kiln_add_custom_tool ──
  server.tool(
    "kiln_add_custom_tool",
    "Add a custom HTTP API tool to an agent. The agent can call this tool during conversations to fetch external data.",
    {
      agentId: z.string().describe("Agent ID"),
      name: z.string().describe("Tool name (will be converted to snake_case)"),
      description: z.string().describe("When the agent should use this tool"),
      method: z.enum(["GET", "POST", "PUT", "DELETE"]).describe("HTTP method"),
      url: z.string().describe("Endpoint URL (supports {{variable}} placeholders)"),
      headers: z.record(z.string()).optional().describe("HTTP headers"),
      bodyTemplate: z.string().optional().describe("JSON body template with {{variable}} placeholders"),
    },
    async ({ agentId, name: toolName, description: toolDesc, method, url, headers, bodyTemplate }) => {
      const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
      if (!agent) return err("Agent not found or unauthorized.");

      const sanitizedName = toolName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

      const tool = await prisma.agentCustomTool.create({
        data: {
          agentId, name: sanitizedName, description: toolDesc,
          method, url, headers: headers || undefined,
          bodyTemplate: bodyTemplate || null, enabled: true,
        },
      });

      return ok({
        id: tool.id, name: tool.name, method, url,
        message: `Custom tool "${sanitizedName}" added. The agent will use it when: ${toolDesc}`,
      });
    }
  );

  // ── kiln_add_custom_code ──
  server.tool(
    "kiln_add_custom_code",
    "Add a CUSTOM_CODE action to an agent. The code runs in a sandboxed environment when triggered during conversation.",
    {
      agentId: z.string().describe("Agent ID"),
      description: z.string().describe("What the custom code does"),
      code: z.string().describe("JavaScript code to execute (sandboxed, 5s timeout)"),
    },
    async ({ agentId, description: codeDesc, code }) => {
      const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
      if (!agent) return err("Agent not found or unauthorized.");

      const action = await prisma.agentAction.upsert({
        where: { agentId_type: { agentId, type: "CUSTOM_CODE" } },
        create: { agentId, type: "CUSTOM_CODE", enabled: true, config: { description: codeDesc, code } },
        update: { enabled: true, config: { description: codeDesc, code } },
      });

      return ok({
        id: action.id, type: "CUSTOM_CODE", enabled: true,
        message: `Custom code action configured: ${codeDesc}`,
      });
    }
  );

  // ── kiln_get_conversations ──
  server.tool(
    "kiln_get_conversations",
    "Retrieve conversation logs for an agent with messages, lead scores, and visitor info.",
    {
      agentId: z.string().describe("Agent ID"),
      limit: z.number().optional().describe("Max conversations to return (default 20, max 100)"),
      minScore: z.number().optional().describe("Filter by minimum lead score (1-10)"),
    },
    async ({ agentId, limit, minScore }) => {
      const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
      if (!agent) return err("Agent not found or unauthorized.");

      const take = Math.min(limit || 20, 100);
      const where: Record<string, unknown> = { agentId };
      if (minScore) where.leadScore = { gte: minScore };

      const conversations = await prisma.conversation.findMany({
        where,
        include: {
          messages: { orderBy: { createdAt: "asc" }, take: 20 },
        },
        orderBy: { createdAt: "desc" },
        take,
      });

      return ok({
        agentId, total: conversations.length,
        conversations: conversations.map((c) => ({
          id: c.id, sessionId: c.sessionId,
          leadScore: c.leadScore, sentiment: c.sentiment,
          visitorName: c.visitorName, visitorEmail: c.visitorEmail,
          channel: c.channel, actionsUsed: c.actionsUsed,
          messageCount: c.messages.length,
          messages: c.messages.map((m) => ({
            role: m.role, content: m.content.slice(0, 500),
            createdAt: m.createdAt.toISOString(),
          })),
          createdAt: c.createdAt.toISOString(),
        })),
      });
    }
  );

  // ── kiln_get_leads ──
  server.tool(
    "kiln_get_leads",
    "Get collected leads for an agent with email, name, score, and conversation context.",
    {
      agentId: z.string().describe("Agent ID"),
      minScore: z.number().optional().describe("Filter by minimum lead score (1-10)"),
    },
    async ({ agentId, minScore }) => {
      const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
      if (!agent) return err("Agent not found or unauthorized.");

      const where: Record<string, unknown> = { agentId };
      if (minScore) where.score = { gte: minScore };

      const leads = await prisma.lead.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      return ok({
        agentId, agentName: agent.name, totalLeads: leads.length,
        leads: leads.map((l) => ({
          id: l.id, email: l.email, name: l.name,
          score: l.score, context: l.context,
          createdAt: l.createdAt.toISOString(),
        })),
      });
    }
  );

  // ── kiln_orchestrate ──
  server.tool(
    "kiln_orchestrate",
    "Define an agent-to-agent handoff rule. When the condition matches in the source agent's conversation, it triggers a handoff to the target agent.",
    {
      sourceAgentId: z.string().describe("Source agent ID (the agent that detects the condition)"),
      targetAgentId: z.string().describe("Target agent ID (the agent that takes over)"),
      condition: z.string().describe("Condition description or keywords that trigger the handoff"),
    },
    async ({ sourceAgentId, targetAgentId, condition }) => {
      const [source, target] = await Promise.all([
        prisma.agent.findFirst({ where: { id: sourceAgentId, userId } }),
        prisma.agent.findFirst({ where: { id: targetAgentId, userId } }),
      ]);
      if (!source) return err("Source agent not found or unauthorized.");
      if (!target) return err("Target agent not found or unauthorized.");
      if (sourceAgentId === targetAgentId) return err("Source and target agent cannot be the same.");

      const rule = await prisma.agentOrchestration.create({
        data: { sourceAgentId, targetAgentId, condition, enabled: true },
      });

      return ok({
        id: rule.id,
        sourceAgent: { id: source.id, name: source.name },
        targetAgent: { id: target.id, name: target.name },
        condition, enabled: true,
        message: `Handoff rule created: "${source.name}" → "${target.name}" when: ${condition}`,
      });
    }
  );

  // ── kiln_create_webhook ──
  server.tool(
    "kiln_create_webhook",
    "Create an inbound webhook endpoint for an agent. External services can POST to this URL to trigger agent processing.",
    {
      agentId: z.string().describe("Agent ID"),
      authType: z.enum(["NONE", "HEADER_AUTH", "HMAC"]).optional().describe("Authentication type (default: NONE)"),
      authValue: z.string().optional().describe("Bearer token or HMAC secret (required if authType is not NONE)"),
      responseMode: z.enum(["IMMEDIATE", "AFTER_PROCESSING"]).optional().describe("IMMEDIATE returns 202 instantly, AFTER_PROCESSING waits for agent response (default: IMMEDIATE)"),
    },
    async ({ agentId, authType, authValue, responseMode }) => {
      const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
      if (!agent) return err("Agent not found or unauthorized.");

      const count = await prisma.agentWebhook.count({ where: { agentId } });
      if (count >= 5) return err("Maximum 5 webhooks per agent.");

      const path = `${agent.slug}-${crypto.randomBytes(4).toString("hex")}`;
      const secret = crypto.randomBytes(16).toString("hex");

      const webhook = await prisma.agentWebhook.create({
        data: {
          agentId,
          path,
          secret,
          httpMethods: ["POST"],
          authType: authType || "NONE",
          authValue: authValue || null,
          responseMode: responseMode || "IMMEDIATE",
          isActive: true,
        },
      });

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";
      return ok({
        id: webhook.id,
        url: `${baseUrl}/api/webhooks/agent/${webhook.path}`,
        path: webhook.path,
        secret: webhook.secret,
        authType: webhook.authType,
        responseMode: webhook.responseMode,
        message: `Webhook created. POST to ${baseUrl}/api/webhooks/agent/${webhook.path}`,
      });
    }
  );

  // ── kiln_list_webhooks ──
  server.tool(
    "kiln_list_webhooks",
    "List all inbound webhooks for an agent with their URLs, auth config, and recent execution stats.",
    {
      agentId: z.string().describe("Agent ID"),
    },
    async ({ agentId }) => {
      const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
      if (!agent) return err("Agent not found or unauthorized.");

      const webhooks = await prisma.agentWebhook.findMany({
        where: { agentId },
        include: { _count: { select: { executions: true } } },
        orderBy: { createdAt: "desc" },
      });

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";
      return ok({
        agentId,
        agentName: agent.name,
        webhooks: webhooks.map((wh) => ({
          id: wh.id,
          url: `${baseUrl}/api/webhooks/agent/${wh.path}`,
          path: wh.path,
          authType: wh.authType,
          responseMode: wh.responseMode,
          isActive: wh.isActive,
          executionCount: wh._count.executions,
          createdAt: wh.createdAt.toISOString(),
        })),
      });
    }
  );

  // ── kiln_delete_webhook ──
  server.tool(
    "kiln_delete_webhook",
    "Delete an inbound webhook endpoint. This permanently removes the webhook and all its execution logs.",
    {
      agentId: z.string().describe("Agent ID (for ownership verification)"),
      webhookId: z.string().describe("Webhook ID to delete"),
    },
    async ({ agentId, webhookId }) => {
      const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
      if (!agent) return err("Agent not found or unauthorized.");

      const webhook = await prisma.agentWebhook.findFirst({ where: { id: webhookId, agentId } });
      if (!webhook) return err("Webhook not found.");

      await prisma.agentWebhook.delete({ where: { id: webhookId } });

      return ok({ deleted: true, webhookId, message: `Webhook ${webhook.path} deleted.` });
    }
  );

  // ── Agent Config Import/Export ──

  server.tool(
    "kiln_export_agent_config",
    "Export an agent's full configuration as JSON or YAML. Includes all settings, actions, prompt branches, and task config. Does NOT include conversations, knowledge base content, or API keys.",
    {
      id: z.string().describe("Agent ID to export"),
      format: z.enum(["json", "yaml"]).optional().default("json").describe("Export format: json (default) or yaml"),
    },
    async ({ id, format }) => {
      const agent = await prisma.agent.findFirst({
        where: { id, userId },
        include: {
          actions: { select: { type: true, enabled: true, config: true } },
          customTools: { select: { name: true, description: true, method: true, url: true, headers: true, bodyTemplate: true, responseMapping: true, enabled: true } },
        },
      });
      if (!agent) return err("Agent not found or unauthorized.");

      const exportData: Record<string, unknown> = {
        kiln_version: "1.0",
        name: agent.name,
        slug: agent.slug,
        description: agent.description,
        mode: agent.mode,
        systemPrompt: agent.systemPrompt,
        personality: agent.personality,
        welcomeMessage: agent.welcomeMessage,
        suggestedQuestions: agent.suggestedQuestions,
        llmModel: agent.llmModel,
        modelProvider: agent.modelProvider,
        memoryEnabled: agent.memoryEnabled,
        imageAnalysisEnabled: agent.imageAnalysisEnabled,
        showAiDisclaimer: agent.showAiDisclaimer,
        visibility: agent.visibility,
        whiteLabel: agent.whiteLabel,
        showPoweredBy: agent.showPoweredBy,
        promptBranches: agent.promptBranches,
        actions: agent.actions.map((a) => ({ type: a.type, enabled: a.enabled, config: a.config })),
        customTools: agent.customTools.map((t) => ({
          name: t.name, description: t.description, method: t.method,
          url: t.url, headers: t.headers, bodyTemplate: t.bodyTemplate,
          responseMapping: t.responseMapping, enabled: t.enabled,
        })),
      };

      if (agent.mode === "TASK") {
        exportData.triggerType = agent.triggerType;
        exportData.triggerConfig = agent.triggerConfig;
        exportData.outputType = agent.outputType;
        exportData.outputConfig = agent.outputConfig;
        exportData.preProcessConfig = agent.preProcessConfig;
        exportData.postProcessConfig = agent.postProcessConfig;
      }

      if (format === "yaml") {
        const yaml = await import("js-yaml");
        const yamlContent = yaml.dump(exportData, { lineWidth: 120, noRefs: true });
        return ok({ yaml: yamlContent });
      }

      return ok(exportData);
    }
  );

  server.tool(
    "kiln_import_agent_config",
    "Create a new agent from a previously exported configuration JSON. Accepts the same format as kiln_export_agent_config output.",
    {
      config: z.object({
        name: z.string().describe("Agent name"),
        systemPrompt: z.string().describe("System prompt"),
        description: z.string().optional(),
        mode: z.enum(["CHAT", "TASK"]).optional(),
        personality: z.record(z.unknown()).optional(),
        welcomeMessage: z.string().optional(),
        suggestedQuestions: z.array(z.string()).optional(),
        llmModel: z.string().optional(),
        modelProvider: z.string().optional(),
        memoryEnabled: z.boolean().optional(),
        imageAnalysisEnabled: z.boolean().optional(),
        showAiDisclaimer: z.boolean().optional(),
        visibility: z.string().optional(),
        whiteLabel: z.record(z.unknown()).optional(),
        showPoweredBy: z.boolean().optional(),
        promptBranches: z.array(z.record(z.unknown())).optional(),
        actions: z.array(z.object({ type: z.string(), enabled: z.boolean(), config: z.record(z.unknown()).optional() })).optional(),
        customTools: z.array(z.record(z.unknown())).optional(),
        triggerType: z.string().optional(),
        triggerConfig: z.record(z.unknown()).optional(),
        outputType: z.string().optional(),
        outputConfig: z.record(z.unknown()).optional(),
      }).describe("Agent configuration object (from kiln_export_agent_config)"),
    },
    async ({ config: cfg }) => {
      const agentCheck = await canCreateAgent(userId);
      if (!agentCheck.allowed) {
        return err(`Agent limit reached (${agentCheck.current}/${agentCheck.limit}). Upgrade your plan.`);
      }

      const userEmail = await getUserEmailOrPlaceholder(userId);
      await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId, email: userEmail },
      });

      const slug = generateSlug(cfg.name);
      const mode = cfg.mode || "CHAT";

      const agent = await prisma.agent.create({
        data: {
          userId, name: cfg.name, slug,
          description: cfg.description || null,
          systemPrompt: cfg.systemPrompt,
          mode: mode,
          personality: (cfg.personality || { tone: "professional", language: "en", formality: "balanced" }) as object,
          welcomeMessage: cfg.welcomeMessage || "",
          suggestedQuestions: cfg.suggestedQuestions || [],
          llmModel: cfg.llmModel || "claude-sonnet-4-6",
          modelProvider: (cfg.modelProvider || "ANTHROPIC") as "ANTHROPIC" | "OPENAI" | "PERPLEXITY" | "GOOGLE" | "GROQ",
          memoryEnabled: cfg.memoryEnabled ?? false,
          imageAnalysisEnabled: cfg.imageAnalysisEnabled ?? false,
          showAiDisclaimer: cfg.showAiDisclaimer ?? true,
          visibility: (cfg.visibility === "INTERNAL" ? "INTERNAL" : "PUBLIC") as "PUBLIC" | "INTERNAL",
          whiteLabel: (cfg.whiteLabel || { primaryColor: "#F97316", position: "bottom-right" }) as object,
          showPoweredBy: cfg.showPoweredBy ?? true,
          promptBranches: cfg.promptBranches ? (cfg.promptBranches as object[]) : undefined,
          status: "DRAFT",
          ...(mode === "TASK" ? {
            triggerType: (cfg.triggerType || "MANUAL") as "MANUAL" | "SCHEDULE" | "WEBHOOK" | "EVENT",
            triggerConfig: cfg.triggerConfig ? (cfg.triggerConfig as object) : undefined,
            outputType: (cfg.outputType || "NONE") as "NONE" | "HTTP_REQUEST" | "EMAIL" | "NEXT_AGENT" | "WEBHOOK" | "CUSTOM_CODE",
            outputConfig: cfg.outputConfig ? (cfg.outputConfig as object) : undefined,
          } : {}),
        },
      });

      // Create actions if provided
      if (cfg.actions && cfg.actions.length > 0) {
        await prisma.$transaction(
          cfg.actions.map((a) =>
            prisma.agentAction.create({
              data: {
                agentId: agent.id,
                type: a.type as "BOOK_APPOINTMENT" | "COLLECT_EMAIL" | "SEND_EMAIL" | "SCORE_LEAD" | "NOTIFY_OWNER" | "FIRE_WEBHOOK" | "HANDOFF_HUMAN" | "CUSTOM_CODE" | "HTTP_REQUEST",
                enabled: a.enabled,
                config: (a.config || {}) as object,
              },
            })
          )
        );
      }

      // Create custom tools if provided
      if (cfg.customTools && cfg.customTools.length > 0) {
        for (const tool of cfg.customTools) {
          await prisma.agentCustomTool.create({
            data: {
              agentId: agent.id,
              name: (tool.name as string) || "untitled_tool",
              description: (tool.description as string) || "",
              method: (tool.method as string) || "GET",
              url: (tool.url as string) || "",
              headers: tool.headers ? (tool.headers as object) : undefined,
              bodyTemplate: (tool.bodyTemplate as string) || undefined,
              responseMapping: (tool.responseMapping as string) || undefined,
              enabled: tool.enabled !== false,
            },
          });
        }
      }

      return ok({
        id: agent.id, slug: agent.slug, mode: mode,
        publicUrl: mode === "CHAT" ? `/embed/${agent.slug}` : undefined,
        status: "DRAFT",
        message: `Agent "${cfg.name}" imported successfully. Deploy with kiln_deploy_agent to make it live.`,
      });
    }
  );

  // ── Agent Teams ──

  server.tool(
    "kiln_list_teams",
    "List all Agent Teams for the authenticated user. Returns id, name, goal, status, member count, and task count.",
    {},
    async () => {
      const teams = await prisma.agentTeam.findMany({
        where: { userId },
        include: {
          _count: { select: { members: true, tasks: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return ok(teams.map((t) => ({
        id: t.id,
        name: t.name,
        goal: t.goal,
        status: t.status,
        memberCount: t._count.members,
        taskCount: t._count.tasks,
        createdAt: t.createdAt.toISOString(),
      })));
    }
  );

  server.tool(
    "kiln_create_team",
    "Create a new Agent Team. Optionally use a template (SALES, SUPPORT, CONTENT) to auto-generate team structure.",
    {
      name: z.string().describe("Team name"),
      goal: z.string().optional().describe("Team goal or mission"),
      template: z.enum(["SALES", "SUPPORT", "CONTENT"]).optional().describe("Pre-built team template"),
    },
    async ({ name, goal, template }) => {
      const team = await prisma.agentTeam.create({
        data: { userId, name, goal: goal || null, description: template ? `Created from ${template} template` : null },
      });
      return ok({ id: team.id, name: team.name, goal: team.goal, status: team.status, template: template || null, message: `Team "${name}" created.` });
    }
  );

  server.tool(
    "kiln_add_team_member",
    "Add an agent to a team with a specific role (HEAD, COORDINATOR, EXECUTOR, REPORTER).",
    {
      teamId: z.string().describe("Team ID"),
      agentId: z.string().describe("Agent ID to add"),
      role: z.enum(["HEAD", "COORDINATOR", "EXECUTOR", "REPORTER"]).describe("Role in the team"),
      reportsToMemberId: z.string().optional().describe("ID of the team member this one reports to"),
      responsibilities: z.string().optional().describe("What this member is responsible for"),
    },
    async ({ teamId, agentId, role, reportsToMemberId, responsibilities }) => {
      const team = await prisma.agentTeam.findFirst({ where: { id: teamId, userId } });
      if (!team) return err("Team not found or access denied.");
      const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
      if (!agent) return err("Agent not found or access denied.");
      if (role === "HEAD") {
        const existingHead = await prisma.agentTeamMember.findFirst({ where: { teamId, role: "HEAD" } });
        if (existingHead) return err("Team already has a HEAD. Remove the existing HEAD first.");
      }
      const levelMap = { HEAD: 0, COORDINATOR: 1, EXECUTOR: 2, REPORTER: 2 };
      const member = await prisma.agentTeamMember.create({
        data: { teamId, agentId, role, level: levelMap[role], responsibilities, reportsToMemberId },
      });
      return ok({ id: member.id, teamId, agentId, agentName: agent.name, role, level: member.level, message: `${agent.name} added as ${role}.` });
    }
  );

  server.tool(
    "kiln_assign_task",
    "Assign a task to the team's HEAD agent for delegation. The HEAD will decompose it into subtasks.",
    {
      teamId: z.string().describe("Team ID"),
      task: z.string().describe("Task description or goal"),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional().describe("Priority level"),
    },
    async ({ teamId, task, priority }) => {
      const team = await prisma.agentTeam.findFirst({ where: { id: teamId, userId } });
      if (!team) return err("Team not found or access denied.");
      const created = await prisma.agentTeamTask.create({
        data: { teamId, title: task, priority: priority || "MEDIUM" },
      });
      return ok({ id: created.id, teamId, title: created.title, priority: created.priority, status: created.status, message: "Task assigned to team." });
    }
  );

  server.tool(
    "kiln_get_team_status",
    "Get current status of a team: members, tasks, progress.",
    {
      teamId: z.string().describe("Team ID"),
    },
    async ({ teamId }) => {
      const team = await prisma.agentTeam.findFirst({
        where: { id: teamId, userId },
        include: {
          members: { include: { agent: { select: { id: true, name: true, status: true } } } },
          tasks: { orderBy: { createdAt: "desc" }, take: 20 },
        },
      });
      if (!team) return err("Team not found or access denied.");
      const taskStats = {
        total: team.tasks.length,
        pending: team.tasks.filter((t) => t.status === "PENDING").length,
        inProgress: team.tasks.filter((t) => t.status === "IN_PROGRESS").length,
        completed: team.tasks.filter((t) => t.status === "COMPLETED").length,
        failed: team.tasks.filter((t) => t.status === "FAILED").length,
      };
      return ok({
        id: team.id, name: team.name, goal: team.goal, status: team.status,
        members: team.members.map((m) => {
          const config =
            m.config && typeof m.config === "object" && !Array.isArray(m.config)
              ? (m.config as Record<string, unknown>)
              : null;

          return {
            id: m.id,
            agentName:
              m.agent?.name ||
              (typeof config?.label === "string" && config.label.trim()
                ? config.label.trim()
                : m.role === "APPROVAL_GATE"
                  ? "Approval Gate"
                  : "Unassigned member"),
            role: m.role,
            level: m.level,
            responsibilities: m.responsibilities,
          };
        }),
        taskStats,
        recentTasks: team.tasks.slice(0, 10).map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority })),
      });
    }
  );

  // ── Task Agent & Workflow Tools ──────────────────────────────

  // ── kiln_create_task_agent ──
  server.tool(
    "kiln_create_task_agent",
    "Create a fully configured Task Agent with input schema, output format, pre/post-processing, and actions. Returns the agent ID ready for execution.",
    {
      name: z.string().describe("Name of the task agent"),
      description: z.string().describe("What the task does"),
      systemPrompt: z.string().optional().describe("Custom system prompt (auto-generated if omitted)"),
      model: z.string().optional().describe("LLM model ID (default: claude-sonnet-4-6)"),
      inputSchema: z.object({
        fields: z.array(z.object({
          name: z.string(),
          type: z.enum(["string", "number", "boolean", "object", "array"]),
          description: z.string().optional(),
          required: z.boolean().optional(),
        })).describe("Expected input fields"),
      }).optional().describe("Schema describing what input data the task expects"),
      outputFormat: z.enum(["json", "text", "markdown"]).optional().describe("Desired output format (default: text)"),
      preProcess: z.object({
        code: z.string().optional().describe("JavaScript transform code (receives `input`, returns transformed input)"),
        conditions: z.array(z.object({
          field: z.string().describe("Field path (e.g. 'input.email')"),
          op: z.enum(["exists", "not_exists", "equals", "not_equals", "contains", "not_contains", "gt", "lt", "gte", "lte"]),
          value: z.string().optional(),
        })).optional().describe("Conditions that must be met to run the task"),
      }).optional().describe("Pre-processing: validate/transform input before LLM call"),
      postProcess: z.object({
        code: z.string().optional().describe("JavaScript transform code (receives `output` and `input`, returns transformed output)"),
        branches: z.array(z.object({
          name: z.string().describe("Branch name"),
          condition: z.string().describe("JavaScript condition expression (e.g. 'output.score > 7')"),
          outputType: z.enum(["EMAIL", "HTTP_REQUEST", "WEBHOOK", "NEXT_AGENT", "NONE"]),
          outputConfig: z.record(z.string()).optional().describe("Config for the output action (e.g. { email, subject, url, targetAgentId })"),
        })).optional().describe("Conditional output routing based on result"),
      }).optional().describe("Post-processing: transform output and route to branches"),
      actions: z.array(z.enum(["COLLECT_EMAIL", "SCORE_LEAD", "HTTP_REQUEST", "FIRE_WEBHOOK", "CUSTOM_CODE"])).optional().describe("Actions the agent can use during execution"),
    },
    async ({ name, description, systemPrompt, model, inputSchema, outputFormat, preProcess, postProcess, actions }) => {
      const agentCheck = await canCreateAgent(userId);
      if (!agentCheck.allowed) {
        return err(`Agent limit reached (${agentCheck.current}/${agentCheck.limit}). Please upgrade your plan.`);
      }

      const userEmail = await getUserEmailOrPlaceholder(userId);
      await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId, email: userEmail },
      });

      // Build system prompt with output format instruction
      const formatInstructions: Record<string, string> = {
        json: "\n\nAlways respond with valid JSON. No markdown, no explanations outside the JSON.",
        markdown: "\n\nFormat your response as clean Markdown with headers, lists, and emphasis where appropriate.",
        text: "",
      };
      const basePrompt = systemPrompt || `You are ${name}, a task execution agent. ${description}\n\nBe precise, thorough, and follow instructions exactly.`;
      const finalPrompt = basePrompt + (formatInstructions[outputFormat || "text"] || "");

      // Build input schema description for the prompt
      let schemaHint = "";
      if (inputSchema?.fields?.length) {
        schemaHint = "\n\nExpected input fields:\n" + inputSchema.fields.map((f) =>
          `- ${f.name} (${f.type}${f.required ? ", required" : ""}): ${f.description || ""}`
        ).join("\n");
      }

      const slug = generateSlug(name);
      const agent = await prisma.agent.create({
        data: {
          userId, name, slug,
          description: description || null,
          systemPrompt: finalPrompt + schemaHint,
          mode: "TASK",
          personality: { tone: "professional", language: "en", formality: "balanced" },
          welcomeMessage: "",
          suggestedQuestions: [],
          llmModel: model || "claude-sonnet-4-6",
          status: "DRAFT",
          whiteLabel: { primaryColor: "#F97316" },
          ...(preProcess ? {
            preProcessConfig: {
              enabled: true,
              code: preProcess.code || null,
              conditions: preProcess.conditions?.map((c) => ({
                field: c.field,
                op: c.op,
                value: c.value || "",
              })) || [],
            },
          } : {}),
          ...(postProcess ? {
            postProcessConfig: {
              enabled: true,
              code: postProcess.code || null,
              branches: postProcess.branches?.map((b) => ({
                name: b.name,
                condition: b.condition,
                outputType: b.outputType,
                outputConfig: b.outputConfig || {},
              })) || [],
            },
          } : {}),
          ...(outputFormat === "json" ? { outputType: "NONE", outputConfig: { format: "json" } } : {}),
        },
      });

      // Create actions
      if (actions?.length) {
        await prisma.agentAction.createMany({
          data: actions.map((type) => ({
            agentId: agent.id, type, enabled: true,
          })),
        });
      }

      return ok({
        id: agent.id, slug: agent.slug, name: agent.name,
        mode: "TASK",
        model: agent.llmModel,
        inputSchema: inputSchema || null,
        outputFormat: outputFormat || "text",
        hasPreProcess: !!preProcess,
        hasPostProcess: !!postProcess,
        actionsEnabled: actions || [],
        message: `Task Agent "${name}" created. Execute with kiln_run_task or deploy with kiln_deploy_agent.`,
      });
    }
  );

  // ── kiln_run_task ──
  server.tool(
    "kiln_run_task",
    "Execute a Task Agent with structured JSON input. Waits for completion and returns the full result including any actions executed and output routing.",
    {
      agentId: z.string().describe("Agent ID of the task agent to run"),
      input: z.record(z.unknown()).optional().describe("JSON object with input data matching the agent's input schema"),
    },
    async ({ agentId, input }) => {
      const agent = await prisma.agent.findFirst({
        where: { id: agentId, userId },
        include: {
          knowledgeBases: { where: { embeddingStatus: "READY" } },
          actions: { where: { enabled: true } },
          customTools: { where: { enabled: true } },
          channels: { where: { type: "STRIPE", isActive: true } },
        },
      });
      if (!agent) return err("Agent not found or unauthorized.");
      if (agent.mode !== "TASK") return err("This tool only works for Task Agents (mode=TASK). Use kiln_chat for Chat Agents.");

      const startTime = Date.now();
      const selectedModel = agent.llmModel || "claude-sonnet-4-6";
      const modelProvider = MODEL_PROVIDER_MAP[selectedModel] || "ANTHROPIC";

      // Pre-process: evaluate conditions
      const preProcessConfig = agent.preProcessConfig as {
        enabled?: boolean;
        code?: string;
        conditions?: { field: string; op: string; value: string }[];
      } | null;

      let processedInput: unknown = input;

      if (preProcessConfig?.enabled) {
        if (preProcessConfig.conditions?.length) {
          for (const cond of preProcessConfig.conditions) {
            const { evalCondition } = await import("@/lib/services/task-service");
            if (!evalCondition(cond, processedInput)) {
              const duration = Date.now() - startTime;
              return ok({
                status: "SKIPPED",
                reason: `Pre-process condition not met: ${cond.field} ${cond.op} ${cond.value}`,
                duration,
                output: null,
              });
            }
          }
        }
        if (preProcessConfig.code?.trim()) {
          const { safeEval: evalSafe } = await import("@/lib/safe-eval");
          const evalResult = await evalSafe({
            args: ["input"],
            values: [processedInput],
            code: preProcessConfig.code,
            userId,
            agentId,
            label: "pre-process",
          });
          if (evalResult.success && evalResult.result !== undefined && evalResult.result !== null) {
            processedInput = evalResult.result;
          }
        }
      }

      // BYOK
      let userApiKey: string | null = null;
      try {
        const apiKeyRecord = await prisma.apiKey.findUnique({
          where: { userId_provider: { userId, provider: modelProvider.toLowerCase() } },
        });
        if (apiKeyRecord) userApiKey = decrypt(apiKeyRecord.encryptedKey);
      } catch { /* fallback */ }

      // Build system prompt with RAG
      let systemPrompt = agent.systemPrompt;
      const inputStr = processedInput
        ? (typeof processedInput === "object" ? JSON.stringify(processedInput) : String(processedInput))
        : "";
      if (agent.knowledgeBases.length > 0 && inputStr) {
        try {
          const chunks = await searchRelevantChunks(agentId, inputStr.slice(0, 500), 5);
          if (chunks.length > 0) {
            systemPrompt += "\n\n---\nRELEVANT KNOWLEDGE:\n" +
              chunks.map((c: { content: string }, i: number) => `[${i + 1}] ${c.content}`).join("\n\n");
          }
        } catch { /* skip RAG */ }
      }

      const taskInput = processedInput
        ? (typeof processedInput === "object" ? JSON.stringify(processedInput, null, 2) : String(processedInput))
        : "Run your configured task.";
      const userMessage = `Execute the following task:\n\n${taskInput}`;

      // Build tools
      const tools: Anthropic.Tool[] = [];
      for (const action of agent.actions) {
        const config = (action.config || {}) as Record<string, string>;
        switch (action.type) {
          case "COLLECT_EMAIL":
            tools.push({ name: "collect_email", description: "Collect visitor email", input_schema: { type: "object" as const, properties: { email: { type: "string" }, name: { type: "string" } }, required: ["email"] } });
            break;
          case "SCORE_LEAD":
            tools.push({ name: "score_lead", description: "Score lead quality 1-10", input_schema: { type: "object" as const, properties: { score: { type: "number" }, reasoning: { type: "string" }, email: { type: "string" } }, required: ["score", "reasoning"] } });
            break;
          case "HTTP_REQUEST":
            if (config.url && config.description) {
              tools.push({ name: "http_request", description: config.description, input_schema: { type: "object" as const, properties: { data: { type: "object" } }, required: [] } });
            }
            break;
          case "FIRE_WEBHOOK":
            if (config.url) {
              tools.push({ name: "fire_webhook", description: config.description || "Fire a webhook", input_schema: { type: "object" as const, properties: { data: { type: "object" } }, required: [] } });
            }
            break;
        }
      }

      // Custom HTTP tools
      for (const ct of agent.customTools) {
        const placeholders = [...(ct.url.match(/\{\{(\w+)\}\}/g) || []), ...((ct.bodyTemplate || "").match(/\{\{(\w+)\}\}/g) || [])];
        const unique = Array.from(new Set(placeholders.map((p: string) => p.replace(/\{\{|\}\}/g, ""))));
        const props: Record<string, unknown> = {};
        for (const n of unique) props[n] = { type: "string", description: `Value for ${n}` };
        tools.push({ name: `custom_tool_${ct.name}`, description: ct.description, input_schema: { type: "object" as const, properties: props, required: unique } });
      }

      tools.push(...buildStripeTools(agent.channels.length > 0));

      let responseText = "";
      const actionsExecuted: string[] = [];

      try {
        const { executeTaskTool } = await import("@/lib/services/task-service");

        if (modelProvider === "OPENAI") {
          const openai = new OpenAI({ apiKey: userApiKey || process.env.OPENAI_API_KEY });
          const oaiTools: OpenAI.ChatCompletionTool[] = tools.map((t) => ({
            type: "function" as const,
            function: { name: t.name, description: t.description || "", parameters: t.input_schema },
          }));
          const messages: OpenAI.ChatCompletionMessageParam[] = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ];
          for (let round = 0; round < 5; round++) {
            const resp = await openai.chat.completions.create({
              model: selectedModel, max_tokens: 2048, messages,
              ...(oaiTools.length > 0 ? { tools: oaiTools } : {}),
            });
            const choice = resp.choices[0];
            if (!choice.message.tool_calls?.length) {
              responseText = choice.message.content || "";
              break;
            }
            messages.push(choice.message);
            for (const call of choice.message.tool_calls) {
              if (call.type !== "function") continue;
              const fnCall = call as { id: string; type: "function"; function: { name: string; arguments: string } };
              const args = JSON.parse(fnCall.function.arguments || "{}");
              const result = await executeTaskTool(fnCall.function.name, args, agent, processedInput);
              actionsExecuted.push(fnCall.function.name);
              messages.push({ role: "tool", tool_call_id: fnCall.id, content: JSON.stringify(result) });
            }
          }
        } else {
          const client = userApiKey ? getClaudeClientWithKey(userApiKey) : getClaudeClient();
          let currentMessages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];
          for (let round = 0; round < 5; round++) {
            const resp = await client.messages.create({
              model: selectedModel, max_tokens: 2048, system: systemPrompt, messages: currentMessages,
              ...(tools.length > 0 ? { tools } : {}),
            });
            const toolUseBlocks = resp.content.filter((b) => b.type === "tool_use");
            if (toolUseBlocks.length === 0) {
              for (const block of resp.content) { if (block.type === "text") responseText += block.text; }
              break;
            }
            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const block of toolUseBlocks) {
              if (block.type !== "tool_use") continue;
              const result = await executeTaskTool(block.name, block.input as Record<string, unknown>, agent, processedInput);
              actionsExecuted.push(block.name);
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
            }
            currentMessages = [...currentMessages, { role: "assistant", content: resp.content }, { role: "user", content: toolResults }];
          }
        }
      } catch (e) {
        const duration = Date.now() - startTime;
        await prisma.agentRun.create({
          data: { agentId, triggerType: "MANUAL", status: "ERROR", error: e instanceof Error ? e.message : "LLM call failed", duration, creditsUsed: 0 },
        }).catch(() => {});
        return err(`Task execution failed: ${e instanceof Error ? e.message : "Unknown error"}`);
      }

      // Post-process
      const postProcessConfig = agent.postProcessConfig as {
        enabled?: boolean; code?: string;
        branches?: { name: string; condition: string; outputType: string; outputConfig: Record<string, string> }[];
      } | null;

      let postProcessedOutput: unknown = responseText;
      if (postProcessConfig?.enabled && postProcessConfig.code?.trim()) {
        const { safeEval: evalSafe } = await import("@/lib/safe-eval");
        const evalResult = await evalSafe({
          args: ["output", "input"],
          values: [responseText, processedInput],
          code: postProcessConfig.code,
          userId, agentId,
          label: "post-process",
        });
        if (evalResult.success && evalResult.result !== undefined) {
          postProcessedOutput = evalResult.result;
          responseText = typeof evalResult.result === "string" ? evalResult.result : JSON.stringify(evalResult.result);
        }
      }

      const duration = Date.now() - startTime;
      const run = await prisma.agentRun.create({
        data: {
          agentId, triggerType: "MANUAL",
          input: processedInput ? JSON.parse(JSON.stringify(processedInput)) : undefined,
          output: responseText.slice(0, 10000),
          status: "SUCCESS", duration, creditsUsed: 0,
        },
      });

      waitUntil(
        prisma.agent.update({
          where: { id: agentId },
          data: { lastRunAt: new Date(), lastRunResult: { runId: run.id, status: "SUCCESS", duration, actionsExecuted } },
        }).catch((updateErr) => { console.error("MCP task run metadata update failed:", updateErr); })
      );

      // Try to parse JSON output if format indicates it
      let parsedOutput: unknown = responseText;
      try {
        const trimmed = responseText.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          parsedOutput = JSON.parse(trimmed);
        }
      } catch { /* keep as string */ }

      return ok({
        runId: run.id,
        status: "SUCCESS",
        duration,
        output: parsedOutput,
        actionsExecuted,
        postProcessed: postProcessedOutput !== responseText,
        message: `Task agent "${agent.name}" executed successfully in ${(duration / 1000).toFixed(1)}s.`,
      });
    }
  );

  // ── kiln_execute_team ──
  server.tool(
    "kiln_execute_team",
    "Execute a team workflow: decompose a goal into subtasks assigned to team members using the HEAD agent. Returns all generated tasks.",
    {
      teamId: z.string().describe("Team ID"),
      goal: z.string().describe("Goal or task for the team to execute"),
    },
    async ({ teamId, goal }) => {
      const team = await prisma.agentTeam.findFirst({
        where: { id: teamId, userId },
        include: {
          members: {
            include: { agent: { select: { id: true, name: true, systemPrompt: true, mode: true, llmModel: true } } },
            orderBy: { level: "asc" },
          },
        },
      });
      if (!team) return err("Team not found or access denied.");
      if (team.members.length === 0) return err("Team has no members. Add agents with kiln_add_team_member first.");

      const head = team.members.find((m) => m.role === "HEAD");
      if (!head) return err("Team has no HEAD member. Add a HEAD agent with kiln_add_team_member first.");

      const getMemberName = (member: (typeof team.members)[number]) => {
        const config =
          member.config &&
          typeof member.config === "object" &&
          !Array.isArray(member.config)
            ? (member.config as Record<string, unknown>)
            : null;

        return (
          member.agent?.name ||
          (typeof config?.label === "string" && config.label.trim()
            ? config.label.trim()
            : member.role === "APPROVAL_GATE"
              ? "Approval Gate"
              : "Unassigned member")
        );
      };

      // Use Claude to decompose the goal into subtasks
      const memberDescriptions = team.members.map((m) =>
        `- ${getMemberName(m)} (${m.role}): ${m.responsibilities || "General purpose"}`
      ).join("\n");

      let userApiKey: string | null = null;
      try {
        const apiKeyRecord = await prisma.apiKey.findUnique({
          where: { userId_provider: { userId, provider: "anthropic" } },
        });
        if (apiKeyRecord) userApiKey = decrypt(apiKeyRecord.encryptedKey);
      } catch { /* fallback */ }

      const client = userApiKey ? getClaudeClientWithKey(userApiKey) : getClaudeClient();

      const decomposition = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: `You are a project manager. Given a goal and a list of team members with roles, decompose the goal into 3-8 concrete, actionable subtasks. Assign each to the most appropriate team member.

Return ONLY a JSON array: [{"title": "...", "description": "...", "assignTo": "Agent Name", "priority": "HIGH|MEDIUM|LOW"}]`,
        messages: [{ role: "user", content: `Goal: ${goal}\n\nTeam members:\n${memberDescriptions}` }],
      });

      const decomText = decomposition.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
      const jsonMatch = decomText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return err("Failed to decompose goal into tasks. Try rephrasing the goal.");

      let tasks: { title: string; description?: string; assignTo: string; priority?: string }[];
      try {
        tasks = JSON.parse(jsonMatch[0]);
      } catch {
        return err("Failed to parse task decomposition. Try again.");
      }

      // Create tasks and assign to members
      const createdTasks = [];
      for (const task of tasks) {
        const member = team.members.find(
          (m) => getMemberName(m).toLowerCase() === task.assignTo.toLowerCase()
        );
        const created = await prisma.agentTeamTask.create({
          data: {
            teamId,
            title: task.title,
            description: task.description || null,
            priority: (task.priority as "HIGH" | "MEDIUM" | "LOW") || "MEDIUM",
            assignedToId: member?.id || null,
          },
        });
        createdTasks.push({
          id: created.id,
          title: created.title,
          description: created.description,
          priority: created.priority,
          assignedTo: member ? getMemberName(member) : "Unassigned",
          status: created.status,
        });
      }

      return ok({
        teamId,
        teamName: team.name,
        goal,
        tasksCreated: createdTasks.length,
        tasks: createdTasks,
        message: `Goal decomposed into ${createdTasks.length} tasks and assigned to team members.`,
      });
    }
  );

  // ── kiln_create_workflow_automation ──
  server.tool(
    "kiln_create_workflow_automation",
    "Create a scheduled or webhook-triggered automation for an agent or team. Supports cron expressions, webhooks, and notification routing.",
    {
      agentId: z.string().describe("Agent ID to automate"),
      name: z.string().describe("Automation name"),
      trigger: z.object({
        type: z.enum(["schedule", "webhook"]).describe("Trigger type"),
        schedule: z.string().optional().describe("Cron expression (e.g. '0 9 * * *' for daily at 9am UTC) or shorthand: 'hourly', 'daily', 'weekly'"),
        webhookConfig: z.object({
          authType: z.enum(["NONE", "HEADER_AUTH", "HMAC"]).optional(),
          authValue: z.string().optional(),
        }).optional().describe("Webhook authentication config"),
      }).describe("How the automation is triggered"),
      inputTemplate: z.string().optional().describe("Input template for each run (supports {{date}}, {{timestamp}} placeholders)"),
      notification: z.object({
        method: z.enum(["NONE", "EMAIL", "WEBHOOK"]).optional(),
        target: z.string().optional().describe("Email address or webhook URL for notifications"),
      }).optional().describe("How to notify about results"),
    },
    async ({ agentId, name: autoName, trigger, inputTemplate, notification }) => {
      const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
      if (!agent) return err("Agent not found or unauthorized.");

      const count = await prisma.automationRule.count({ where: { agentId } });
      if (count >= 10) return err("Maximum 10 automations per agent.");

      if (trigger.type === "schedule") {
        // Resolve shorthand cron expressions
        const cronMap: Record<string, string> = {
          "hourly": "0 * * * *",
          "daily": "0 9 * * *",
          "weekly": "0 9 * * 1",
          "every-6h": "0 */6 * * *",
          "twice-daily": "0 9,17 * * *",
        };
        const cronExpression = cronMap[trigger.schedule || "daily"] || trigger.schedule || "0 9 * * *";

        const automation = await prisma.automationRule.create({
          data: {
            agentId,
            name: autoName,
            cronExpression,
            taskDescription: inputTemplate || "Run your configured task.",
            enabled: true,
            notificationMethod: notification?.method || "NONE",
            notificationTarget: notification?.target || null,
          },
        });

        return ok({
          id: automation.id,
          name: automation.name,
          triggerType: "schedule",
          cronExpression,
          inputTemplate: inputTemplate || null,
          notification: { method: notification?.method || "NONE", target: notification?.target || null },
          enabled: true,
          message: `Scheduled automation "${autoName}" created (${cronExpression}).`,
        });
      } else {
        // Webhook trigger — create a webhook endpoint
        const path = `${agent.slug}-auto-${crypto.randomBytes(4).toString("hex")}`;
        const secret = crypto.randomBytes(16).toString("hex");

        const webhook = await prisma.agentWebhook.create({
          data: {
            agentId,
            path,
            secret,
            httpMethods: ["POST"],
            authType: trigger.webhookConfig?.authType || "NONE",
            authValue: trigger.webhookConfig?.authValue || null,
            responseMode: "AFTER_PROCESSING",
            isActive: true,
          },
        });

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";
        return ok({
          id: webhook.id,
          name: autoName,
          triggerType: "webhook",
          webhookUrl: `${baseUrl}/api/webhooks/agent/${webhook.path}`,
          secret: webhook.secret,
          authType: webhook.authType,
          inputTemplate: inputTemplate || null,
          message: `Webhook automation "${autoName}" created. POST to ${baseUrl}/api/webhooks/agent/${webhook.path}`,
        });
      }
    }
  );

  // ── kiln_list_workflows ──
  server.tool(
    "kiln_list_workflows",
    "List all automations, team configurations, and orchestration rules. Provides a complete overview of all workflows.",
    {},
    async () => {
      const [automations, teams, orchestrations] = await Promise.all([
        prisma.automationRule.findMany({
          where: { agent: { userId } },
          include: { agent: { select: { id: true, name: true, mode: true } } },
          orderBy: { createdAt: "desc" },
        }),
        prisma.agentTeam.findMany({
          where: { userId },
          include: {
            members: { include: { agent: { select: { id: true, name: true } } } },
            _count: { select: { tasks: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.agentOrchestration.findMany({
          where: { sourceAgent: { userId } },
          include: {
            sourceAgent: { select: { id: true, name: true } },
            targetAgent: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);

      return ok({
        automations: automations.map((a) => ({
          id: a.id,
          name: a.name,
          agentName: a.agent.name,
          agentId: a.agentId,
          cronExpression: a.cronExpression,
          enabled: a.enabled,
          lastRunAt: a.lastRunAt?.toISOString() || null,
          notificationMethod: a.notificationMethod,
        })),
        teams: teams.map((t) => ({
          id: t.id,
          name: t.name,
          goal: t.goal,
          status: t.status,
          memberCount: t.members.length,
          members: t.members.map((m) => {
            const config =
              m.config && typeof m.config === "object" && !Array.isArray(m.config)
                ? (m.config as Record<string, unknown>)
                : null;

            return {
              agentName:
                m.agent?.name ||
                (typeof config?.label === "string" && config.label.trim()
                  ? config.label.trim()
                  : m.role === "APPROVAL_GATE"
                    ? "Approval Gate"
                    : "Unassigned member"),
              role: m.role,
            };
          }),
          taskCount: t._count.tasks,
        })),
        orchestrations: orchestrations.map((o) => ({
          id: o.id,
          source: o.sourceAgent.name,
          target: o.targetAgent.name,
          condition: o.condition,
          enabled: o.enabled,
        })),
        summary: {
          totalAutomations: automations.length,
          activeAutomations: automations.filter((a) => a.enabled).length,
          totalTeams: teams.length,
          totalOrchestrations: orchestrations.length,
        },
      });
    }
  );

  // ── kiln_run_agent (legacy) ──
  server.tool(
    "kiln_run_agent",
    "Manually trigger a Task Agent and return the execution result. Only works for agents with mode=TASK.",
    {
      agentId: z.string().describe("Agent ID of the task agent to run"),
      input: z.string().optional().describe("Input text or instructions for the task (defaults to 'Run your configured task.')"),
    },
    async ({ agentId, input }) => {
      const agent = await prisma.agent.findFirst({
        where: { id: agentId, userId },
        include: {
          knowledgeBases: { where: { embeddingStatus: "READY" } },
          actions: { where: { enabled: true } },
          customTools: { where: { enabled: true } },
        },
      });
      if (!agent) return err("Agent not found or unauthorized.");
      if (agent.mode !== "TASK") return err("This tool only works for Task Agents (mode=TASK). Use kiln_chat for Chat Agents.");

      const startTime = Date.now();
      const selectedModel = agent.llmModel || "claude-sonnet-4-6";
      const modelProvider = MODEL_PROVIDER_MAP[selectedModel] || "ANTHROPIC";

      // BYOK
      let userApiKey: string | null = null;
      try {
        const apiKeyRecord = await prisma.apiKey.findUnique({
          where: { userId_provider: { userId, provider: modelProvider.toLowerCase() } },
        });
        if (apiKeyRecord) userApiKey = decrypt(apiKeyRecord.encryptedKey);
      } catch { /* fallback */ }

      // Build system prompt with RAG
      let systemPrompt = agent.systemPrompt;
      const inputStr = input || "Run your configured task.";
      if (agent.knowledgeBases.length > 0) {
        try {
          const chunks = await searchRelevantChunks(agentId, inputStr.slice(0, 500), 5);
          if (chunks.length > 0) {
            systemPrompt += "\n\n---\nRELEVANT KNOWLEDGE:\n" +
              chunks.map((c: { content: string }, i: number) => `[${i + 1}] ${c.content}`).join("\n\n");
          }
        } catch { /* skip RAG */ }
      }

      const userMessage = `Execute the following task:\n\n${inputStr}`;
      let responseText = "";

      try {
        if (modelProvider === "OPENAI") {
          const openai = new OpenAI({ apiKey: userApiKey || process.env.OPENAI_API_KEY });
          const resp = await openai.chat.completions.create({
            model: selectedModel, max_tokens: 2048,
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }],
          });
          responseText = resp.choices[0]?.message?.content || "";
        } else {
          const client = userApiKey ? getClaudeClientWithKey(userApiKey) : getClaudeClient();
          const resp = await client.messages.create({
            model: selectedModel, max_tokens: 2048,
            system: systemPrompt,
            messages: [{ role: "user", content: userMessage }],
          });
          for (const block of resp.content) {
            if (block.type === "text") responseText += block.text;
          }
        }
      } catch (e) {
        const duration = Date.now() - startTime;
        await prisma.agentRun.create({
          data: { agentId, triggerType: "MANUAL", status: "ERROR", error: e instanceof Error ? e.message : "LLM call failed", duration, creditsUsed: 0 },
        }).catch(() => {});
        return err(`Task execution failed: ${e instanceof Error ? e.message : "Unknown error"}`);
      }

      const duration = Date.now() - startTime;
      const run = await prisma.agentRun.create({
        data: {
          agentId, triggerType: "MANUAL",
          input: { text: inputStr },
          output: responseText.slice(0, 10000),
          status: "SUCCESS", duration, creditsUsed: 0,
        },
      });

      waitUntil(
        prisma.agent.update({
          where: { id: agentId },
          data: { lastRunAt: new Date(), lastRunResult: { runId: run.id, status: "SUCCESS", duration } },
        }).catch((err) => {
          console.error("MCP agent run metadata update failed:", err);
        })
      );

      return ok({
        runId: run.id, status: "SUCCESS", duration,
        output: responseText,
        message: `Task agent "${agent.name}" executed successfully in ${(duration / 1000).toFixed(1)}s.`,
      });
    }
  );

  // ── kiln_get_runs ──
  server.tool(
    "kiln_get_runs",
    "Get execution history for a Task Agent. Returns recent runs with status, duration, output preview, and credits used.",
    {
      agentId: z.string().describe("Agent ID"),
      limit: z.number().optional().describe("Number of runs to return (default 20, max 50)"),
    },
    async ({ agentId, limit: runLimit }) => {
      const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
      if (!agent) return err("Agent not found or unauthorized.");

      const take = Math.min(runLimit || 20, 50);
      const runs = await prisma.agentRun.findMany({
        where: { agentId },
        orderBy: { createdAt: "desc" },
        take,
      });

      return ok({
        agentId, agentName: agent.name, mode: agent.mode,
        totalRuns: runs.length,
        runs: runs.map((r) => ({
          id: r.id,
          status: r.status,
          triggerType: r.triggerType,
          duration: r.duration,
          creditsUsed: r.creditsUsed,
          outputPreview: r.output ? r.output.slice(0, 200) : null,
          error: r.error,
          createdAt: r.createdAt.toISOString(),
        })),
      });
    }
  );

  // ── kiln_export_team_yaml ──
  server.tool(
    "kiln_export_team_yaml",
    "Export a team's full configuration as YAML. Returns the team name, agents, orchestration rules, and schedule in a portable YAML format that can be imported later.",
    { teamId: z.string().describe("The team ID to export") },
    async ({ teamId }) => {
      try {
        const team = await prisma.agentTeam.findFirst({
          where: { id: teamId, userId },
          select: { id: true },
        });
        if (!team) return err("Team not found or not owned by you.");

        const { exportTeamAsYaml } = await import("@/lib/team-yaml");
        const yamlContent = await exportTeamAsYaml(teamId);
        return ok({ yaml: yamlContent });
      } catch (e) {
        return err(e instanceof Error ? e.message : "Export failed");
      }
    }
  );

  // ── kiln_import_team_yaml ──
  server.tool(
    "kiln_import_team_yaml",
    "Import a team from YAML configuration. Creates the team, all agents, actions, orchestration rules, and hierarchy from a YAML definition.",
    { yaml: z.string().describe("The YAML content defining the team") },
    async ({ yaml: yamlContent }) => {
      try {
        const { importTeamFromYaml } = await import("@/lib/team-yaml");
        const result = await importTeamFromYaml(userId, yamlContent);
        return ok(result);
      } catch (e) {
        return err(e instanceof Error ? e.message : "Import failed");
      }
    }
  );

  return server;
}

// Handler for all HTTP methods
async function handleMcpRequest(req: Request): Promise<Response> {
  let authResult: ApiKeyAuthSuccess | null = null;

  try {
    // Authenticate
    const auth = await authenticateApiKey(req.headers.get("authorization"));
    if (!auth.ok) {
      return apiKeyAuthErrorResponse(auth);
    }
    authResult = auth;
    waitUntil(authResult.touchLastUsed);

    const scopeError = requireApiKeyScope(req, authResult, "admin");
    if (scopeError) {
      return scopeError;
    }

    // Rate limit
    const rateCheck = checkRateLimit(authResult.keyId);
    if (!rateCheck.allowed) {
      return apiKeyJson(
        req,
        authResult,
        { error: "Rate limit exceeded. 100 requests per minute." },
        { status: 429 },
      );
    }

    // Create stateless transport + server per request
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    });

    const server = createMcpServer(authResult.userId);
    await server.connect(transport);

    const response = await transport.handleRequest(req);
    waitUntil(authResult.logUsage(req, response.status));
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    if (authResult) {
      return apiKeyJson(req, authResult, { error: message }, { status: 500 });
    }
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
