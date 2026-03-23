import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { getClaudeClient, getClaudeClientWithKey } from "@/lib/ai";
import { decrypt } from "@/lib/encryption";
import { searchRelevantChunks } from "@/lib/rag";
import type { A2AMessage, A2AResponse } from "@/lib/a2a-protocol";
import {
  buildContextPrompt,
  buildConversationMessages,
  checkA2ARateLimit,
  updateAgentA2AStats,
} from "@/lib/a2a-protocol";
import { checkA2ACredits, deductA2ACredits } from "@/lib/a2a-billing";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/**
 * POST /api/a2a/agents/[id]/message
 * Empfängt eine A2A-Nachricht. Auth via A2A API Key.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const startTime = Date.now();

  try {
    const agent = await prisma.agent.findUnique({
      where: { id: params.id },
      include: {
        knowledgeBases: { where: { embeddingStatus: "READY" } },
      },
    });

    if (!agent || agent.status !== "LIVE" || !agent.a2aEnabled) {
      return Response.json(
        { error: "Agent not found or A2A not enabled" },
        { status: 404, headers: corsHeaders }
      );
    }

    // Secure Authentication — A2A API Key
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (agent.a2aApiKey) {
      // Agent hat einen A2A Key → muss validiert werden
      if (!token || token !== agent.a2aApiKey) {
        return Response.json(
          { error: "Invalid or missing A2A API key" },
          { status: 401, headers: corsHeaders }
        );
      }
    } else if (token) {
      // Fallback: Legacy API Key Auth
      const keyRecord = await prisma.apiAccessKey.findFirst({
        where: { userId: agent.userId },
      });
      if (!keyRecord) {
        return Response.json(
          { error: "Invalid API key" },
          { status: 401, headers: corsHeaders }
        );
      }
    }

    // Rate Limiting
    const sourceIp = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    if (!checkA2ARateLimit(sourceIp)) {
      return Response.json(
        { error: "Rate limit exceeded (100 calls/hour)" },
        { status: 429, headers: corsHeaders }
      );
    }

    const body = await request.json() as A2AMessage;
    const { task, context, conversationId, replyTo, callerUserId } = body;

    if (!task || typeof task !== "string") {
      return Response.json(
        { error: "Missing 'task' field in request body" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Billing — Credit Check
    const creditCost = agent.a2aCreditCost || 1;
    if (callerUserId) {
      const billing = await checkA2ACredits(callerUserId, creditCost);
      if (!billing.allowed) {
        return Response.json(
          {
            error: "insufficient_credits",
            required: billing.required,
            available: billing.available,
          },
          { status: 402, headers: corsHeaders }
        );
      }
    }

    // RAG-Kontext laden
    let knowledgeContext = "";
    if (agent.knowledgeBases.length > 0) {
      try {
        const ragChunks = await searchRelevantChunks(params.id, task, 3);
        if (ragChunks.length > 0) {
          knowledgeContext =
            "\n\n---\nRELEVANT KNOWLEDGE:\n" +
            ragChunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n") +
            "\n---\n";
        }
      } catch { /* RAG-Fehler ignorieren */ }
    }

    // System Prompt bauen
    let systemPrompt = agent.systemPrompt + knowledgeContext;
    systemPrompt += "\n\nIMPORTANT: This message comes from another AI agent via the A2A (Agent-to-Agent) protocol. Respond concisely and professionally. Focus on completing the requested task.";

    // Full Context Passing
    if (context) {
      systemPrompt += buildContextPrompt(context);
    }

    // LLM Client + Model Selection
    let apiKey: string | null = null;
    try {
      const keyRecord = await prisma.apiKey.findUnique({
        where: { userId_provider: { userId: agent.userId, provider: "anthropic" } },
      });
      if (keyRecord) apiKey = decrypt(keyRecord.encryptedKey);
    } catch { /* KILN Key verwenden */ }

    const client = apiKey ? getClaudeClientWithKey(apiKey) : getClaudeClient();

    // Urgent priority → schnellstes Modell
    let selectedModel = agent.llmModel || "claude-sonnet-4-6";
    if (context?.priority === "urgent") {
      selectedModel = "claude-haiku-4-5-20251001";
    }

    // Conversation messages mit History
    const messages = context
      ? buildConversationMessages(context, task)
      : [{ role: "user" as const, content: task }];

    const response = await client.messages.create({
      model: selectedModel.startsWith("claude") ? selectedModel : "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    });

    const responseText = response.content
      .filter((b) => b.type === "text")
      .map((b) => {
        if (b.type === "text") return b.text;
        return "";
      })
      .join("");

    const durationMs = Date.now() - startTime;

    // Billing — Credits abziehen
    if (callerUserId) {
      waitUntil(
        deductA2ACredits(callerUserId, params.id, creditCost, sourceIp, replyTo).catch(
          (err) => console.error("A2A billing failed:", err)
        )
      );
    }

    // Stats aktualisieren
    waitUntil(
      updateAgentA2AStats(params.id, durationMs).catch(
        (err) => console.error("A2A stats update failed:", err)
      )
    );

    // A2A Interaction loggen
    waitUntil(
      prisma.a2AInteractionLog.create({
        data: {
          agentId: params.id,
          direction: "inbound",
          remoteAgentUrl: replyTo || request.headers.get("origin") || "unknown",
          remoteAgentName: context?.sourceAgent?.name || null,
          requestMessage: task,
          responseMessage: responseText,
          statusCode: 200,
          durationMs,
        },
      }).catch((err) => console.error("A2A log failed:", err))
    );

    // Confidence-Score: basierend auf Antwortlänge und Stop-Reason
    const confidence = responseText.length > 50 ? 0.85 : 0.6;

    const a2aResponse: A2AResponse = {
      status: "completed",
      response: responseText,
      metadata: {
        model: selectedModel,
        durationMs,
        agentName: agent.name,
        conversationId: conversationId || null,
        suggestedFollowUps: extractFollowUps(responseText),
        confidence,
        creditsConsumed: creditCost,
      },
    };

    return Response.json(a2aResponse, { headers: corsHeaders });
  } catch (error) {
    console.error("A2A message error:", error);
    const a2aResponse: A2AResponse = {
      status: "failed",
      response: "Internal error processing A2A message",
    };
    return Response.json(a2aResponse, { status: 500, headers: corsHeaders });
  }
}

/**
 * Extrahiert potenzielle Follow-Up Fragen aus der Antwort.
 */
function extractFollowUps(text: string): string[] {
  const questions = text.match(/[^.!?\n]*\?/g);
  if (!questions) return [];
  return questions
    .map((q) => q.trim())
    .filter((q) => q.length > 10 && q.length < 150)
    .slice(0, 3);
}
