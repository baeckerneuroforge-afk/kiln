import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import * as Sentry from "@sentry/nextjs";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getClaudeClient, getClaudeClientWithKey, MODEL_PROVIDER_MAP, type ProviderKey } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { searchRelevantChunks } from "@/lib/rag";
import { checkCredits, deductCredits } from "@/lib/credits";
import { decrypt } from "@/lib/encryption";
import { fireWebhookEvent } from "@/lib/webhooks";
import { emitEvent } from "@/lib/events";
import { sendNewLeadEmail, sendHandoffEmail } from "@/lib/email-notifications";
import { exportLeadToNotion } from "@/lib/services/notion-lead-export";
import crypto from "crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { extractTextContent, hashSession, extractAndSaveMemories, evaluateOrchestrationHandoff } from "@/lib/services/chat-service";
import { buildTools, executeChatTool } from "@/lib/services/action-service";

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

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
    }

    const body = await request.json();
    const { messages, sessionId: clientSessionId, channel, debug } = body;

    if (!messages || !Array.isArray(messages)) {
      return Response.json(
        { error: "Messages are required." },
        { status: 400 }
      );
    }

    // Load agent with actions and custom tools
    const agent = await prisma.agent.findUnique({
      where: { id: params.id },
      include: {
        knowledgeBases: { where: { embeddingStatus: "READY" } },
        actions: true,
        customTools: { where: { enabled: true } },
      },
    });

    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    // BYOK: Prüfen ob der User einen eigenen Key für den gewählten Provider hat
    const selectedModel = agent.llmModel || "claude-sonnet-4-20250514";
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

    // Conversation-Persistenz: Session finden oder erstellen
    const sessionId = clientSessionId || crypto.randomUUID();
    let conversation = await prisma.conversation.findFirst({
      where: { agentId: params.id, sessionId },
    });

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

    // Letzte User-Nachricht speichern
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg && lastUserMsg.role === "user") {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "USER",
          content: extractTextContent(lastUserMsg.content),
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

    const tools = buildTools(agent.actions, agent.customTools);

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
            const geminiMessages = messages.map((m: { role: string; content: unknown }) => ({
              role: m.role === "user" ? "user" : "model",
              parts: [{ text: extractTextContent(m.content) }],
            }));

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
              ...messages.map((m: { role: string; content: unknown }) => ({
                role: m.role as "user" | "assistant",
                content: extractTextContent(m.content),
              })),
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
                  // Export lead to Notion (if configured)
                  waitUntil(
                    exportLeadToNotion(params.id, agent.userId, {
                      email: (toolInput.email as string) || "",
                      name: (toolInput.name as string) || undefined,
                      conversationId,
                    })
                  );
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
                  // Export lead to Notion (if configured)
                  waitUntil(
                    exportLeadToNotion(params.id, agent.userId, {
                      email: (input.email as string) || "",
                      name: (input.name as string) || undefined,
                      conversationId,
                    })
                  );
                }
                if (block.name === "book_appointment" && parsedToolResult?.action === "booked") {
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

          // Deduct AI credits (skip if BYOK)
          if (!creditCheck.byokActive && creditCheck.cost > 0) {
            waitUntil(
              deductCredits(agent.userId, selectedModel, "CHAT", params.id, conversationId).then((result) => {
                if (result.creditsLow) {
                  emitEvent("credits.low", agent.userId, params.id, {
                    balance: result.newBalance,
                    total: result.totalCredits,
                    percentRemaining: result.totalCredits ? Math.round((result.newBalance / result.totalCredits) * 100) : 0,
                  });
                }
              }).catch((err) => {
                Sentry.captureException(err, { tags: { component: "credit-deduction", agentId: params.id }, extra: { userId: agent.userId, model: selectedModel } });
              })
            );
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
              selectedModel.startsWith("claude") ? selectedModel : "claude-sonnet-4-20250514",
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
                selectedModel.startsWith("claude") ? selectedModel : "claude-sonnet-4-20250514"
              ).catch((err) => {
                console.error("Memory extraction failed:", err);
              })
            );
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
                model: agent.llmModel || "claude-sonnet-4-20250514",
              },
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(debugInfo)}\n\n`)
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
