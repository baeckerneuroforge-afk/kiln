import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getClaudeClient, getClaudeClientWithKey, MODEL_PROVIDER_MAP } from "@/lib/ai";
import { searchRelevantChunks } from "@/lib/rag";
import { decrypt } from "@/lib/encryption";
import { checkCredits, deductCredits } from "@/lib/credits";
import {
  sendWhatsAppMessage,
  markAsRead,
  verifyWebhookSignature,
  parseIncomingMessage,
} from "@/lib/integrations/whatsapp";
import crypto from "crypto";

function hashSession(sessionId: string): string {
  return crypto.createHash("sha256").update(sessionId).digest("hex").slice(0, 32);
}

// GET: Webhook verification (Meta sends a challenge on setup)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const { agentId } = await params;
  const channel = await prisma.agentChannel.findUnique({
    where: { agentId_type: { agentId, type: "WHATSAPP" } },
    select: { config: true },
  }).catch(() => null);

  let verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (channel) {
    try {
      const config = JSON.parse(decrypt(channel.config)) as { verifyToken?: string };
      if (config.verifyToken) {
        verifyToken = config.verifyToken;
      }
    } catch {
      // Fall back to env token for legacy configs
    }
  }

  if (mode === "subscribe" && token === verifyToken) {
    console.log("WhatsApp webhook verified");
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

// POST: Receive incoming WhatsApp messages
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
    const rawBody = await request.text();

    // Verify WhatsApp webhook signature
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
      console.error("WHATSAPP_APP_SECRET not configured");
      return Response.json({ error: "WhatsApp app secret not configured" }, { status: 500 });
    }
    const signature = request.headers.get("x-hub-signature-256") || "";
    if (!verifyWebhookSignature(appSecret, rawBody, signature)) {
      console.error("WhatsApp webhook signature verification failed");
      return Response.json({ ok: true }); // Return 200 to prevent retries
    }

    const body = JSON.parse(rawBody);

    // Parse the incoming message
    const incoming = parseIncomingMessage(body);
    if (!incoming) {
      // Status updates, delivery receipts, non-text messages — ignore silently
      return Response.json({ ok: true });
    }

    const { from, text: userText, messageId, senderName } = incoming;

    // Load agent channel config
    const channel = await prisma.agentChannel.findUnique({
      where: { agentId_type: { agentId, type: "WHATSAPP" } },
    });

    if (!channel || !channel.isActive) {
      return Response.json({ ok: true });
    }

    const config = JSON.parse(decrypt(channel.config)) as {
      phoneNumberId: string;
      accessToken: string;
    };

    // Mark message as read (blue ticks)
    waitUntil(markAsRead(config.phoneNumberId, messageId, config.accessToken));

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
      await sendWhatsAppMessage(
        config.phoneNumberId,
        from,
        "Sorry, this agent is no longer available.",
        config.accessToken
      );
      return Response.json({ ok: true });
    }

    // Use WhatsApp phone number as sessionId for conversation continuity
    const sessionId = `wa-${from}`;

    // Find or create conversation
    let conversation = await prisma.conversation.findFirst({
      where: { agentId, sessionId },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          agentId,
          sessionId,
          channel: "WHATSAPP",
          visitorName: senderName,
        },
      });

      // Send welcome message on first contact if configured
      if (agent.welcomeMessage) {
        await sendWhatsAppMessage(
          config.phoneNumberId,
          from,
          agent.welcomeMessage,
          config.accessToken
        );
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            role: "ASSISTANT",
            content: agent.welcomeMessage,
          },
        });
      }
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
      .replace(/\{\{user\.name\}\}/g, senderName)
      .replace(/\{\{user\.email\}\}/g, "Unknown")
      .replace(/\{\{knowledge\.context\}\}/g, knowledgeContext || "");

    if (!systemPrompt.includes(knowledgeContext) && knowledgeContext) {
      systemPrompt += knowledgeContext;
    }

    // Add WhatsApp context
    systemPrompt += "\n\nYou are responding via WhatsApp. Keep messages concise and well-formatted for mobile. Use short paragraphs. Use *bold* and _italic_ for emphasis. Avoid HTML. Use emojis sparingly where appropriate.";

    // Load persistent memory
    const sessionHash = hashSession(sessionId);
    if (agent.memoryEnabled) {
      try {
        const memories = await prisma.agentMemory.findMany({
          where: { agentId, sessionHash },
          orderBy: { updatedAt: "desc" },
        });
        if (memories.length > 0) {
          systemPrompt +=
            "\n\n---\nWHAT YOU REMEMBER ABOUT THIS USER:\n" +
            memories.map((m) => `- ${m.key}: ${m.value}`).join("\n") +
            "\n---\nUse these memories to personalize your responses.";
        }
      } catch {
        /* continue */
      }
    }

    // Load recent conversation history for context
    const recentMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    const claudeMessages: Anthropic.MessageParam[] = recentMessages.map((m) => ({
      role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
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

    // Credit pre-check before LLM call
    const usedModel = modelProvider === "ANTHROPIC" ? selectedModel : "claude-sonnet-4-20250514";
    const hasByokKey = anthropicClient !== getClaudeClient();
    const creditCheck = await checkCredits(agent.userId, usedModel, hasByokKey);
    if (!creditCheck.allowed) {
      console.warn(`WhatsApp webhook: insufficient credits for agent ${agentId}, user ${agent.userId}`);
      return Response.json({ ok: true }); // Return 200 to prevent Meta retries
    }

    // Call Claude (non-streaming for WhatsApp)
    const response = await anthropicClient.messages.create({
      model: modelProvider === "ANTHROPIC" ? selectedModel : "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: claudeMessages,
    });

    // Extract text response
    const assistantText =
      response.content
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
    waitUntil(
      deductCredits(agent.userId, usedModel, "WEBHOOK", agent.id, conversation.id).catch((err) => {
        console.error("WhatsApp webhook credit deduction failed:", err);
      })
    );

    // Send response to WhatsApp
    await sendWhatsAppMessage(config.phoneNumberId, from, assistantText, config.accessToken);

    return Response.json({ ok: true });
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
    // Always return 200 to Meta to prevent retries
    return Response.json({ ok: true });
  }
}
