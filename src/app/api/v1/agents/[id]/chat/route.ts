import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
  apiKeyAuthErrorResponse,
  apiKeyJson,
  authenticateApiKey,
  requireApiKeyScope,
  type ApiKeyAuthSuccess,
} from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClaudeClient, getClaudeClientWithKey, MODEL_PROVIDER_MAP } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { searchRelevantChunks } from "@/lib/rag";
import { decrypt } from "@/lib/encryption";
import { deductCredits } from "@/lib/credits";
import { AgentHealthMonitor } from "@/lib/monitoring/agent-health-monitor";
import crypto from "crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

// POST /api/v1/agents/[id]/chat — Synchrone Chat-Anfrage
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  let authResult: ApiKeyAuthSuccess | null = null;
  const startTime = Date.now();

  try {

    // API Key Auth
    const auth = await authenticateApiKey(request.headers.get("authorization"));
    if (!auth.ok) {
      return apiKeyAuthErrorResponse(auth, corsHeaders);
    }
    authResult = auth;
    waitUntil(authResult.touchLastUsed);

    const scopeError = requireApiKeyScope(request, authResult, "chat", corsHeaders);
    if (scopeError) {
      return scopeError;
    }

    // Rate Limiting
    const rateCheck = checkRateLimit(authResult.keyId);
    if (!rateCheck.allowed) {
      return apiKeyJson(
        request,
        authResult,
        { error: "Rate limit exceeded. 100 requests per minute." },
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "X-RateLimit-Remaining": "0",
            "Retry-After": String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)),
          },
        },
      );
    }

    const body = await request.json();
    const { message, sessionId: clientSessionId } = body;

    if (!message || typeof message !== "string") {
      return apiKeyJson(
        request,
        authResult,
        { error: "message (string) is required in the request body" },
        { status: 400, headers: corsHeaders },
      );
    }

    // Agent laden — muss dem User gehören
    const agent = await prisma.agent.findFirst({
      where: { id: params.id, userId: authResult.userId },
      include: {
        knowledgeBases: { where: { embeddingStatus: "READY" } },
        actions: true,
        customTools: { where: { enabled: true } },
      },
    });

    if (!agent) {
      return apiKeyJson(
        request,
        authResult,
        { error: "Agent not found or unauthorized" },
        { status: 404, headers: corsHeaders },
      );
    }

    // Session verwalten
    const sessionId = clientSessionId || crypto.randomUUID();
    let conversation = await prisma.conversation.findFirst({
      where: { agentId: params.id, sessionId },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { agentId: params.id, sessionId, channel: "SLACK" }, // API-Channel
      });
    }

    // User-Nachricht speichern
    await prisma.message.create({
      data: { conversationId: conversation.id, role: "USER", content: message },
    });

    // Bisherige Nachrichten laden für Kontext
    const existingMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    // RAG
    let knowledgeContext = "";
    if (agent.knowledgeBases.length > 0) {
      try {
        const chunks = await searchRelevantChunks(params.id, message, 5);
        if (chunks.length > 0) {
          knowledgeContext =
            "\n\n---\nRELEVANT KNOWLEDGE:\n" +
            chunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n") +
            "\n---\nUse the above knowledge to answer. Do not make up information.";
        }
      } catch {
        // RAG failed — weiter ohne
      }
    }

    // System Prompt aufbauen
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

    // BYOK Check
    const selectedModel = agent.llmModel || "claude-sonnet-4-6";
    const modelProvider = MODEL_PROVIDER_MAP[selectedModel] || "ANTHROPIC";
    let userApiKey: string | null = null;

    try {
      const apiKeyRecord = await prisma.apiKey.findUnique({
        where: { userId_provider: { userId: authResult.userId, provider: modelProvider.toLowerCase() } },
      });
      if (apiKeyRecord) {
        userApiKey = decrypt(apiKeyRecord.encryptedKey);
      }
    } catch {
      // Fallback zu KILN Key
    }

    // Messages für das LLM
    const llmMessages = existingMessages.map((m) => ({
      role: m.role === "USER" ? "user" as const : "assistant" as const,
      content: m.content,
    }));

    let responseText = "";
    const leadScore: number | null = conversation.leadScore;

    // ===== OpenAI =====
    if (modelProvider === "OPENAI") {
      const openai = new OpenAI({ apiKey: userApiKey || process.env.OPENAI_API_KEY });

      const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...llmMessages,
      ];

      const response = await openai.chat.completions.create({
        model: selectedModel,
        max_tokens: 2048,
        messages: openaiMessages,
      });

      responseText = response.choices[0]?.message?.content || "";
    }
    // ===== Anthropic =====
    else {
      const client = userApiKey
        ? getClaudeClientWithKey(userApiKey)
        : getClaudeClient();

      const claudeMessages: Anthropic.MessageParam[] = llmMessages;

      const response = await client.messages.create({
        model: selectedModel,
        max_tokens: 2048,
        system: systemPrompt,
        messages: claudeMessages,
      });

      for (const block of response.content) {
        if (block.type === "text") {
          responseText += block.text;
        }
      }
    }

    // Antwort speichern
    if (responseText) {
      await prisma.message.create({
        data: { conversationId: conversation.id, role: "ASSISTANT", content: responseText },
      });
      // Deduct credits (fire-and-forget)
      waitUntil(
        deductCredits(agent.userId, selectedModel, "CHAT", params.id, conversation.id).catch((err) => {
          console.error("Public API credit deduction failed:", err);
        })
      );
    }

    // Health recording (non-blocking)
    waitUntil(
      AgentHealthMonitor.recordExecution({
        agentId: params.id,
        executionType: "chat",
        success: true,
        durationMs: Date.now() - startTime,
      })
    );

    return apiKeyJson(
      request,
      authResult,
      {
        response: responseText,
        sessionId,
        leadScore,
        conversationId: conversation.id,
        model: selectedModel,
      },
      {
        headers: {
          ...corsHeaders,
          "X-RateLimit-Remaining": String(rateCheck.remaining),
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";

    // Health recording (non-blocking)
    waitUntil(
      AgentHealthMonitor.recordExecution({
        agentId: params.id,
        executionType: "chat",
        success: false,
        durationMs: Date.now() - startTime,
        errorType: err instanceof Error ? err.constructor.name : "UnknownError",
        errorMessage: message,
      })
    );

    if (authResult) {
      return apiKeyJson(request, authResult, { error: message }, { status: 500, headers: corsHeaders });
    }
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
