import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getClaudeClient } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { searchRelevantChunks } from "@/lib/rag";
import { canChat } from "@/lib/plan-limits";
import crypto from "crypto";

// Stabiler Hash aus sessionId für Memory-Zuordnung
function hashSession(sessionId: string): string {
  return crypto.createHash("sha256").update(sessionId).digest("hex").slice(0, 32);
}

// Nach Conversation-Ende: Fakten extrahieren und als Memories speichern
async function extractAndSaveMemories(
  agentId: string,
  sessionHash: string,
  messages: { role: string; content: string }[],
  client: Anthropic,
  model: string
) {
  try {
    const transcript = messages
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const response = await client.messages.create({
      model: model || "claude-sonnet-4-20250514",
      max_tokens: 512,
      system: `You extract key facts about the user from a conversation. Return a JSON array of {key, value} pairs.
Keys should be short identifiers like: name, email, company, role, preference, interest, decision, question_topic, location, budget, timeline.
Only extract facts that are clearly stated or strongly implied. Do not guess.
If no meaningful facts can be extracted, return an empty array [].
Return ONLY the JSON array, no other text.`,
      messages: [
        {
          role: "user",
          content: `Extract key facts about the user from this conversation:\n\n${transcript}`,
        },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    // JSON aus der Antwort parsen
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const facts: { key: string; value: string }[] = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(facts) || facts.length === 0) return;

    // Upsert jede Memory
    for (const fact of facts) {
      if (!fact.key || !fact.value) continue;
      const key = fact.key.toLowerCase().replace(/\s+/g, "_").slice(0, 50);
      const value = String(fact.value).slice(0, 1000);

      await prisma.agentMemory.upsert({
        where: {
          agentId_sessionHash_key: { agentId, sessionHash, key },
        },
        update: { value },
        create: { agentId, sessionHash, key, value },
      });
    }
  } catch {
    // Memory-Extraktion fehlgeschlagen — kein Abbruch des Hauptflusses
  }
}

// Tool definitions based on enabled actions
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
              "Use this tool when the user wants to book an appointment, wants a consultation, or asks about available times. Show the user the booking link.",
            input_schema: {
              type: "object" as const,
              properties: {
                reason: {
                  type: "string",
                  description: "Reason for the appointment",
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
            "Use this tool when the user shows interest, wants more information, or shares their email address. Politely ask for the email if it was not provided.",
          input_schema: {
            type: "object" as const,
            properties: {
              email: {
                type: "string",
                description: "The user's email address",
              },
              name: {
                type: "string",
                description: "User's name (if known)",
              },
              context: {
                type: "string",
                description: "What the user is interested in",
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
            "Use this tool at the end of a conversation or when enough information is available to evaluate the lead. Rate on a scale of 1-10 based on: purchase interest, budget signals, urgency, decision-making authority.",
          input_schema: {
            type: "object" as const,
            properties: {
              score: {
                type: "number",
                description: "Lead score from 1 (cold) to 10 (ready to buy)",
              },
              reasoning: {
                type: "string",
                description: "Reasoning for the score",
              },
              email: {
                type: "string",
                description: "Lead's email (if known)",
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

// Execute tool calls
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
        message: `Here is the booking link: ${url}`,
        calendlyUrl: url,
        reason: toolInput.reason,
      });
    }

    case "collect_email": {
      const email = toolInput.email as string;
      if (!email || !email.includes("@")) {
        return JSON.stringify({
          success: false,
          message: "No valid email address received.",
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
        message: `Email ${email} has been saved.`,
      });
    }

    case "score_lead": {
      const score = Math.min(10, Math.max(1, Number(toolInput.score) || 5));
      const email = (toolInput.email as string) || null;

      // Save score to lead if email is available
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
      return JSON.stringify({ success: false, message: "Unknown tool" });
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

// Live chat with agent (Streaming + RAG + Tool Use + Persistence)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { messages, sessionId: clientSessionId, channel, debug } = body;

    if (!messages || !Array.isArray(messages)) {
      return Response.json(
        { error: "Messages are required." },
        { status: 400 }
      );
    }

    // Load agent with actions
    const agent = await prisma.agent.findUnique({
      where: { id: params.id },
      include: {
        knowledgeBases: { where: { embeddingStatus: "READY" } },
        actions: true,
      },
    });

    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    // Check chat limit
    const chatCheck = await canChat(agent.id);
    if (!chatCheck.allowed) {
      return Response.json(
        { error: `Monthly conversation limit reached (${chatCheck.current}/${chatCheck.limit}). The owner needs to upgrade their plan.` },
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
    }

    // Letzte User-Nachricht speichern
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg && lastUserMsg.role === "user") {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "USER",
          content: lastUserMsg.content,
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
          lastUserMessage.content,
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

    const tools = buildTools(agent.actions);
    const client = getClaudeClient();

    // Prepare messages for Claude
    const claudeMessages: Anthropic.MessageParam[] = messages.map(
      (m: { role: string; content: string }) => ({
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
          let currentMessages = claudeMessages;
          let maxToolRounds = 5;

          while (maxToolRounds-- > 0) {
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
                  : block.name.toUpperCase();
                if (!actionsUsed.includes(actionType)) {
                  actionsUsed.push(actionType);
                }

                const result = await executeTool(
                  block.name,
                  block.input as Record<string, unknown>,
                  params.id,
                  agent.actions
                );

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
                }
              }
            }

            if (!hasToolUse) break;

            currentMessages = [
              ...currentMessages,
              { role: "assistant", content: response.content },
              { role: "user", content: toolResults },
            ];
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

          // Conversation-Metadaten aktualisieren
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { actionsUsed },
          });

          // Persistent Memory: Nach 3+ Nachrichten Fakten extrahieren
          if (agent.memoryEnabled && currentMessages.length >= 3) {
            // Nicht-blockierend im Hintergrund ausführen
            const allMessages = currentMessages
              .filter((m) => typeof m.content === "string")
              .map((m) => ({ role: m.role as string, content: m.content as string }));

            extractAndSaveMemories(
              params.id,
              sessionHash,
              allMessages,
              client,
              agent.llmModel
            ).catch(() => {});
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
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json(
      { error: message },
      { status: 500, headers: corsHeaders }
    );
  }
}
