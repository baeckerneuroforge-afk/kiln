import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getClaudeClient, getClaudeClientWithKey, MODEL_PROVIDER_MAP } from "@/lib/ai";
import { searchRelevantChunks } from "@/lib/rag";
import { decrypt } from "@/lib/encryption";
import crypto from "crypto";

const TELEGRAM_API = "https://api.telegram.org";

function hashSession(sessionId: string): string {
  return crypto.createHash("sha256").update(sessionId).digest("hex").slice(0, 32);
}

// Send message back to Telegram
async function sendTelegramMessage(botToken: string, chatId: number, text: string) {
  // Telegram limits messages to 4096 chars
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, 4096));
    remaining = remaining.slice(4096);
  }

  for (const chunk of chunks) {
    await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: "Markdown",
      }),
    });
  }
}

// POST: Receive Telegram webhook updates
export async function POST(request: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await params;
    const update = await request.json();

    // Extract message from update
    const message = update.message || update.edited_message;
    if (!message || !message.text) {
      // Silently ignore non-text updates (stickers, photos, etc.)
      return Response.json({ ok: true });
    }

    const chatId = message.chat.id;
    const userText = message.text;
    const userName = message.from?.first_name || message.from?.username || "User";

    // Skip bot commands that aren't /start
    if (userText.startsWith("/") && !userText.startsWith("/start")) {
      return Response.json({ ok: true });
    }

    // Load agent channel config
    const channel = await prisma.agentChannel.findUnique({
      where: { agentId_type: { agentId, type: "TELEGRAM" } },
    });

    if (!channel || !channel.isActive) {
      return Response.json({ ok: true }); // Silently ignore if channel is disabled
    }

    const config = JSON.parse(channel.config) as { botToken: string };
    const botToken = config.botToken;

    // Load agent with actions & knowledge
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        knowledgeBases: { where: { embeddingStatus: "READY" } },
        actions: true,
        customTools: { where: { enabled: true } },
      },
    });

    if (!agent) {
      await sendTelegramMessage(botToken, chatId, "Sorry, this agent is no longer available.");
      return Response.json({ ok: true });
    }

    // Use telegram chatId as sessionId for conversation continuity
    const sessionId = `tg-${chatId}`;

    // Find or create conversation
    let conversation = await prisma.conversation.findFirst({
      where: { agentId, sessionId },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          agentId,
          sessionId,
          channel: "TELEGRAM",
          visitorName: userName,
        },
      });
    }

    // Handle /start command
    const actualMessage = userText.startsWith("/start")
      ? (agent.welcomeMessage ? `Hi, I'd like to start a conversation.` : userText)
      : userText;

    // Save user message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        content: actualMessage,
      },
    });

    // If /start, send welcome message directly
    if (userText.startsWith("/start") && agent.welcomeMessage) {
      await sendTelegramMessage(botToken, chatId, agent.welcomeMessage);
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: agent.welcomeMessage,
        },
      });
      return Response.json({ ok: true });
    }

    // RAG: Search knowledge base
    let knowledgeContext = "";
    if (agent.knowledgeBases.length > 0) {
      try {
        const ragChunks = await searchRelevantChunks(agentId, actualMessage, 5);
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
      .replace(/\{\{user\.name\}\}/g, userName)
      .replace(/\{\{user\.email\}\}/g, "Unknown")
      .replace(/\{\{knowledge\.context\}\}/g, knowledgeContext || "");

    if (!systemPrompt.includes(knowledgeContext) && knowledgeContext) {
      systemPrompt += knowledgeContext;
    }

    // Add Telegram context
    systemPrompt += "\n\nYou are responding via Telegram. Keep messages concise and well-formatted for mobile. Use short paragraphs. Avoid HTML tags — use Markdown for formatting.";

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

    // Load recent conversation history for context
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
    const modelProvider = MODEL_PROVIDER_MAP[selectedModel] || "anthropic";
    let anthropicClient: Anthropic;

    if (modelProvider === "anthropic") {
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
      // For Telegram, fall back to Claude even if agent is configured for OpenAI
      anthropicClient = getClaudeClient();
    }

    // Call Claude (non-streaming for Telegram)
    const response = await anthropicClient.messages.create({
      model: modelProvider === "anthropic" ? selectedModel : "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: claudeMessages,
    });

    // Extract text response
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

    // Send response to Telegram
    await sendTelegramMessage(botToken, chatId, assistantText);

    return Response.json({ ok: true });
  } catch (err) {
    console.error("Telegram webhook error:", err);
    // Always return 200 to Telegram to prevent retries
    return Response.json({ ok: true });
  }
}
