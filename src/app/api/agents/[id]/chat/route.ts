import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getClaudeClient } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { searchRelevantChunks } from "@/lib/rag";

// Tool-Definitionen basierend auf aktivierten Actions
function buildTools(
  actions: { type: string; enabled: boolean; config: unknown }[]
): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = [];

  for (const action of actions) {
    if (!action.enabled) continue;
    const config = (action.config || {}) as Record<string, string>;

    switch (action.type) {
      case "BOOK_APPOINTMENT":
        if (config.calendlyUrl) {
          tools.push({
            name: "book_appointment",
            description:
              "Nutze dieses Tool wenn der Nutzer einen Termin buchen möchte, ein Beratungsgespräch will, oder nach verfügbaren Zeiten fragt. Zeige dem Nutzer den Buchungslink.",
            input_schema: {
              type: "object" as const,
              properties: {
                reason: {
                  type: "string",
                  description: "Grund für den Termin",
                },
              },
              required: ["reason"],
            },
          });
        }
        break;

      case "COLLECT_EMAIL":
        tools.push({
          name: "collect_email",
          description:
            "Nutze dieses Tool wenn der Nutzer Interesse zeigt, mehr Informationen möchte, oder seine E-Mail-Adresse teilt. Frage höflich nach der E-Mail wenn sie nicht gegeben wurde.",
          input_schema: {
            type: "object" as const,
            properties: {
              email: {
                type: "string",
                description: "Die E-Mail-Adresse des Nutzers",
              },
              name: {
                type: "string",
                description: "Name des Nutzers (falls bekannt)",
              },
              context: {
                type: "string",
                description: "Woran der Nutzer interessiert ist",
              },
            },
            required: ["email"],
          },
        });
        break;

      case "SCORE_LEAD":
        tools.push({
          name: "score_lead",
          description:
            "Nutze dieses Tool am Ende eines Gesprächs oder wenn genug Informationen vorhanden sind um den Lead zu bewerten. Bewerte auf einer Skala von 1-10 basierend auf: Kaufinteresse, Budget-Signale, Dringlichkeit, Entscheidungsbefugnis.",
          input_schema: {
            type: "object" as const,
            properties: {
              score: {
                type: "number",
                description: "Lead-Score von 1 (kalt) bis 10 (kaufbereit)",
              },
              reasoning: {
                type: "string",
                description: "Begründung für den Score",
              },
              email: {
                type: "string",
                description: "E-Mail des Leads (falls bekannt)",
              },
            },
            required: ["score", "reasoning"],
          },
        });
        break;
    }
  }

  return tools;
}

// Tool-Aufrufe ausführen
async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  agentId: string,
  actions: { type: string; config: unknown }[]
): Promise<string> {
  switch (toolName) {
    case "book_appointment": {
      const config = (actions.find((a) => a.type === "BOOK_APPOINTMENT")
        ?.config || {}) as Record<string, string>;
      const url = config.calendlyUrl || "";
      return JSON.stringify({
        success: true,
        message: `Hier ist der Buchungslink: ${url}`,
        calendlyUrl: url,
        reason: toolInput.reason,
      });
    }

    case "collect_email": {
      const email = toolInput.email as string;
      if (!email || !email.includes("@")) {
        return JSON.stringify({
          success: false,
          message: "Keine gültige E-Mail-Adresse erhalten.",
        });
      }

      await prisma.lead.create({
        data: {
          agentId,
          email,
          name: (toolInput.name as string) || null,
          context: (toolInput.context as string) || null,
        },
      });

      return JSON.stringify({
        success: true,
        message: `E-Mail ${email} wurde gespeichert.`,
      });
    }

    case "score_lead": {
      const score = Math.min(10, Math.max(1, Number(toolInput.score) || 5));
      const email = (toolInput.email as string) || null;

      // Score in Lead speichern wenn E-Mail vorhanden
      if (email) {
        const existingLead = await prisma.lead.findFirst({
          where: { agentId, email },
          orderBy: { createdAt: "desc" },
        });

        if (existingLead) {
          await prisma.lead.update({
            where: { id: existingLead.id },
            data: { score },
          });
        } else {
          await prisma.lead.create({
            data: { agentId, email, score, context: toolInput.reasoning as string },
          });
        }
      }

      return JSON.stringify({
        success: true,
        score,
        reasoning: toolInput.reasoning,
      });
    }

    default:
      return JSON.stringify({ success: false, message: "Unbekanntes Tool" });
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// CORS Preflight
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

// Live-Chat mit Agent (Streaming + RAG + Tool Use)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      return Response.json(
        { error: "Nachrichten sind erforderlich." },
        { status: 400 }
      );
    }

    // Agent mit Actions laden
    const agent = await prisma.agent.findUnique({
      where: { id: params.id },
      include: {
        knowledgeBases: { where: { embeddingStatus: "READY" } },
        actions: true,
      },
    });

    if (!agent) {
      return Response.json({ error: "Agent nicht gefunden" }, { status: 404 });
    }

    // RAG: Relevante Knowledge Base Chunks suchen
    let knowledgeContext = "";
    const lastUserMessage = [...messages]
      .reverse()
      .find((m: { role: string }) => m.role === "user");

    if (agent.knowledgeBases.length > 0 && lastUserMessage) {
      try {
        const relevantChunks = await searchRelevantChunks(
          params.id,
          lastUserMessage.content,
          5
        );

        if (relevantChunks.length > 0) {
          knowledgeContext =
            "\n\n---\nRELEVANTES WISSEN AUS DER KNOWLEDGE BASE:\n" +
            relevantChunks
              .map((c, i) => `[${i + 1}] ${c.content}`)
              .join("\n\n") +
            "\n---\nNutze das obige Wissen um die Frage zu beantworten. Wenn das Wissen nicht relevant ist, antworte aus deinem allgemeinen Wissen. Erfinde keine Informationen.";
        }
      } catch {
        // RAG-Suche fehlgeschlagen — ohne Kontext weitermachen
      }
    }

    const systemPrompt = agent.systemPrompt + knowledgeContext;
    const tools = buildTools(agent.actions);
    const client = getClaudeClient();

    // Nachrichten für Claude aufbereiten
    const claudeMessages: Anthropic.MessageParam[] = messages.map(
      (m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })
    );

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          let currentMessages = claudeMessages;
          let maxToolRounds = 5; // Endlosschleifen verhindern

          while (maxToolRounds-- > 0) {
            // Claude API Call (mit oder ohne Tools)
            const requestParams: Anthropic.MessageCreateParams = {
              model: agent.llmModel || "claude-sonnet-4-20250514",
              max_tokens: 2048,
              system: systemPrompt,
              messages: currentMessages,
            };

            if (tools.length > 0) {
              requestParams.tools = tools;
            }

            const response = await client.messages.create(requestParams);

            let hasToolUse = false;
            const toolResults: Anthropic.ToolResultBlockParam[] = [];

            for (const block of response.content) {
              if (block.type === "text" && block.text) {
                // Text streamen
                const chunk = `data: ${JSON.stringify({ text: block.text })}\n\n`;
                controller.enqueue(encoder.encode(chunk));
              } else if (block.type === "tool_use") {
                hasToolUse = true;

                // Tool ausführen
                const result = await executeTool(
                  block.name,
                  block.input as Record<string, unknown>,
                  params.id,
                  agent.actions
                );

                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: result,
                });
              }
            }

            if (!hasToolUse) {
              // Keine Tool-Calls mehr — fertig
              break;
            }

            // Tool-Ergebnisse an Nachrichten anhängen für nächste Runde
            currentMessages = [
              ...currentMessages,
              { role: "assistant", content: response.content },
              { role: "user", content: toolResults },
            ];
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : "Stream-Fehler";
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
    const message = err instanceof Error ? err.message : "Server-Fehler";
    return Response.json(
      { error: message },
      { status: 500, headers: corsHeaders }
    );
  }
}
