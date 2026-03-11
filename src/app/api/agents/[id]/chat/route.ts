import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getClaudeClient } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { searchRelevantChunks } from "@/lib/rag";
import { canChat } from "@/lib/plan-limits";

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

// Live chat with agent (Streaming + RAG + Tool Use)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { messages } = body;

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

    // RAG: Search for relevant knowledge base chunks
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
            "\n\n---\nRELEVANT KNOWLEDGE FROM THE KNOWLEDGE BASE:\n" +
            relevantChunks
              .map((c, i) => `[${i + 1}] ${c.content}`)
              .join("\n\n") +
            "\n---\nUse the above knowledge to answer the question. If the knowledge is not relevant, answer from your general knowledge. Do not make up information.";
        }
      } catch {
        // RAG search failed — continue without context
      }
    }

    const systemPrompt = agent.systemPrompt + knowledgeContext;
    const tools = buildTools(agent.actions);
    const client = getClaudeClient();

    // Prepare messages for Claude
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
          let maxToolRounds = 5; // Prevent infinite loops

          while (maxToolRounds-- > 0) {
            // Claude API call (with or without tools)
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
                // Stream text
                const chunk = `data: ${JSON.stringify({ text: block.text })}\n\n`;
                controller.enqueue(encoder.encode(chunk));
              } else if (block.type === "tool_use") {
                hasToolUse = true;

                // Execute tool
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
              // No more tool calls — done
              break;
            }

            // Append tool results to messages for next round
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
