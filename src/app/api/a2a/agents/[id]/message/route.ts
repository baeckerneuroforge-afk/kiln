import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { getClaudeClient, getClaudeClientWithKey } from "@/lib/ai";
import { decrypt } from "@/lib/encryption";
import { searchRelevantChunks } from "@/lib/rag";
import type { A2AMessage, A2AResponse } from "@/lib/a2a-protocol";

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
 * Empfängt eine A2A-Nachricht von einem externen Agent.
 * Authentifizierung via Bearer Token (API Access Key).
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

    // API Key Authentifizierung
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (token) {
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

    const body = await request.json() as A2AMessage;
    const { task, context, conversationId, replyTo } = body;

    if (!task || typeof task !== "string") {
      return Response.json(
        { error: "Missing 'task' field in request body" },
        { status: 400, headers: corsHeaders }
      );
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

    if (context) {
      systemPrompt += `\n\nContext from the requesting agent:\n${JSON.stringify(context, null, 2)}`;
    }

    // LLM Client erstellen
    let apiKey: string | null = null;
    try {
      const keyRecord = await prisma.apiKey.findUnique({
        where: { userId_provider: { userId: agent.userId, provider: "anthropic" } },
      });
      if (keyRecord) apiKey = decrypt(keyRecord.encryptedKey);
    } catch { /* KILN Key verwenden */ }

    const client = apiKey ? getClaudeClientWithKey(apiKey) : getClaudeClient();
    const selectedModel = agent.llmModel || "claude-sonnet-4-20250514";

    const response = await client.messages.create({
      model: selectedModel.startsWith("claude") ? selectedModel : "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: task }],
    });

    const responseText = response.content
      .filter((b) => b.type === "text")
      .map((b) => {
        if (b.type === "text") return b.text;
        return "";
      })
      .join("");

    const durationMs = Date.now() - startTime;

    // A2A Interaction loggen
    waitUntil(
      prisma.a2AInteractionLog.create({
        data: {
          agentId: params.id,
          direction: "inbound",
          remoteAgentUrl: replyTo || request.headers.get("origin") || "unknown",
          remoteAgentName: (context as Record<string, unknown>)?.agentName as string || null,
          requestMessage: task,
          responseMessage: responseText,
          statusCode: 200,
          durationMs,
        },
      }).catch((err) => console.error("A2A log failed:", err))
    );

    const a2aResponse: A2AResponse = {
      status: "completed",
      response: responseText,
      metadata: {
        model: selectedModel,
        durationMs,
        agentName: agent.name,
        conversationId: conversationId || null,
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
