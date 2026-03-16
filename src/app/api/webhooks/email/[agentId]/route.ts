import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getClaudeClient, getClaudeClientWithKey, MODEL_PROVIDER_MAP } from "@/lib/ai";
import { searchRelevantChunks } from "@/lib/rag";
import { decrypt } from "@/lib/encryption";
import { deductCredits } from "@/lib/credits";
import crypto from "crypto";

const RESEND_API = "https://api.resend.com";
const EMAIL_DOMAIN = "getkiln.com";
const MAX_DAILY_EMAILS = 50;

function hashSession(sessionId: string): string {
  return crypto.createHash("sha256").update(sessionId).digest("hex").slice(0, 32);
}

// Strip HTML tags to plain text
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Send reply email via Resend
async function sendReplyEmail(
  to: string,
  subject: string,
  body: string,
  agentName: string,
  agentSlug: string,
) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) throw new Error("RESEND_API_KEY not configured");

  const fromAddress = `${agentName} <${agentSlug}@${EMAIL_DOMAIN}>`;
  const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;

  await fetch(`${RESEND_API}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to,
      subject: replySubject,
      text: body,
    }),
  });
}

// Forward notification to owner
async function forwardNotification(
  forwardingEmail: string,
  fromEmail: string,
  subject: string,
  body: string,
  agentName: string,
) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  try {
    await fetch(`${RESEND_API}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `KILN Notifications <noreply@${EMAIL_DOMAIN}>`,
        to: forwardingEmail,
        subject: `[${agentName}] New email from ${fromEmail}: ${subject}`,
        text: `New email received by your agent "${agentName}":\n\nFrom: ${fromEmail}\nSubject: ${subject}\n\n---\n${body.slice(0, 2000)}\n---\n\nThe agent has automatically replied to this email.`,
      }),
    });
  } catch {
    // Best-effort forwarding
  }
}

// POST: Receive inbound email webhook
export async function POST(request: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await params;
    const payload = await request.json();

    // Extract email fields (Resend inbound webhook format)
    const fromEmail = payload.from || payload.sender || "";
    const subject = payload.subject || "(No Subject)";
    const htmlBody = payload.html || "";
    const textBody = payload.text || "";

    // Get plain text content — prefer text, fall back to stripped HTML
    const emailBody = textBody.trim() || stripHtml(htmlBody);

    if (!emailBody || !fromEmail) {
      return Response.json({ ok: true }); // Nothing to process
    }

    // Load agent channel config
    const channel = await prisma.agentChannel.findUnique({
      where: { agentId_type: { agentId, type: "EMAIL" } },
    });

    if (!channel || !channel.isActive) {
      return Response.json({ ok: true }); // Channel disabled
    }

    const config = JSON.parse(channel.config) as {
      agentEmail: string;
      forwardingEmail?: string | null;
      dailyCount: number;
      dailyCountDate: string;
    };

    // Rate limit: max 50 inbound emails per day per agent
    const today = new Date().toISOString().slice(0, 10);
    let dailyCount = config.dailyCount || 0;
    if (config.dailyCountDate !== today) {
      dailyCount = 0; // Reset for new day
    }

    if (dailyCount >= MAX_DAILY_EMAILS) {
      console.warn(`Email rate limit reached for agent ${agentId}`);
      return Response.json({ ok: true, rateLimited: true });
    }

    // Update daily count
    await prisma.agentChannel.update({
      where: { id: channel.id },
      data: {
        config: JSON.stringify({
          ...config,
          dailyCount: dailyCount + 1,
          dailyCountDate: today,
          lastEmailAt: new Date().toISOString(),
        }),
      },
    });

    // Load agent with knowledge
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        knowledgeBases: { where: { embeddingStatus: "READY" } },
        actions: true,
        customTools: { where: { enabled: true } },
      },
    });

    if (!agent) {
      return Response.json({ ok: true });
    }

    // Use sender email as sessionId for conversation continuity
    const senderNormalized = fromEmail.toLowerCase().trim();
    const sessionId = `email-${senderNormalized}`;

    // Find or create conversation
    let conversation = await prisma.conversation.findFirst({
      where: { agentId, sessionId },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          agentId,
          sessionId,
          channel: "EMAIL",
          visitorEmail: senderNormalized,
          visitorName: senderNormalized.split("@")[0],
        },
      });
    }

    // Build user message with subject context
    const userMessage = `[Email Subject: ${subject}]\n\n${emailBody}`;

    // Save user message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        content: userMessage,
      },
    });

    // RAG: Search knowledge base
    let knowledgeContext = "";
    if (agent.knowledgeBases.length > 0) {
      try {
        const ragChunks = await searchRelevantChunks(agentId, emailBody, 5);
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
    const senderName = senderNormalized.split("@")[0];
    let systemPrompt = agent.systemPrompt
      .replace(/\{\{agent\.name\}\}/g, agent.name)
      .replace(/\{\{current\.time\}\}/g, now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }))
      .replace(/\{\{current\.date\}\}/g, now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }))
      .replace(/\{\{user\.name\}\}/g, senderName)
      .replace(/\{\{user\.email\}\}/g, senderNormalized)
      .replace(/\{\{knowledge\.context\}\}/g, knowledgeContext || "");

    if (!systemPrompt.includes(knowledgeContext) && knowledgeContext) {
      systemPrompt += knowledgeContext;
    }

    // Add email context
    systemPrompt += "\n\nYou are responding via email. Write professional, well-structured email responses. Use proper paragraphs. Do not use Markdown formatting — write in plain text suitable for email. Be thorough but concise. Do not include a subject line in your response — only the body text.";

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
      // Fall back to Claude for email channel
      anthropicClient = getClaudeClient();
    }

    // Call Claude (non-streaming for email)
    const response = await anthropicClient.messages.create({
      model: modelProvider === "ANTHROPIC" ? selectedModel : "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: claudeMessages,
    });

    // Extract text response
    const assistantText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n\n") || "Thank you for your email. I'm unable to generate a response at this time.";

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
        console.error("Email webhook credit deduction failed:", err);
      })
    );

    // Send reply email via Resend
    await sendReplyEmail(senderNormalized, subject, assistantText, agent.name, agent.slug);

    // Forward notification to owner if configured
    if (config.forwardingEmail) {
      await forwardNotification(config.forwardingEmail, senderNormalized, subject, emailBody, agent.name);
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("Email webhook error:", err);
    return Response.json({ ok: true });
  }
}
