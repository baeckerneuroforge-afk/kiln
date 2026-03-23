import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import * as Sentry from "@sentry/nextjs";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getClaudeClient, getClaudeClientWithKey, MODEL_PROVIDER_MAP, modelSupportsVision, type ProviderKey } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { searchRelevantChunks } from "@/lib/rag";
import { checkCredits, deductCredits } from "@/lib/credits";
import { decrypt } from "@/lib/encryption";
import { fireWebhookEvent } from "@/lib/webhooks";
import { emitEvent } from "@/lib/events";
import { sendNewLeadEmail, sendHandoffEmail } from "@/lib/email-notifications";
import { exportLeadToNotion } from "@/lib/services/notion-lead-export";
import {
  logConversationToHubSpot,
  syncAppointmentDealToHubSpot,
  syncLeadToHubSpot,
} from "@/lib/services/hubspot-sync";
import crypto from "crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { extractTextContent, hashSession, extractAndSaveMemories, evaluateOrchestrationHandoff } from "@/lib/services/chat-service";
import { detectIntent, hasTopicShifted, loadTeamAgentsForRouting } from "@/lib/intent-router";
import { buildTools, executeChatTool } from "@/lib/services/action-service";
import { getOrCreateVisitor, generateMemoryPrefix, updateVisitorMemory, linkEmailToVisitor } from "@/lib/visitor-memory";
import { triggerLeadWorkflows } from "@/lib/services/workflow-lead-trigger";
import {
  getAgentScheduleFromWhiteLabel,
  getAgentScheduleStatus,
} from "@/lib/agent-scheduling";
import { detectKnowledgeGap, researchAndLearn } from "@/lib/agentic-rag";
import { extractInsights, recordInsights, injectEnterpriseContext } from "@/lib/enterprise-memory";
import { detectImageAction, extractDocumentData } from "@/lib/image-actions";
import { matchProductFromImage } from "@/lib/image-product-match";

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

// In-memory rate limiter fallback when Upstash is not configured
const inMemoryLimits = new Map<string, { count: number; resetAt: number }>();
const IN_MEMORY_LIMIT = 30;
const IN_MEMORY_WINDOW_MS = 60_000;

function checkInMemoryRateLimit(identifier: string): { success: boolean } {
  const now = Date.now();
  const entry = inMemoryLimits.get(identifier);
  if (!entry || now >= entry.resetAt) {
    inMemoryLimits.set(identifier, { count: 1, resetAt: now + IN_MEMORY_WINDOW_MS });
    return { success: true };
  }
  entry.count++;
  return { success: entry.count <= IN_MEMORY_LIMIT };
}

const rateLimiter =
  upstashUrl && upstashToken
    ? new Ratelimit({
        redis: new Redis({ url: upstashUrl, token: upstashToken }),
        limiter: Ratelimit.slidingWindow(20, "1 h"),
      })
    : null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function parseToolResult(result: string): Record<string, unknown> | null {
  try {
    return JSON.parse(result) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Prüft ob Nachrichten Bilder enthalten
function messagesContainImages(messages: { content: unknown }[]): boolean {
  return messages.some((m) => {
    if (!Array.isArray(m.content)) return false;
    return m.content.some((block: { type: string }) => block.type === "image");
  });
}

// Extrahiert die erste Bild-URL (data URI) aus einer multimodalen Nachricht für DB-Speicherung
function extractImageDataUri(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  const imageBlock = content.find((block: { type: string }) => block.type === "image");
  if (!imageBlock) return null;
  const source = (imageBlock as { source?: { type: string; media_type?: string; data?: string } }).source;
  if (source?.type === "base64" && source.data && source.media_type) {
    // Kürze das Bild für DB-Speicherung (Vorschau-Thumbnail, max 100KB)
    const dataSize = source.data.length;
    if (dataSize > 150_000) {
      // Zu groß für DB — speichere nur Metadaten
      return `data:${source.media_type};kiln-meta,size=${dataSize}`;
    }
    return `data:${source.media_type};base64,${source.data}`;
  }
  return null;
}

// Konvertiert multimodale Nachricht zu OpenAI-Format mit Bild-URLs
function toOpenAIMultimodalContent(content: unknown): OpenAI.ChatCompletionContentPart[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (!Array.isArray(content)) return [{ type: "text", text: "" }];
  return content.map((block: { type: string; text?: string; source?: { type: string; media_type?: string; data?: string } }) => {
    if (block.type === "text") {
      return { type: "text" as const, text: block.text || "" };
    }
    if (block.type === "image" && block.source?.data && block.source?.media_type) {
      return {
        type: "image_url" as const,
        image_url: {
          url: `data:${block.source.media_type};base64,${block.source.data}`,
          detail: "auto" as const,
        },
      };
    }
    return { type: "text" as const, text: "" };
  });
}

// Konvertiert multimodale Nachricht zu Gemini-Format mit inline_data
function toGeminiParts(content: unknown): { text?: string; inline_data?: { mime_type: string; data: string } }[] {
  if (typeof content === "string") return [{ text: content }];
  if (!Array.isArray(content)) return [{ text: "" }];
  return content.map((block: { type: string; text?: string; source?: { type: string; media_type?: string; data?: string } }) => {
    if (block.type === "text") return { text: block.text || "" };
    if (block.type === "image" && block.source?.data && block.source?.media_type) {
      return { inline_data: { mime_type: block.source.media_type, data: block.source.data } };
    }
    return { text: "" };
  });
}

// CORS Preflight
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

// Live chat with agent (Streaming + RAG + Tool Use + Persistence)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
    if (rateLimiter) {
      const { success } = await rateLimiter.limit(`embed-chat:${ip}`);
      if (!success) {
        return Response.json(
          { error: "Rate limit exceeded. Please try again later." },
          { status: 429, headers: corsHeaders }
        );
      }
    } else {
      const { success } = checkInMemoryRateLimit(`chat:${ip}`);
      if (!success) {
        return Response.json(
          { error: "Rate limit exceeded. Please wait a moment." },
          { status: 429, headers: corsHeaders }
        );
      }
    }

    const body = await request.json();
    const { messages, sessionId: clientSessionId, channel, debug, visitorId: clientVisitorId, offlineLead } = body;

    // Load agent with actions and custom tools
    const originalAgent = await prisma.agent.findUnique({
      where: { id: params.id },
      include: {
        knowledgeBases: { where: { embeddingStatus: "READY" } },
        actions: true,
        customTools: { where: { enabled: true } },
        channels: { where: { type: "STRIPE", isActive: true } },
      },
    });

    if (!originalAgent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const schedule = getAgentScheduleFromWhiteLabel(originalAgent.whiteLabel);
    const scheduleStatus = getAgentScheduleStatus(schedule);

    if (offlineLead) {
      if (!schedule.enabled || scheduleStatus.isOnline) {
        return Response.json(
          { error: "Offline lead capture is only available outside business hours." },
          { status: 400, headers: corsHeaders }
        );
      }

      const email =
        offlineLead && typeof offlineLead === "object" && typeof offlineLead.email === "string"
          ? offlineLead.email.trim()
          : "";
      const name =
        offlineLead && typeof offlineLead === "object" && typeof offlineLead.name === "string"
          ? offlineLead.name.trim()
          : null;

      if (!email || !email.includes("@")) {
        return Response.json(
          { error: "A valid email address is required." },
          { status: 400, headers: corsHeaders }
        );
      }

      await prisma.lead.create({
        data: {
          agentId: params.id,
          email,
          name: name || null,
          context: "offline-lead",
        },
      });

      waitUntil(
        emitEvent("lead.captured", originalAgent.userId, params.id, {
          email,
          name: name || null,
          source: "offline-lead",
        })
      );
      // Trigger Workflows mit Lead-Trigger
      waitUntil(
        triggerLeadWorkflows(params.id, originalAgent.userId, {
          email,
          name: name || null,
          source: "offline-lead",
        })
      );

      return Response.json(
        { success: true, message: "Offline lead captured." },
        { headers: corsHeaders }
      );
    }

    if (!messages || !Array.isArray(messages)) {
      return Response.json(
        { error: "Messages are required." },
        { status: 400 }
      );
    }

    // Conversation-Persistenz: Session finden oder erstellen (before agent resolution for handoff check)
    const sessionId = clientSessionId || crypto.randomUUID();
    let conversation = await prisma.conversation.findFirst({
      where: { agentId: params.id, sessionId },
    });

    // Check for active agent handoff — if conversation was handed off, use target agent
    let agent = originalAgent;
    let intentRoutingEvent: { intent: string; confidence: number; targetAgent: string } | null = null;
    if (conversation?.handoffAgentId && conversation.handoffAgentId !== params.id) {
      const handoffAgent = await prisma.agent.findUnique({
        where: { id: conversation.handoffAgentId },
        include: {
          knowledgeBases: { where: { embeddingStatus: "READY" } },
          actions: true,
          customTools: { where: { enabled: true } },
          channels: { where: { type: "STRIPE", isActive: true } },
        },
      });
      if (handoffAgent) {
        agent = handoffAgent;
      }
    }

    // Intent-based team routing: automatically route to best agent
    const latestUserText = messages[messages.length - 1]?.content || "";
    if (
      originalAgent.teamRoutingEnabled &&
      originalAgent.teamRoutingTeamId &&
      typeof latestUserText === "string" &&
      latestUserText.trim()
    ) {
      try {
        const teamAgents = await loadTeamAgentsForRouting(originalAgent.teamRoutingTeamId);
        if (teamAgents.length > 1) {
          const previousIntent = conversation?.lastDetectedIntent || null;
          // Build conversation context from last few messages
          const contextMessages = messages.slice(-4).map((m: { role: string; content: string }) => `${m.role}: ${typeof m.content === "string" ? m.content.slice(0, 100) : ""}`).join("\n");

          const intentResult = await detectIntent(
            latestUserText,
            agent.id,
            teamAgents,
            contextMessages
          );

          // Only route on topic shift with high confidence
          if (
            intentResult.agentId !== agent.id &&
            intentResult.confidence > 0.8 &&
            hasTopicShifted(intentResult.intent, previousIntent)
          ) {
            // Seamless handoff to better agent
            const targetAgent = await prisma.agent.findUnique({
              where: { id: intentResult.agentId },
              include: {
                knowledgeBases: { where: { embeddingStatus: "READY" } },
                actions: true,
                customTools: { where: { enabled: true } },
                channels: { where: { type: "STRIPE", isActive: true } },
              },
            });
            if (targetAgent) {
              agent = targetAgent;
              intentRoutingEvent = {
                intent: intentResult.intent,
                confidence: intentResult.confidence,
                targetAgent: targetAgent.name,
              };

              // Update conversation with intent + handoff
              if (conversation) {
                await prisma.conversation.update({
                  where: { id: conversation.id },
                  data: {
                    handoffAgentId: targetAgent.id,
                    handoffAt: new Date(),
                    lastDetectedIntent: intentResult.intent,
                    lastIntentAgentId: targetAgent.id,
                  },
                });
              }
            }
          } else {
            // Update intent tracking without routing
            if (conversation && intentResult.intent !== "unknown" && intentResult.intent !== "general") {
              waitUntil(
                prisma.conversation.update({
                  where: { id: conversation.id },
                  data: { lastDetectedIntent: intentResult.intent },
                }).catch(() => {})
              );
            }
          }
        }
      } catch (err) {
        console.error("Intent routing failed:", err);
        // Continue with current agent on failure
      }
    }

    const activeSchedule = getAgentScheduleFromWhiteLabel(agent.whiteLabel);
    const activeScheduleStatus = getAgentScheduleStatus(activeSchedule);
    if (activeSchedule.enabled && !activeScheduleStatus.isOnline) {
      return Response.json(
        {
          error: "This agent is currently offline.",
          offline: true,
          offlineAction: activeSchedule.offlineAction,
          offlineMessage: activeSchedule.offlineMessage,
          nextOnlineText: activeScheduleStatus.nextOnlineText,
        },
        { status: 423, headers: corsHeaders }
      );
    }

    // BYOK: Prüfen ob der User einen eigenen Key für den gewählten Provider hat
    const selectedModel = agent.llmModel || "claude-sonnet-4-6";
    const modelProvider: ProviderKey = (agent.modelProvider as ProviderKey) || MODEL_PROVIDER_MAP[selectedModel] || "ANTHROPIC";
    const providerLower = modelProvider.toLowerCase();
    let userApiKey: string | null = null;
    let usingOwnKey = false;

    try {
      const apiKeyRecord = await prisma.apiKey.findUnique({
        where: { userId_provider: { userId: agent.userId, provider: providerLower } },
      });
      if (apiKeyRecord) {
        userApiKey = decrypt(apiKeyRecord.encryptedKey);
        usingOwnKey = true;
      }
    } catch {
      // Key-Entschlüsselung fehlgeschlagen — KILN Key verwenden
    }

    // Credit check — BYOK users bypass credits
    const creditCheck = await checkCredits(agent.userId, selectedModel, usingOwnKey);
    if (!creditCheck.allowed) {
      return Response.json(
        {
          error: creditCheck.message,
          creditExhausted: true,
          balance: creditCheck.balance,
          cost: creditCheck.cost,
        },
        { status: 429, headers: corsHeaders }
      );
    }

    // Vision check: Wenn Bilder gesendet werden aber Modell kein Vision unterstützt
    const hasImages = messagesContainImages(messages);
    if (hasImages && !agent.imageAnalysisEnabled) {
      return Response.json(
        { error: "Image analysis is not enabled for this agent." },
        { status: 400, headers: corsHeaders }
      );
    }
    if (hasImages && !modelSupportsVision(selectedModel)) {
      return Response.json(
        { error: "This agent's model doesn't support image analysis. Please describe what you see instead." },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          agentId: params.id,
          sessionId,
          channel: channel === "EMBED" ? "WEB" : (channel || "WEB"),
        },
      });

      // Webhook: conversation.started
      waitUntil(
        fireWebhookEvent(agent.userId, "conversation.started", params.id, {
          conversationId: conversation.id,
          sessionId,
          channel: channel || "WEB",
        }).catch((err) => {
          console.error("Conversation started webhook dispatch failed:", err);
        })
      );
      waitUntil(
        emitEvent("conversation.started", agent.userId, params.id, {
          conversationId: conversation.id,
          sessionId,
          channel: channel || "WEB",
        })
      );

      // Email notification: new lead (fire-and-forget, don't block response)
      const firstMsg = extractTextContent(messages[messages.length - 1]?.content || "");
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";
      const convUrl = `${appUrl}/dashboard/agents/${params.id}?tab=logs`;
      waitUntil(
        sendNewLeadEmail(agent.userId, agent.name, firstMsg, convUrl).catch((err) => {
          console.error("New lead email notification failed:", err);
        })
      );
    }

    // Letzte User-Nachricht speichern (inkl. Bild-Referenz)
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg && lastUserMsg.role === "user") {
      const imageDataUri = extractImageDataUri(lastUserMsg.content);
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "USER",
          content: extractTextContent(lastUserMsg.content),
          imageUrl: imageDataUri,
        },
      });
    }

    // RAG: Search for relevant knowledge base chunks
    let knowledgeContext = "";
    let ragChunks: { content: string; similarity: number }[] = [];

    const lastUserMessage = [...messages]
      .reverse()
      .find((m: { role: string }) => m.role === "user");

    if (agent.knowledgeBases.length > 0 && lastUserMessage) {
      try {
        ragChunks = await searchRelevantChunks(
          params.id,
          extractTextContent(lastUserMessage.content),
          5
        );

        if (ragChunks.length > 0) {
          knowledgeContext =
            "\n\n---\nRELEVANT KNOWLEDGE FROM THE KNOWLEDGE BASE:\n" +
            ragChunks
              .map((c, i) => `[${i + 1}] ${c.content}`)
              .join("\n\n") +
            "\n---\nUse the above knowledge to answer the question. If the knowledge is not relevant, answer from your general knowledge. Do not make up information.";
        }
      } catch {
        // RAG search failed — continue without context
      }
    }

    // Variable-Replacement im System Prompt
    const now = new Date();
    const conversationCount = await prisma.conversation.count({
      where: { agentId: params.id },
    });

    let resolvedPrompt = agent.systemPrompt
      .replace(/\{\{agent\.name\}\}/g, agent.name)
      .replace(/\{\{current\.time\}\}/g, now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }))
      .replace(/\{\{current\.date\}\}/g, now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }))
      .replace(/\{\{conversation\.count\}\}/g, conversationCount.toString())
      .replace(/\{\{user\.name\}\}/g, conversation.visitorName || "Unknown")
      .replace(/\{\{user\.email\}\}/g, conversation.visitorEmail || "Unknown");

    // {{knowledge.context}} wird durch RAG-Kontext ersetzt oder entfernt
    if (knowledgeContext) {
      resolvedPrompt = resolvedPrompt.replace(/\{\{knowledge\.context\}\}/g, knowledgeContext);
    } else {
      resolvedPrompt = resolvedPrompt.replace(/\{\{knowledge\.context\}\}/g, "");
    }

    // Falls der Prompt kein {{knowledge.context}} hatte, RAG-Kontext trotzdem anhängen
    let systemPrompt = resolvedPrompt.includes(knowledgeContext)
      ? resolvedPrompt
      : resolvedPrompt + knowledgeContext;

    // Auto-detect language: platform-level instruction prepended to system prompt
    if (agent.autoDetectLanguage) {
      systemPrompt = "IMPORTANT: Detect the language of the user's message and ALWAYS respond in the same language. If the user writes in German, respond in German. If in Spanish, respond in Spanish. Do this automatically without mentioning the language switch.\n\n" + systemPrompt;
    }

    // Persistent Memory: Bekannte Fakten über den Besucher laden
    const sessionHash = hashSession(sessionId);
    if (agent.memoryEnabled) {
      try {
        const memories = await prisma.agentMemory.findMany({
          where: { agentId: params.id, sessionHash },
          orderBy: { updatedAt: "desc" },
        });

        if (memories.length > 0) {
          const memoryContext = "\n\n---\nWHAT YOU REMEMBER ABOUT THIS USER:\n" +
            memories.map((m) => `- ${m.key}: ${m.value}`).join("\n") +
            "\n---\nUse these memories to personalize your responses. Do not explicitly mention that you have a memory system unless asked.";
          systemPrompt += memoryContext;
        }
      } catch {
        // Memory-Laden fehlgeschlagen — weiter ohne
      }
    }

    // Visitor Memory: Returning visitor context
    const visitorId = clientVisitorId || null;
    let activeVisitorId: string | null = null;
    if (agent.visitorMemoryEnabled && visitorId) {
      try {
        const visitor = await getOrCreateVisitor(params.id, visitorId);
        activeVisitorId = visitor.visitorId;
        if (visitor.conversationCount > 1) {
          const prefix = generateMemoryPrefix(visitor);
          systemPrompt += prefix;
        }
      } catch {
        // Visitor memory lookup failed — continue without
      }
    }

    // Prompt Branching: Bedingte Snippets basierend auf User-Nachricht
    if (agent.promptBranches && Array.isArray(agent.promptBranches)) {
      const lastUserMsgForBranch = messages.filter((m: { role: string }) => m.role === "user").pop();
      const userText = lastUserMsgForBranch ? extractTextContent(lastUserMsgForBranch.content).toLowerCase() : "";

      if (userText) {
        const branches = agent.promptBranches as { name: string; keywords: string[]; promptSnippet: string; enabled: boolean }[];
        const matchedSnippets: string[] = [];

        for (const branch of branches) {
          if (!branch.enabled) continue;
          const matched = branch.keywords.some((kw) => {
            const pattern = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
            return pattern.test(userText);
          });
          if (matched) {
            matchedSnippets.push(branch.promptSnippet);
          }
        }

        if (matchedSnippets.length > 0) {
          systemPrompt += "\n\n---\nSpecial instructions for this type of question:\n" +
            matchedSnippets.join("\n\n");
        }
      }
    }

    // Enterprise Memory: Cross-Agent Business Intelligence injizieren
    if (agent.enableEnterpriseMemory) {
      try {
        const enterpriseContext = await injectEnterpriseContext(agent.userId);
        if (enterpriseContext) {
          systemPrompt += enterpriseContext;
        }
      } catch {
        // Enterprise Memory fehlgeschlagen — weiter ohne
      }
    }

    // Vision V1.0: Enhanced image analysis prompt + multi-image comparison
    if (hasImages) {
      systemPrompt += "\n\n---\nIMAGE ANALYSIS INSTRUCTIONS:\nWhen analyzing images:\n1. If this is a document (invoice, receipt, contract, form), extract all text and structured data fields (document number, date, amount, vendor, line items).\n2. If this is a product, describe it in detail including brand, model, condition, color, and any identifying features.\n3. If this shows damage, urgency, or a problem, note the severity clearly.";

      // Multi-image: detect before/after scenario
      const previousImageMessages = await prisma.message.findMany({
        where: {
          conversationId: conversation?.id || "",
          imageUrl: { not: null },
        },
        select: { id: true },
        take: 5,
      });

      if (previousImageMessages.length > 0) {
        systemPrompt += "\n4. The visitor has shared multiple images in this conversation. Compare them and note any differences or changes. If this appears to be a before/after comparison, label them accordingly.";
      }

      systemPrompt += "\n---";
    }

    const tools = buildTools(agent.actions, agent.customTools, agent.channels.length > 0);

    // Client erstellen: BYOK oder KILN's Key
    const isAnthropic = modelProvider === "ANTHROPIC";
    const isOpenAI = modelProvider === "OPENAI";
    const isPerplexity = modelProvider === "PERPLEXITY";
    const isGoogle = modelProvider === "GOOGLE";
    const isGroq = modelProvider === "GROQ";
    const isOpenAICompat = isOpenAI || isPerplexity || isGroq; // OpenAI-compatible API format

    // For non-Anthropic/OpenAI providers, BYOK key is required
    if ((isPerplexity || isGoogle || isGroq) && !userApiKey) {
      return Response.json(
        { error: `${modelProvider} requires your own API key. Add it in Settings > API Keys.` },
        { status: 400, headers: corsHeaders }
      );
    }

    const anthropicClient = isAnthropic ? (usingOwnKey && userApiKey ? getClaudeClientWithKey(userApiKey) : getClaudeClient()) : null;

    // Build OpenAI-compatible client for OpenAI, Perplexity, and Groq
    let openaiCompatClient: OpenAI | null = null;
    if (isOpenAI) {
      openaiCompatClient = new OpenAI({ apiKey: userApiKey || process.env.OPENAI_API_KEY });
    } else if (isPerplexity) {
      openaiCompatClient = new OpenAI({
        apiKey: userApiKey!,
        baseURL: "https://api.perplexity.ai",
      });
    } else if (isGroq) {
      openaiCompatClient = new OpenAI({
        apiKey: userApiKey!,
        baseURL: "https://api.groq.com/openai/v1",
      });
    }

    // Google Gemini uses its own REST API
    const googleApiKey = isGoogle ? userApiKey : null;

    // Prepare messages — content kann string oder array (multimodal) sein
    const claudeMessages: Anthropic.MessageParam[] = messages.map(
      (m: { role: string; content: string | Anthropic.ContentBlockParam[] }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })
    );

    // Track für Persistenz
    const conversationId = conversation.id;
    const actionsUsed: string[] = [...(conversation.actionsUsed || [])];

    // Debug tracking
    const debugToolCalls: { name: string; input: Record<string, unknown>; result: string }[] = [];
    let debugInputTokens = 0;
    let debugOutputTokens = 0;

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let fullAssistantText = "";
        try {
          // ===== Google Gemini-Pfad =====
          if (isGoogle && googleApiKey) {
            const geminiMessages = messages.map((m: { role: string; content: unknown }) => {
              // Bilder für Gemini als inline_data durchreichen
              const hasImageContent = Array.isArray(m.content) && m.content.some((b: { type: string }) => b.type === "image");
              if (hasImageContent && modelSupportsVision(selectedModel)) {
                return {
                  role: m.role === "user" ? "user" : "model",
                  parts: toGeminiParts(m.content),
                };
              }
              return {
                role: m.role === "user" ? "user" : "model",
                parts: [{ text: extractTextContent(m.content) }],
              };
            });

            const geminiBody = {
              system_instruction: { parts: [{ text: systemPrompt }] },
              contents: geminiMessages,
              generationConfig: { maxOutputTokens: 2048 },
            };

            const geminiRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${googleApiKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(geminiBody),
              }
            );

            if (!geminiRes.ok) {
              const errData = await geminiRes.json().catch(() => ({}));
              throw new Error(errData?.error?.message || `Google API error: ${geminiRes.status}`);
            }

            const geminiData = await geminiRes.json();
            const geminiText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (geminiText) {
              fullAssistantText += geminiText;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: geminiText })}\n\n`));
            }

            if (geminiData?.usageMetadata) {
              debugInputTokens += geminiData.usageMetadata.promptTokenCount || 0;
              debugOutputTokens += geminiData.usageMetadata.candidatesTokenCount || 0;
            }
          }
          // ===== OpenAI-compatible Pfad (OpenAI, Perplexity, Groq) =====
          else if (isOpenAICompat && openaiCompatClient) {
            // Tool definitions — only for providers that support them
            const providerSupportsTools = isOpenAI;
            const openaiTools: OpenAI.ChatCompletionTool[] = providerSupportsTools
              ? tools.map((t) => ({
                  type: "function" as const,
                  function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.input_schema as Record<string, unknown>,
                  },
                }))
              : [];

            const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
              { role: "system", content: systemPrompt },
              ...messages.map((m: { role: string; content: unknown }): OpenAI.ChatCompletionMessageParam => {
                // Bilder nur für vision-fähige OpenAI-Modelle (GPT-4o, GPT-4o-mini) durchreichen
                const hasImageContent = Array.isArray(m.content) && m.content.some((b: { type: string }) => b.type === "image");
                if (hasImageContent && modelSupportsVision(selectedModel) && isOpenAI && m.role === "user") {
                  return {
                    role: "user" as const,
                    content: toOpenAIMultimodalContent(m.content),
                  };
                }
                return {
                  role: m.role as "user" | "assistant",
                  content: extractTextContent(m.content),
                };
              }),
            ];

            let maxToolRounds = 5;
            while (maxToolRounds-- > 0) {
              const requestParams: OpenAI.ChatCompletionCreateParams = {
                model: selectedModel,
                max_tokens: 2048,
                messages: openaiMessages,
              };

              if (openaiTools.length > 0) {
                requestParams.tools = openaiTools;
              }

              const response = await openaiCompatClient.chat.completions.create(requestParams);
              const choice = response.choices[0];

              if (response.usage) {
                debugInputTokens += response.usage.prompt_tokens;
                debugOutputTokens += response.usage.completion_tokens || 0;
              }

              if (choice.message.content) {
                fullAssistantText += choice.message.content;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: choice.message.content })}\n\n`));
              }

              const toolCalls = choice.message.tool_calls;
              if (!toolCalls || toolCalls.length === 0) break;

              // Tool-Calls ausführen
              openaiMessages.push(choice.message);

              for (const tc of toolCalls) {
                if (tc.type !== "function") continue;
                const fnCall = tc as { id: string; type: "function"; function: { name: string; arguments: string } };
                const toolInput = JSON.parse(fnCall.function.arguments || "{}") as Record<string, unknown>;

                const actionType = fnCall.function.name === "book_appointment" ? "BOOK_APPOINTMENT"
                  : fnCall.function.name === "collect_email" ? "COLLECT_EMAIL"
                  : fnCall.function.name === "score_lead" ? "SCORE_LEAD"
                  : fnCall.function.name === "custom_code" ? "CUSTOM_CODE"
                  : fnCall.function.name === "http_request" ? "HTTP_REQUEST"
                  : fnCall.function.name.startsWith("custom_tool_") ? `CUSTOM_TOOL:${fnCall.function.name.replace("custom_tool_", "")}`
                  : fnCall.function.name.toUpperCase();
                if (!actionsUsed.includes(actionType)) actionsUsed.push(actionType);

                const result = await executeChatTool(
                  fnCall.function.name,
                  toolInput,
                  params.id,
                  agent.actions,
                  agent.customTools,
                  {
                    userId: agent.userId,
                    conversationId,
                    visitorName: conversation.visitorName,
                    visitorEmail: conversation.visitorEmail,
                    agentName: agent.name,
                  }
                );
                const parsedToolResult = parseToolResult(result);

                debugToolCalls.push({ name: fnCall.function.name, input: toolInput, result });

                openaiMessages.push({
                  role: "tool",
                  tool_call_id: fnCall.id,
                  content: result,
                });

                if (fnCall.function.name === "score_lead") {
                  const score = Math.min(10, Math.max(1, Number(toolInput.score) || 5));
                  await prisma.conversation.update({
                    where: { id: conversationId },
                    data: { leadScore: score, visitorEmail: (toolInput.email as string) || undefined },
                  });
                  waitUntil(
                    fireWebhookEvent(agent.userId, "lead.scored", params.id, {
                      conversationId,
                      score,
                      email: toolInput.email || null,
                    }).catch((err) => {
                      console.error("Lead scored webhook dispatch failed:", err);
                    })
                  );
                }
                if (fnCall.function.name === "collect_email") {
                  await prisma.conversation.update({
                    where: { id: conversationId },
                    data: { visitorEmail: (toolInput.email as string) || undefined, visitorName: (toolInput.name as string) || undefined },
                  });
                  waitUntil(
                    emitEvent("lead.captured", agent.userId, params.id, {
                      conversationId,
                      email: toolInput.email || null,
                      name: toolInput.name || null,
                    })
                  );
                  waitUntil(
                    triggerLeadWorkflows(params.id, agent.userId, {
                      conversationId,
                      email: (toolInput.email as string) || null,
                      name: (toolInput.name as string) || null,
                    })
                  );
                  // Export lead to Notion (if configured)
                  waitUntil(
                    exportLeadToNotion(params.id, agent.userId, {
                      email: (toolInput.email as string) || "",
                      name: (toolInput.name as string) || undefined,
                      conversationId,
                    })
                  );
                  waitUntil(
                    syncLeadToHubSpot({
                      agentId: params.id,
                      email: (toolInput.email as string) || "",
                      name: (toolInput.name as string) || undefined,
                      conversationId,
                    })
                  );
                  // Link email to visitor memory
                  if (activeVisitorId && toolInput.email) {
                    waitUntil(
                      linkEmailToVisitor(params.id, activeVisitorId, toolInput.email as string, toolInput.name as string | null).catch(() => {})
                    );
                  }
                }
                if (fnCall.function.name === "book_appointment" && parsedToolResult?.action === "booked") {
                  waitUntil(
                    emitEvent("appointment.booked", agent.userId, params.id, {
                      conversationId,
                      input: toolInput,
                      eventId: parsedToolResult.eventId || null,
                      start: parsedToolResult.start || null,
                      end: parsedToolResult.end || null,
                      attendeeEmail: parsedToolResult.attendeeEmail || null,
                    })
                  );
                  waitUntil(
                    syncAppointmentDealToHubSpot({
                      agentId: params.id,
                      email:
                        (parsedToolResult.attendeeEmail as string) ||
                        (toolInput.attendeeEmail as string) ||
                        "",
                      name:
                        (parsedToolResult.attendeeName as string) ||
                        (toolInput.attendeeName as string) ||
                        undefined,
                      conversationId,
                      start:
                        (parsedToolResult.start as string) ||
                        (toolInput.slotStart as string) ||
                        null,
                      reason: (toolInput.reason as string) || null,
                    })
                  );
                }
                if (fnCall.function.name === "handoff_human") {
                  // Mark conversation as handoff requested
                  await prisma.conversation.update({
                    where: { id: conversationId },
                    data: { handoffStatus: "REQUESTED" },
                  });
                  // Send handoff email
                  const recentMsgs = await prisma.message.findMany({
                    where: { conversationId },
                    orderBy: { createdAt: "desc" },
                    take: 5,
                    select: { role: true, content: true },
                  });
                  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";
                  const convUrl = `${appUrl}/dashboard/agents/${params.id}?tab=logs`;
                  waitUntil(
                    sendHandoffEmail(
                      agent.userId,
                      agent.name,
                      (toolInput.reason as string) || "No reason provided",
                      recentMsgs.reverse().map((m) => ({ role: m.role, content: m.content })),
                      { name: conversation.visitorName, email: conversation.visitorEmail },
                      convUrl
                    ).catch((err) => {
                      console.error("Handoff email failed:", err);
                    })
                  );
                }

                // Agent handoff for OpenAI path: signal handoff in stream
                if (fnCall.function.name === "handoff_agent" && parsedToolResult?.handoff) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ handoff: { from: agent.name, to: parsedToolResult.targetAgentName || "Agent" } })}\n\n`));
                }

                waitUntil(
                  fireWebhookEvent(agent.userId, "action.executed", params.id, {
                    conversationId,
                    action: fnCall.function.name,
                    input: toolInput,
                  }).catch((err) => {
                    console.error("Action executed webhook dispatch failed:", err);
                  })
                );
              }
            }
          }
          // ===== Anthropic-Pfad =====
          else if (anthropicClient) {
          let currentMessages = claudeMessages;
          let maxToolRounds = 5;

          while (maxToolRounds-- > 0) {
            const requestParams: Anthropic.MessageCreateParams = {
              model: selectedModel,
              max_tokens: 2048,
              system: systemPrompt,
              messages: currentMessages,
            };

            if (tools.length > 0) {
              requestParams.tools = tools;
            }

            const response = await anthropicClient.messages.create(requestParams);

            // Token-Tracking
            if (response.usage) {
              debugInputTokens += response.usage.input_tokens;
              debugOutputTokens += response.usage.output_tokens;
            }

            let hasToolUse = false;
            const toolResults: Anthropic.ToolResultBlockParam[] = [];

            for (const block of response.content) {
              if (block.type === "text" && block.text) {
                fullAssistantText += block.text;
                const chunk = `data: ${JSON.stringify({ text: block.text })}\n\n`;
                controller.enqueue(encoder.encode(chunk));
              } else if (block.type === "tool_use") {
                hasToolUse = true;

                // Track welche Actions benutzt wurden
                const actionType = block.name === "book_appointment"
                  ? "BOOK_APPOINTMENT"
                  : block.name === "collect_email"
                  ? "COLLECT_EMAIL"
                  : block.name === "score_lead"
                  ? "SCORE_LEAD"
                  : block.name === "custom_code"
                  ? "CUSTOM_CODE"
                  : block.name === "http_request"
                  ? "HTTP_REQUEST"
                  : block.name.startsWith("custom_tool_")
                  ? `CUSTOM_TOOL:${block.name.replace("custom_tool_", "")}`
                  : block.name.toUpperCase();
                if (!actionsUsed.includes(actionType)) {
                  actionsUsed.push(actionType);
                }

                const result = await executeChatTool(
                  block.name,
                  block.input as Record<string, unknown>,
                  params.id,
                  agent.actions,
                  agent.customTools,
                  {
                    userId: agent.userId,
                    conversationId,
                    visitorName: conversation.visitorName,
                    visitorEmail: conversation.visitorEmail,
                    agentName: agent.name,
                  }
                );
                const parsedToolResult = parseToolResult(result);

                debugToolCalls.push({
                  name: block.name,
                  input: block.input as Record<string, unknown>,
                  result,
                });

                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: result,
                });

                // Lead-Score auf Conversation speichern
                if (block.name === "score_lead") {
                  const input = block.input as Record<string, unknown>;
                  const score = Math.min(10, Math.max(1, Number(input.score) || 5));
                  await prisma.conversation.update({
                    where: { id: conversationId },
                    data: {
                      leadScore: score,
                      visitorEmail: (input.email as string) || undefined,
                    },
                  });
                  waitUntil(
                    fireWebhookEvent(agent.userId, "lead.scored", params.id, {
                      conversationId,
                      score,
                      email: input.email || null,
                    }).catch((err) => {
                      console.error("Lead scored webhook dispatch failed:", err);
                    })
                  );
                }

                // E-Mail auf Conversation speichern
                if (block.name === "collect_email") {
                  const input = block.input as Record<string, unknown>;
                  await prisma.conversation.update({
                    where: { id: conversationId },
                    data: {
                      visitorEmail: (input.email as string) || undefined,
                      visitorName: (input.name as string) || undefined,
                    },
                  });
                  waitUntil(
                    emitEvent("lead.captured", agent.userId, params.id, {
                      conversationId,
                      email: input.email || null,
                      name: input.name || null,
                    })
                  );
                  waitUntil(
                    triggerLeadWorkflows(params.id, agent.userId, {
                      conversationId,
                      email: (input.email as string) || null,
                      name: (input.name as string) || null,
                    })
                  );
                  // Export lead to Notion (if configured)
                  waitUntil(
                    exportLeadToNotion(params.id, agent.userId, {
                      email: (input.email as string) || "",
                      name: (input.name as string) || undefined,
                      conversationId,
                    })
                  );
                  waitUntil(
                    syncLeadToHubSpot({
                      agentId: params.id,
                      email: (input.email as string) || "",
                      name: (input.name as string) || undefined,
                      conversationId,
                    })
                  );
                  // Link email to visitor memory
                  if (activeVisitorId && input.email) {
                    waitUntil(
                      linkEmailToVisitor(params.id, activeVisitorId, input.email as string, input.name as string | null).catch(() => {})
                    );
                  }
                }
                if (block.name === "book_appointment" && parsedToolResult?.action === "booked") {
                  const input = block.input as Record<string, unknown>;
                  waitUntil(
                    emitEvent("appointment.booked", agent.userId, params.id, {
                      conversationId,
                      input: block.input,
                      eventId: parsedToolResult.eventId || null,
                      start: parsedToolResult.start || null,
                      end: parsedToolResult.end || null,
                      attendeeEmail: parsedToolResult.attendeeEmail || null,
                    })
                  );
                  waitUntil(
                    syncAppointmentDealToHubSpot({
                      agentId: params.id,
                      email:
                        (parsedToolResult.attendeeEmail as string) ||
                        (input.attendeeEmail as string) ||
                        "",
                      name:
                        (parsedToolResult.attendeeName as string) ||
                        (input.attendeeName as string) ||
                        undefined,
                      conversationId,
                      start:
                        (parsedToolResult.start as string) ||
                        (input.slotStart as string) ||
                        null,
                      reason: (input.reason as string) || null,
                    })
                  );
                }
                if (block.name === "handoff_human") {
                  const input = block.input as Record<string, unknown>;
                  await prisma.conversation.update({
                    where: { id: conversationId },
                    data: { handoffStatus: "REQUESTED" },
                  });
                  const recentMsgs = await prisma.message.findMany({
                    where: { conversationId },
                    orderBy: { createdAt: "desc" },
                    take: 5,
                    select: { role: true, content: true },
                  });
                  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com";
                  const convUrl = `${appUrl}/dashboard/agents/${params.id}?tab=logs`;
                  waitUntil(
                    sendHandoffEmail(
                      agent.userId,
                      agent.name,
                      (input.reason as string) || "No reason provided",
                      recentMsgs.reverse().map((m) => ({ role: m.role, content: m.content })),
                      { name: conversation.visitorName, email: conversation.visitorEmail },
                      convUrl
                    ).catch((err) => {
                      console.error("Handoff email failed:", err);
                    })
                  );
                }

                // Agent handoff: after tool result, get response from target agent
                if (block.name === "handoff_agent" && parsedToolResult?.handoff && parsedToolResult.targetAgentId) {
                  const targetId = parsedToolResult.targetAgentId as string;
                  const handoffSummary = (parsedToolResult.summary as string) || "";
                  const handoffReason = (parsedToolResult.reason as string) || "";

                  // Load target agent with full config
                  const targetAgent = await prisma.agent.findUnique({
                    where: { id: targetId },
                    include: {
                      knowledgeBases: { where: { embeddingStatus: "READY" } },
                      actions: true,
                      customTools: { where: { enabled: true } },
                    },
                  });

                  if (targetAgent) {
                    // Build target system prompt
                    const hNow = new Date();
                    let targetPrompt = targetAgent.systemPrompt
                      .replace(/\{\{agent\.name\}\}/g, targetAgent.name)
                      .replace(/\{\{current\.time\}\}/g, hNow.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }))
                      .replace(/\{\{current\.date\}\}/g, hNow.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }))
                      .replace(/\{\{user\.name\}\}/g, conversation.visitorName || "Unknown")
                      .replace(/\{\{user\.email\}\}/g, conversation.visitorEmail || "Unknown")
                      .replace(/\{\{knowledge\.context\}\}/g, "");

                    // RAG for target agent
                    if (targetAgent.knowledgeBases.length > 0) {
                      try {
                        const lastUserText = [...messages].reverse().find((m: { role: string }) => m.role === "user");
                        if (lastUserText) {
                          const targetRagChunks = await searchRelevantChunks(targetId, extractTextContent(lastUserText.content), 5);
                          if (targetRagChunks.length > 0) {
                            targetPrompt += "\n\n---\nRELEVANT KNOWLEDGE FROM THE KNOWLEDGE BASE:\n" +
                              targetRagChunks.map((c: { content: string }, i: number) => `[${i + 1}] ${c.content}`).join("\n\n") +
                              "\n---\nUse the above knowledge to answer the question.";
                          }
                        }
                      } catch { /* continue without RAG */ }
                    }

                    // Add handoff context
                    targetPrompt += `\n\nIMPORTANT: This conversation was seamlessly handed off to you from another agent. The user does not know about the handoff. Continue the conversation naturally without mentioning any transfer or handoff. Conversation summary: ${handoffSummary}. Reason for handoff: ${handoffReason}`;

                    // Get response from target agent
                    const targetClient = anthropicClient || getClaudeClient();
                    const targetModel = targetAgent.llmModel || "claude-sonnet-4-6";

                    const handoffResponse = await targetClient.messages.create({
                      model: targetModel.startsWith("claude") ? targetModel : "claude-sonnet-4-6",
                      max_tokens: 2048,
                      system: targetPrompt,
                      messages: currentMessages,
                    });

                    for (const hBlock of handoffResponse.content) {
                      if (hBlock.type === "text" && hBlock.text) {
                        fullAssistantText += hBlock.text;
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: hBlock.text })}\n\n`));
                      }
                    }

                    // Signal handoff in stream metadata
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ handoff: { from: agent.name, to: targetAgent.name } })}\n\n`));

                    // Skip further tool processing — handoff agent has responded
                    hasToolUse = false;
                  }
                }

                // Webhook: action.executed
                waitUntil(
                  fireWebhookEvent(agent.userId, "action.executed", params.id, {
                    conversationId,
                    action: block.name,
                    input: block.input,
                  }).catch((err) => {
                    console.error("Action executed webhook dispatch failed:", err);
                  })
                );
              }
            }

            if (!hasToolUse) break;

            currentMessages = [
              ...currentMessages,
              { role: "assistant", content: response.content },
              { role: "user", content: toolResults },
            ];
          }
          }

          // Assistant-Antwort speichern
          if (fullAssistantText) {
            await prisma.message.create({
              data: {
                conversationId,
                role: "ASSISTANT",
                content: fullAssistantText,
              },
            });
          }

          // Deduct AI credits (skip if BYOK) — inline to capture result for SSE
          let creditResult: { newBalance: number; creditsLow?: boolean; totalCredits?: number } | null = null;
          if (!creditCheck.byokActive && creditCheck.cost > 0) {
            try {
              creditResult = await deductCredits(agent.userId, selectedModel, "CHAT", params.id, conversationId);
              if (creditResult.creditsLow) {
                waitUntil(
                  emitEvent("credits.low", agent.userId, params.id, {
                    balance: creditResult.newBalance,
                    total: creditResult.totalCredits,
                    percentRemaining: creditResult.totalCredits ? Math.round((creditResult.newBalance / creditResult.totalCredits) * 100) : 0,
                  })
                );
              }
            } catch (err) {
              Sentry.captureException(err, { tags: { component: "credit-deduction", agentId: params.id }, extra: { userId: agent.userId, model: selectedModel } });
            }
          }

          // Conversation-Metadaten aktualisieren
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { actionsUsed },
          });

          // Webhook: conversation.ended
          waitUntil(
            fireWebhookEvent(agent.userId, "conversation.ended", params.id, {
              conversationId,
              sessionId,
              actionsUsed,
              responseLength: fullAssistantText.length,
            }).catch((err) => {
              console.error("Conversation ended webhook dispatch failed:", err);
            })
          );
          waitUntil(
            emitEvent("conversation.completed", agent.userId, params.id, {
              conversationId,
              sessionId,
              actionsUsed,
              responseLength: fullAssistantText.length,
            })
          );
          waitUntil(
            logConversationToHubSpot({
              agentId: params.id,
              conversationId,
            })
          );

          // Orchestration: Check handoff rules after response (Anthropic only)
          if (fullAssistantText && anthropicClient && isAnthropic) {
            const lastMsg = messages.filter((m: { role: string }) => m.role === "user").pop();
            const lastUserText = lastMsg ? extractTextContent(lastMsg.content) : "";

            // Get current lead score from conversation
            const convData = await prisma.conversation.findUnique({
              where: { id: conversationId },
              select: { leadScore: true },
            });

            const handoff = await evaluateOrchestrationHandoff(
              params.id,
              conversationId,
              lastUserText,
              fullAssistantText,
              convData?.leadScore ?? null,
              anthropicClient,
              selectedModel.startsWith("claude") ? selectedModel : "claude-sonnet-4-6",
              agent.userId,
            );

            if (handoff.handedOff && handoff.targetResponse) {
              // Stream the target agent's response seamlessly
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: "\n\n" + handoff.targetResponse })}\n\n`)
              );
            }
          }

          // Persistent Memory: Nach 3+ Nachrichten Fakten extrahieren (Anthropic only)
          if (agent.memoryEnabled && claudeMessages.length >= 3 && anthropicClient && isAnthropic) {
            const allMessages = claudeMessages
              .filter((m) => typeof m.content === "string")
              .map((m) => ({ role: m.role as string, content: m.content as string }));

            waitUntil(
              extractAndSaveMemories(
                params.id,
                sessionHash,
                allMessages,
                anthropicClient,
                selectedModel.startsWith("claude") ? selectedModel : "claude-sonnet-4-6"
              ).catch((err) => {
                console.error("Memory extraction failed:", err);
              })
            );
          }

          // Visitor Memory: LLM-basierte Profil-Aktualisierung (Anthropic only)
          if (agent.visitorMemoryEnabled && activeVisitorId && claudeMessages.length >= 2 && anthropicClient && isAnthropic) {
            const allMsgs = claudeMessages
              .filter((m) => typeof m.content === "string")
              .map((m) => ({ role: m.role as string, content: m.content as string }));

            waitUntil(
              updateVisitorMemory(
                params.id,
                activeVisitorId,
                allMsgs,
                anthropicClient,
                selectedModel.startsWith("claude") ? selectedModel : "claude-sonnet-4-6"
              ).catch((err) => {
                console.error("Visitor memory update failed:", err);
              })
            );
          }

          // Enterprise Memory: Business Insights extrahieren (Anthropic only)
          if (agent.enableEnterpriseMemory && claudeMessages.length >= 2 && anthropicClient && isAnthropic) {
            const convMsgs = claudeMessages
              .filter((m) => typeof m.content === "string")
              .map((m) => ({ role: m.role as string, content: m.content as string }));

            waitUntil(
              extractInsights(
                convMsgs,
                anthropicClient,
                "claude-haiku-4-5-20251001"
              ).then((result) => {
                if (result.insights.length > 0 || result.competitors.length > 0) {
                  return recordInsights(agent.userId, params.id, result);
                }
              }).catch((err) => {
                console.error("Enterprise insight extraction failed:", err);
              })
            );
          }

          // Vision V1.0: Image-to-Action Pipeline, Product Match, Document Extraction
          if (hasImages && fullAssistantText && isAnthropic) {
            // 1. Document extraction (OCR)
            waitUntil(
              (async () => {
                try {
                  const docData = await extractDocumentData(fullAssistantText);
                  if (docData) {
                    // Store extracted document data on the message
                    const lastAssistantMsg = await prisma.message.findFirst({
                      where: { conversationId, role: "ASSISTANT" },
                      orderBy: { createdAt: "desc" },
                      select: { id: true },
                    });
                    if (lastAssistantMsg) {
                      await prisma.message.update({
                        where: { id: lastAssistantMsg.id },
                        data: { extractedData: JSON.parse(JSON.stringify(docData)) },
                      });
                    }

                    // Update conversation with extracted documents
                    const conv = await prisma.conversation.findUnique({
                      where: { id: conversationId },
                      select: { extractedDocuments: true },
                    });
                    const existing = (conv?.extractedDocuments as unknown[] || []) as Record<string, unknown>[];
                    existing.push(docData as unknown as Record<string, unknown>);
                    await prisma.conversation.update({
                      where: { id: conversationId },
                      data: { extractedDocuments: JSON.parse(JSON.stringify(existing)) },
                    });

                    // Stream document extraction info to client
                    const docSummary = Object.entries(docData.fields)
                      .filter(([, v]) => v !== null)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(", ");
                    if (docSummary) {
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({
                          extractedDocument: {
                            type: docData.documentType,
                            fields: docData.fields,
                            summary: docSummary,
                          },
                        })}\n\n`)
                      );
                    }
                  }
                } catch (err) {
                  console.error("Document extraction failed:", err);
                }
              })()
            );

            // 2. Product match via KB
            if (agent.knowledgeBases.length > 0) {
              waitUntil(
                matchProductFromImage(params.id, fullAssistantText)
                  .then((matches) => {
                    if (matches.length > 0) {
                      const productText = matches
                        .map((m) => `• ${m.name} (${Math.round(m.similarity * 100)}% match)`)
                        .join("\n");
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({
                          text: `\n\n📦 **Ähnliche Produkte gefunden:**\n${productText}`,
                        })}\n\n`)
                      );
                    }
                  })
                  .catch((err) => {
                    console.error("Product match failed:", err);
                  })
              );
            }

            // 3. Auto-action trigger
            if (agent.imageAutoActions) {
              const actionNames = agent.actions
                .filter((a: { enabled: boolean }) => a.enabled)
                .map((a: { type: string }) => a.type);

              waitUntil(
                detectImageAction(fullAssistantText, actionNames)
                  .then(async (actionResult) => {
                    if (actionResult?.triggerAction && actionResult.action) {
                      console.log(
                        `[ImageAction] Auto-triggered: ${actionResult.action} (${actionResult.priority}) — ${actionResult.reason}`
                      );

                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({
                          imageAction: {
                            action: actionResult.action,
                            reason: actionResult.reason,
                            priority: actionResult.priority,
                          },
                        })}\n\n`)
                      );

                      // Update actionsUsed
                      if (!actionsUsed.includes(actionResult.action)) {
                        actionsUsed.push(actionResult.action);
                        await prisma.conversation.update({
                          where: { id: conversationId },
                          data: { actionsUsed },
                        });
                      }
                    }
                  })
                  .catch((err) => {
                    console.error("Image action detection failed:", err);
                  })
              );
            }

            // 4. Multi-image: detect before/after
            const imageCount = await prisma.message.count({
              where: { conversationId, imageUrl: { not: null } },
            });
            if (imageCount >= 2) {
              waitUntil(
                prisma.conversation.update({
                  where: { id: conversationId },
                  data: { imageComparisonMode: "before_after" },
                }).catch(() => {})
              );
            }
          }

          // Agentic RAG: detect knowledge gaps and research answers
          if (agent.enableAgenticRag && fullAssistantText) {
            const lastUserMsg = messages.filter((m: { role: string }) => m.role === "user").pop();
            const lastUserText = lastUserMsg ? extractTextContent(lastUserMsg.content) : "";
            if (lastUserText) {
              const gap = detectKnowledgeGap(lastUserText, fullAssistantText);
              if (gap.isGap) {
                waitUntil(
                  researchAndLearn(params.id, gap).catch((err) => {
                    console.error("Agentic RAG research failed:", err);
                  })
                );
              }
            }
          }

          // Session-ID an Client senden
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ sessionId })}\n\n`)
          );

          // Debug-Info senden (nur wenn angefragt)
          if (debug) {
            const debugInfo = {
              debug: {
                ragChunks: ragChunks.map((c) => ({
                  content: c.content.slice(0, 200) + (c.content.length > 200 ? "..." : ""),
                  similarity: Math.round(c.similarity * 1000) / 1000,
                })),
                toolsEvaluated: tools.map((t) => t.name),
                toolCalls: debugToolCalls,
                systemPrompt: systemPrompt.slice(0, 500) + (systemPrompt.length > 500 ? "..." : ""),
                systemPromptLength: systemPrompt.length,
                tokens: {
                  input: debugInputTokens,
                  output: debugOutputTokens,
                  total: debugInputTokens + debugOutputTokens,
                },
                model: agent.llmModel || "claude-sonnet-4-6",
              },
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(debugInfo)}\n\n`)
            );
          }

          // Emit intent routing event if applicable
          if (intentRoutingEvent) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ intentRouting: intentRoutingEvent })}\n\n`
              )
            );
          }

          // Credit usage info — sent before [DONE] so the client can display it
          if (creditResult) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  credits: {
                    creditsUsed: creditCheck.cost,
                    creditsRemaining: creditResult.newBalance,
                  },
                })}\n\n`
              )
            );
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          Sentry.captureException(err, {
            tags: { component: "chat-stream", agentId: params.id },
            extra: { model: selectedModel, provider: modelProvider },
          });
          // Auch bei Fehler: Teil-Antwort speichern
          if (fullAssistantText) {
            await prisma.message.create({
              data: {
                conversationId,
                role: "ASSISTANT",
                content: fullAssistantText,
              },
            }).catch(() => {});
          }

          const errorMessage =
            err instanceof Error ? err.message : "Stream error";
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: errorMessage })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: "chat-endpoint", agentId: params.id },
    });
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json(
      { error: message },
      { status: 500, headers: corsHeaders }
    );
  }
}
