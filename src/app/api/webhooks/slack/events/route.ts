import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getClaudeClient, getClaudeClientWithKey, MODEL_PROVIDER_MAP } from "@/lib/ai";
import { searchRelevantChunks } from "@/lib/rag";
import { decrypt } from "@/lib/encryption";
import { deductCredits } from "@/lib/credits";
import { verifySlackSignature, sendSlackMessage, getSlackUserInfo } from "@/lib/integrations/slack";
import crypto from "crypto";

function hashSession(sessionId: string): string {
  return crypto.createHash("sha256").update(sessionId).digest("hex").slice(0, 32);
}

interface SlackChannelConfig {
  accessToken: string;
  channelId: string;
  channelName?: string;
  teamId?: string;
  teamName?: string;
  botUserId: string;
}

// Look up the agent connected to a given Slack channel
async function findAgentBySlackChannel(slackChannelId: string): Promise<{
  agentId: string;
  config: SlackChannelConfig;
} | null> {
  const channels = await prisma.agentChannel.findMany({
    where: { type: "SLACK", isActive: true },
  });

  for (const ch of channels) {
    try {
      const config = JSON.parse(decrypt(ch.config)) as SlackChannelConfig;
      if (config.channelId === slackChannelId) {
        return { agentId: ch.agentId, config };
      }
    } catch {
      // Decryption/parse failed — skip
    }
  }

  return null;
}

// POST: Global Slack Events API endpoint
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // Verify Slack signature
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (signingSecret) {
      const timestamp = request.headers.get("x-slack-request-timestamp") || "";
      const signature = request.headers.get("x-slack-signature") || "";
      if (!verifySlackSignature(signingSecret, timestamp, rawBody, signature)) {
        return Response.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody);

    // Handle URL verification challenge
    if (payload.type === "url_verification") {
      return Response.json({ challenge: payload.challenge });
    }

    // Only handle event_callback
    if (payload.type !== "event_callback") {
      return Response.json({ ok: true });
    }

    const event = payload.event;
    if (!event) return Response.json({ ok: true });

    // Only handle user messages (not subtypes like bot_message, channel_join, etc.)
    if (event.type !== "message" || event.subtype || event.bot_id) {
      return Response.json({ ok: true });
    }

    const channelId = event.channel as string;
    const userSlackId = event.user as string;
    const userText = event.text as string;
    const threadTs = (event.thread_ts || event.ts) as string;

    if (!userText || !channelId || !userSlackId) {
      return Response.json({ ok: true });
    }

    // Find the agent connected to this Slack channel
    const match = await findAgentBySlackChannel(channelId);
    if (!match) {
      return Response.json({ ok: true });
    }

    const { agentId, config } = match;

    // Don't respond to the bot's own messages
    if (userSlackId === config.botUserId) {
      return Response.json({ ok: true });
    }

    // Load agent with knowledge bases, actions, custom tools
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        knowledgeBases: { where: { embeddingStatus: "READY" } },
        actions: true,
        customTools: { where: { enabled: true } },
      },
    });

    if (!agent) {
      await sendSlackMessage(config.accessToken, channelId, "Sorry, this agent is no longer available.", threadTs);
      return Response.json({ ok: true });
    }

    // Get Slack user info
    const userInfo = await getSlackUserInfo(config.accessToken, userSlackId);

    // Use slack channel + user as sessionId
    const sessionId = `slack-${channelId}-${userSlackId}`;

    // Find or create conversation
    let conversation = await prisma.conversation.findFirst({
      where: { agentId, sessionId },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          agentId,
          sessionId,
          channel: "SLACK",
          visitorName: userInfo.name,
          visitorEmail: userInfo.email || null,
        },
      });
    }

    // Save user message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        content: userText,
      },
    });

    // RAG: Search knowledge base
    let knowledgeContext = "";
    if (agent.knowledgeBases.length > 0) {
      try {
        const ragChunks = await searchRelevantChunks(agentId, userText, 5);
        if (ragChunks.length > 0) {
          knowledgeContext =
            "\n\n---\nRELEVANT KNOWLEDGE FROM THE KNOWLEDGE BASE:\n" +
            ragChunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n") +
            "\n---\nUse the above knowledge to answer the question. If the knowledge is not relevant, answer from your general knowledge.";
        }
      } catch {
        // RAG failed, continue without
      }
    }

    // Build system prompt
    const now = new Date();
    let systemPrompt = agent.systemPrompt
      .replace(/\{\{agent\.name\}\}/g, agent.name)
      .replace(/\{\{current\.time\}\}/g, now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }))
      .replace(/\{\{current\.date\}\}/g, now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }))
      .replace(/\{\{user\.name\}\}/g, userInfo.name)
      .replace(/\{\{user\.email\}\}/g, userInfo.email || "Unknown")
      .replace(/\{\{knowledge\.context\}\}/g, knowledgeContext || "");

    if (!systemPrompt.includes(knowledgeContext) && knowledgeContext) {
      systemPrompt += knowledgeContext;
    }

    // Add Slack context
    systemPrompt += "\n\nYou are responding via Slack. Keep messages concise and well-formatted for Slack. Use Slack markdown: *bold*, _italic_, `code`, ```code blocks```. Use short paragraphs.";

    // Auto-detect language
    if (agent.autoDetectLanguage) {
      systemPrompt = "IMPORTANT: Detect the language of the user's message and ALWAYS respond in the same language. If the user writes in English, respond in English. If the user writes in German, respond in German. Match their language exactly.\n\n" + systemPrompt;
    }

    // Load persistent memory
    const sessionHash = hashSession(sessionId);
    if (agent.memoryEnabled) {
      try {
        const memories = await prisma.agentMemory.findMany({
          where: { agentId, sessionHash },
          orderBy: { updatedAt: "desc" },
        });
        if (memories.length > 0) {
          systemPrompt += "\n\n---\nWHAT YOU REMEMBER ABOUT THIS USER:\n" +
            memories.map((m) => `- ${m.key}: ${m.value}`).join("\n") +
            "\n---\nUse these memories to personalize your responses.";
        }
      } catch { /* continue */ }
    }

    // Load recent conversation history
    const recentMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    const claudeMessages: Anthropic.MessageParam[] = recentMessages.map((m) => ({
      role: m.role === "USER" ? "user" as const : "assistant" as const,
      content: m.content,
    }));

    // Get Claude client (BYOK support)
    const selectedModel = agent.llmModel || "claude-sonnet-4-20250514";
    const modelProvider = MODEL_PROVIDER_MAP[selectedModel] || "ANTHROPIC";
    let anthropicClient: Anthropic;

    if (modelProvider === "ANTHROPIC") {
      try {
        const apiKeyRecord = await prisma.apiKey.findUnique({
          where: { userId_provider: { userId: agent.userId, provider: "anthropic" } },
        });
        if (apiKeyRecord) {
          anthropicClient = getClaudeClientWithKey(decrypt(apiKeyRecord.encryptedKey));
        } else {
          anthropicClient = getClaudeClient();
        }
      } catch {
        anthropicClient = getClaudeClient();
      }
    } else {
      anthropicClient = getClaudeClient();
    }

    // Call Claude (non-streaming for Slack)
    const response = await anthropicClient.messages.create({
      model: modelProvider === "ANTHROPIC" ? selectedModel : "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: claudeMessages,
    });

    // Extract text
    const assistantText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n\n") || "Sorry, I couldn't generate a response.";

    // Save assistant message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "ASSISTANT",
        content: assistantText,
      },
    });

    // Deduct credits (fire-and-forget)
    const usedModel = modelProvider === "ANTHROPIC" ? selectedModel : "claude-sonnet-4-20250514";
    waitUntil(
      deductCredits(agent.userId, usedModel, "WEBHOOK", agent.id, conversation.id).catch((err) => {
        console.error("Slack events credit deduction failed:", err);
      })
    );

    // Send response to Slack (in thread)
    await sendSlackMessage(config.accessToken, channelId, assistantText, threadTs);

    return Response.json({ ok: true });
  } catch (err) {
    console.error("Slack events webhook error:", err);
    // Always return 200 to prevent Slack retries
    return Response.json({ ok: true });
  }
}
