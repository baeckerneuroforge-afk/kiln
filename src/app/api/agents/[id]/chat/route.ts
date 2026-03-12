import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getClaudeClient, getClaudeClientWithKey, MODEL_PROVIDER_MAP } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { searchRelevantChunks } from "@/lib/rag";
import { canChat } from "@/lib/plan-limits";
import { decrypt } from "@/lib/encryption";
import crypto from "crypto";

// Textinhalt aus einer Nachricht extrahieren (string oder multimodales content-array)
function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((block: { type: string }) => block.type === "text")
      .map((block: { text: string }) => block.text)
      .join(" ");
  }
  return "";
}

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

// Custom Tool Definition Typ
interface CustomToolDef {
  id: string;
  name: string;
  description: string;
  method: string;
  url: string;
  headers: unknown;
  bodyTemplate: string | null;
  responseMapping: string | null;
}

// Tool definitions based on enabled actions + custom tools
function buildTools(
  actions: { type: string; enabled: boolean; config: unknown }[],
  customTools: CustomToolDef[] = []
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

      case "CUSTOM_CODE":
        if (config.code && config.description) {
          tools.push({
            name: "custom_code",
            description: config.description,
            input_schema: {
              type: "object" as const,
              properties: {
                user_message: {
                  type: "string",
                  description: "The relevant user message to process",
                },
              },
              required: ["user_message"],
            },
          });
        }
        break;
    }
  }

  // Custom HTTP Tools — dynamische Parameter aus URL/Body-Template extrahieren
  for (const ct of customTools) {
    // Platzhalter aus URL und Body extrahieren: {{variable}}
    const placeholders = new Set<string>();
    const regex = /\{\{(\w+)\}\}/g;
    let match;
    while ((match = regex.exec(ct.url)) !== null) placeholders.add(match[1]);
    if (ct.bodyTemplate) {
      regex.lastIndex = 0;
      while ((match = regex.exec(ct.bodyTemplate)) !== null) placeholders.add(match[1]);
    }

    const placeholderArr = Array.from(placeholders);
    const properties: Record<string, { type: string; description: string }> = {};
    for (const p of placeholderArr) {
      properties[p] = {
        type: "string",
        description: `Value for the ${p} parameter`,
      };
    }

    tools.push({
      name: `custom_tool_${ct.name}`,
      description: ct.description,
      input_schema: {
        type: "object" as const,
        properties,
        required: placeholderArr,
      },
    });
  }

  return tools;
}

// Einfacher JSON-Pfad-Accessor: "data.results[0].name" → Wert
function resolveJsonPath(obj: unknown, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// Execute tool calls
async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  agentId: string,
  actions: { type: string; config: unknown }[],
  customTools: CustomToolDef[] = []
): Promise<string> {
  // Custom HTTP Tool?
  if (toolName.startsWith("custom_tool_")) {
    const ctName = toolName.replace("custom_tool_", "");
    const ct = customTools.find((t) => t.name === ctName);
    if (!ct) return JSON.stringify({ success: false, message: "Custom tool not found" });

    try {
      // Platzhalter in URL und Body ersetzen
      let url = ct.url;
      let body = ct.bodyTemplate || "";
      for (const [key, value] of Object.entries(toolInput)) {
        const placeholder = `{{${key}}}`;
        url = url.replaceAll(placeholder, encodeURIComponent(String(value)));
        body = body.replaceAll(placeholder, String(value));
      }

      const fetchOptions: RequestInit = {
        method: ct.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...((ct.headers as Record<string, string>) || {}),
        },
      };

      if (body && ct.method !== "GET") {
        fetchOptions.body = body;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      fetchOptions.signal = controller.signal;

      const response = await fetch(url, fetchOptions);
      clearTimeout(timeout);

      const contentType = response.headers.get("content-type") || "";
      let responseData: unknown;
      if (contentType.includes("application/json")) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      // Response Mapping anwenden
      if (ct.responseMapping && responseData && typeof responseData === "object") {
        const mapped = resolveJsonPath(responseData, ct.responseMapping);
        if (mapped !== undefined) {
          return JSON.stringify({ success: true, result: mapped });
        }
      }

      return JSON.stringify({ success: true, status: response.status, data: responseData });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return JSON.stringify({ success: false, message: "HTTP request timed out (10s)" });
      }
      const errorMsg = err instanceof Error ? err.message : "HTTP request failed";
      return JSON.stringify({ success: false, message: errorMsg });
    }
  }

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

    case "custom_code": {
      const customAction = actions.find((a) => a.type === "CUSTOM_CODE");
      const config = (customAction?.config || {}) as Record<string, string>;
      if (!config.code) {
        return JSON.stringify({ success: false, message: "No custom code configured" });
      }

      try {
        // Conversation laden für History
        const conversations = await prisma.message.findMany({
          where: {
            conversation: { agentId },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        });

        const context = {
          userMessage: (toolInput.user_message as string) || "",
          conversationHistory: conversations.reverse().map((m) => ({
            role: m.role.toLowerCase(),
            content: m.content,
          })),
          agentName: (await prisma.agent.findUnique({ where: { id: agentId }, select: { name: true } }))?.name || "",
          leadScore: null as number | null,
          collectedEmail: null as string | null,
        };

        // Sandboxed execution via Function constructor mit Timeout
        const fn = new Function("context", `"use strict";\n${config.code}`);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Custom code execution timed out (5s)")), 5000)
        );
        const result = await Promise.race([
          Promise.resolve(fn(context)),
          timeoutPromise,
        ]);

        if (!result || typeof result.response !== "string") {
          return JSON.stringify({
            success: false,
            message: "Custom code did not return a valid { response: string } object",
          });
        }

        return JSON.stringify({
          success: true,
          response: result.response,
          data: result.data || null,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Custom code execution failed";
        return JSON.stringify({ success: false, message: errorMsg });
      }
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
    const modelProvider = MODEL_PROVIDER_MAP[selectedModel] || "anthropic";
    let userApiKey: string | null = null;
    let usingOwnKey = false;

    try {
      const apiKeyRecord = await prisma.apiKey.findUnique({
        where: { userId_provider: { userId: agent.userId, provider: modelProvider } },
      });
      if (apiKeyRecord) {
        userApiKey = decrypt(apiKeyRecord.encryptedKey);
        usingOwnKey = true;
      }
    } catch {
      // Key-Entschlüsselung fehlgeschlagen — KILN Key verwenden
    }

    // Check chat limit — bei eigenem Key: kein Limit
    if (!usingOwnKey) {
      const chatCheck = await canChat(agent.id);
      if (!chatCheck.allowed) {
        return Response.json(
          { error: `Monthly conversation limit reached (${chatCheck.current}/${chatCheck.limit}). The owner needs to upgrade their plan.` },
          { status: 429, headers: corsHeaders }
        );
      }
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

    const tools = buildTools(agent.actions, agent.customTools);

    // Client erstellen: BYOK oder KILN's Key
    const isOpenAI = modelProvider === "openai";
    const anthropicClient = isOpenAI ? null : (usingOwnKey && userApiKey ? getClaudeClientWithKey(userApiKey) : getClaudeClient());
    const openaiClient = isOpenAI ? new OpenAI({ apiKey: userApiKey || process.env.OPENAI_API_KEY }) : null;

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
          // ===== OpenAI-Pfad =====
          if (isOpenAI && openaiClient) {
            // OpenAI Tool-Definitionen konvertieren
            const openaiTools: OpenAI.ChatCompletionTool[] = tools.map((t) => ({
              type: "function" as const,
              function: {
                name: t.name,
                description: t.description,
                parameters: t.input_schema as Record<string, unknown>,
              },
            }));

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

              const response = await openaiClient.chat.completions.create(requestParams);
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
                // Nur function-type Tool-Calls verarbeiten
                if (tc.type !== "function") continue;
                const fnCall = tc as { id: string; type: "function"; function: { name: string; arguments: string } };
                const toolInput = JSON.parse(fnCall.function.arguments || "{}") as Record<string, unknown>;

                const actionType = fnCall.function.name === "book_appointment" ? "BOOK_APPOINTMENT"
                  : fnCall.function.name === "collect_email" ? "COLLECT_EMAIL"
                  : fnCall.function.name === "score_lead" ? "SCORE_LEAD"
                  : fnCall.function.name === "custom_code" ? "CUSTOM_CODE"
                  : fnCall.function.name.startsWith("custom_tool_") ? `CUSTOM_TOOL:${fnCall.function.name.replace("custom_tool_", "")}`
                  : fnCall.function.name.toUpperCase();
                if (!actionsUsed.includes(actionType)) actionsUsed.push(actionType);

                const result = await executeTool(fnCall.function.name, toolInput, params.id, agent.actions, agent.customTools);

                debugToolCalls.push({ name: fnCall.function.name, input: toolInput, result });

                openaiMessages.push({
                  role: "tool",
                  tool_call_id: fnCall.id,
                  content: result,
                });

                // Lead-Score / Email auf Conversation speichern
                if (fnCall.function.name === "score_lead") {
                  const score = Math.min(10, Math.max(1, Number(toolInput.score) || 5));
                  await prisma.conversation.update({
                    where: { id: conversationId },
                    data: { leadScore: score, visitorEmail: (toolInput.email as string) || undefined },
                  });
                }
                if (fnCall.function.name === "collect_email") {
                  await prisma.conversation.update({
                    where: { id: conversationId },
                    data: { visitorEmail: (toolInput.email as string) || undefined, visitorName: (toolInput.name as string) || undefined },
                  });
                }
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
                  : block.name.startsWith("custom_tool_")
                  ? `CUSTOM_TOOL:${block.name.replace("custom_tool_", "")}`
                  : block.name.toUpperCase();
                if (!actionsUsed.includes(actionType)) {
                  actionsUsed.push(actionType);
                }

                const result = await executeTool(
                  block.name,
                  block.input as Record<string, unknown>,
                  params.id,
                  agent.actions,
                  agent.customTools
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
          if (agent.memoryEnabled && claudeMessages.length >= 3 && anthropicClient) {
            const allMessages = claudeMessages
              .filter((m) => typeof m.content === "string")
              .map((m) => ({ role: m.role as string, content: m.content as string }));

            extractAndSaveMemories(
              params.id,
              sessionHash,
              allMessages,
              anthropicClient,
              selectedModel.startsWith("claude") ? selectedModel : "claude-sonnet-4-20250514"
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
