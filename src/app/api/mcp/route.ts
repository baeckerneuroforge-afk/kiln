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
    "List all AI agents for the authenticated user. Returns id, name, slug, status, agentMode (CHAT or TASK), model, conversation/run count, and public URL.",
    {},
    async () => {
      const agents = await prisma.agent.findMany({
        where: { userId },
        select: {
          id: true, name: true, slug: true, description: true,
          llmModel: true, status: true, agentMode: true, createdAt: true,
          _count: { select: { conversations: true, runs: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return ok(agents.map((a) => ({
        id: a.id, name: a.name, slug: a.slug, description: a.description,
        model: a.llmModel, status: a.status, agentMode: a.agentMode,
        conversationCount: a._count.conversations,
        runCount: a._count.runs,
        publicUrl: a.agentMode === "CHAT" ? `/embed/${a.slug}` : undefined,
        createdAt: a.createdAt.toISOString(),
      })));
    }
  );

  // ── kiln_create_agent ──
  server.tool(
    "kiln_create_agent",
    "Create a new AI agent. Set agentMode to CHAT for conversational agents or TASK for autonomous background agents. Returns the agent ID, slug, and public URL.",
    {
      name: z.string().describe("Name of the agent"),
      description: z.string().describe("What the agent does"),
      industry: z.string().optional().describe("Industry context (e.g. 'real estate', 'saas', 'ecommerce')"),
      agentMode: z.enum(["CHAT", "TASK"]).optional().describe("Agent mode: CHAT (conversational, default) or TASK (autonomous background execution)"),
    },
    async ({ name, description, industry, agentMode }) => {
      const agentCheck = await canCreateAgent(userId);
      if (!agentCheck.allowed) {
        return err(`Agent limit reached (${agentCheck.current}/${agentCheck.limit}). Please upgrade your plan.`);
      }

      await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId, email: `${userId}@clerk.temp` },
      });

      const mode = agentMode || "CHAT";
      const slug = generateSlug(name);
      const systemPrompt = industry
        ? `You are ${name}, an AI assistant for the ${industry} industry. ${description || ""}\n\nBe helpful, professional, and concise.`
        : `You are ${name}. ${description || ""}\n\nBe helpful, professional, and concise.`;

      const agent = await prisma.agent.create({
        data: {
          userId, name, slug,
          description: description || null,
          systemPrompt,
          agentMode: mode,
          personality: { tone: "professional", language: "en", formality: "balanced" },
          welcomeMessage: mode === "CHAT" ? `Hi! I'm ${name}. How can I help you today?` : "",
          suggestedQuestions: [],
          llmModel: "claude-sonnet-4-20250514",
          status: "DRAFT",
          whiteLabel: { primaryColor: "#F97316", position: "bottom-right" },
        },
      });

      return ok({
        id: agent.id, slug: agent.slug, agentMode: mode,
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
      const selectedModel = agent.llmModel || "claude-sonnet-4-20250514";
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
      const selectedModel = agent.llmModel || "claude-sonnet-4-20250514";
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
        prisma.agentTestCase.update({
          where: { id: tc.id },
          data: { lastResult: pass ? "PASS" : "FAIL", lastResponse: responseText.slice(0, 2000), lastRunAt: new Date() },
        }).catch(() => {});
      }

      const score = testCases.length > 0 ? passed / testCases.length : 0;

      // Save test run
      prisma.agentTestRun.create({
        data: { agentId, totalTests: testCases.length, passed, failed: testCases.length - passed, score },
      }).catch(() => {});

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

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kiln-topaz.vercel.app";
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

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kiln-topaz.vercel.app";
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

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kiln-topaz.vercel.app";
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
        members: team.members.map((m) => ({ id: m.id, agentName: m.agent.name, role: m.role, level: m.level, responsibilities: m.responsibilities })),
        taskStats,
        recentTasks: team.tasks.slice(0, 10).map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority })),
      });
    }
  );

  // ── kiln_run_agent ──
  server.tool(
    "kiln_run_agent",
    "Manually trigger a Task Agent and return the execution result. Only works for agents with agentMode=TASK.",
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
      if (agent.agentMode !== "TASK") return err("This tool only works for Task Agents (agentMode=TASK). Use kiln_chat for Chat Agents.");

      const startTime = Date.now();
      const selectedModel = agent.llmModel || "claude-sonnet-4-20250514";
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

      prisma.agent.update({
        where: { id: agentId },
        data: { lastRunAt: new Date(), lastRunResult: { runId: run.id, status: "SUCCESS", duration } },
      }).catch(() => {});

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
        agentId, agentName: agent.name, agentMode: agent.agentMode,
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
