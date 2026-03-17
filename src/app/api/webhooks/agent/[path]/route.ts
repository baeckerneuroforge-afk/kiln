import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { searchRelevantChunks } from "@/lib/rag";
import { getClaudeClient, getClaudeClientWithKey, MODEL_PROVIDER_MAP } from "@/lib/ai";
import { decrypt } from "@/lib/encryption";
import { deductCredits } from "@/lib/credits";
import { syncLeadToAirtableIfConfigured } from "@/lib/integrations/airtable";
import { validateUrl } from "@/lib/url-validation";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import crypto from "crypto";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function verifyHmac(payload: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

async function handleWebhookRequest(
  request: NextRequest,
  { params }: { params: { path: string } }
) {
  const startTime = Date.now();

  try {
    // Find webhook by path
    const webhook = await prisma.agentWebhook.findUnique({
      where: { path: params.path },
      include: {
        agent: {
          include: {
            actions: { where: { enabled: true } },
            customTools: { where: { enabled: true } },
            knowledgeBases: { where: { embeddingStatus: "READY" } },
          },
        },
      },
    });

    if (!webhook || !webhook.isActive) {
      return Response.json({ error: "Webhook not found" }, { status: 404 });
    }

    // Check HTTP method
    const methods = webhook.httpMethods as string[];
    if (!methods.includes(request.method)) {
      return Response.json({ error: `Method ${request.method} not allowed` }, { status: 405 });
    }

    // Auth validation
    if (webhook.authType === "HEADER_AUTH") {
      const authHeader = request.headers.get("authorization") || request.headers.get("x-webhook-token");
      if (!authHeader || authHeader !== `Bearer ${webhook.authValue}`) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else if (webhook.authType === "HMAC") {
      const rawBody = await request.clone().text();
      const signature = request.headers.get("x-signature-256") || request.headers.get("x-hub-signature-256") || "";
      if (!signature || !webhook.authValue || !verifyHmac(rawBody, signature.replace("sha256=", ""), webhook.authValue)) {
        return Response.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    // Parse payload
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      payload = { raw: await request.text() };
    }

    // IMMEDIATE mode: return instantly, process in background
    if (webhook.responseMode === "IMMEDIATE") {
      waitUntil(
        processWebhookPayload(webhook, payload, startTime).catch((err) => {
          console.error("Immediate webhook processing failed:", err);
        })
      );
      return Response.json({ received: true, webhookId: webhook.id });
    }

    // AFTER_PROCESSING mode: wait for agent response
    const result = await processWebhookPayload(webhook, payload, startTime);
    return Response.json(result, { status: result.statusCode || 200 });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processWebhookPayload(webhook: any, payload: unknown, startTime: number) {
  const agent = webhook.agent;
  const agentId = agent.id;
  const payloadStr = JSON.stringify(payload, null, 2);

  // Build system prompt
  let systemPrompt = agent.systemPrompt;

  // RAG context
  const queryText = typeof payload === "object" ? JSON.stringify(payload) : String(payload);
  if (agent.knowledgeBases.length > 0) {
    try {
      const chunks = await searchRelevantChunks(agentId, queryText.slice(0, 500), 5);
      if (chunks.length > 0) {
        systemPrompt += "\n\n---\nRELEVANT KNOWLEDGE:\n" +
          chunks.map((c: { content: string }, i: number) => `[${i + 1}] ${c.content}`).join("\n\n");
      }
    } catch { /* skip RAG */ }
  }

  // Prompt branches
  if (agent.promptBranches && Array.isArray(agent.promptBranches)) {
    const lowerPayload = payloadStr.toLowerCase();
    const branches = agent.promptBranches as { keywords: string[]; promptSnippet: string; enabled: boolean }[];
    const snippets: string[] = [];
    for (const branch of branches) {
      if (!branch.enabled) continue;
      if (branch.keywords.some((kw: string) => lowerPayload.includes(kw.toLowerCase()))) {
        snippets.push(branch.promptSnippet);
      }
    }
    if (snippets.length > 0) {
      systemPrompt += "\n\n---\nSpecial instructions:\n" + snippets.join("\n\n");
    }
  }

  // Build tools from enabled actions
  const tools: Anthropic.Tool[] = [];
  for (const action of agent.actions) {
    const config = (action.config || {}) as Record<string, string>;
    switch (action.type) {
      case "COLLECT_EMAIL":
        tools.push({ name: "collect_email", description: "Collect visitor email when they show interest", input_schema: { type: "object" as const, properties: { email: { type: "string", description: "Email address" }, name: { type: "string", description: "Visitor name" } }, required: ["email"] } });
        break;
      case "SCORE_LEAD":
        tools.push({ name: "score_lead", description: "Score lead quality 1-10", input_schema: { type: "object" as const, properties: { score: { type: "number", description: "Score 1-10" }, reasoning: { type: "string" }, email: { type: "string" } }, required: ["score", "reasoning"] } });
        break;
      case "HTTP_REQUEST":
        if (config.url && config.description) {
          tools.push({ name: "http_request", description: config.description, input_schema: { type: "object" as const, properties: { data: { type: "object", description: "Data to include in the request" } }, required: [] } });
        }
        break;
      case "CUSTOM_CODE":
        if (config.code && config.description) {
          tools.push({ name: "custom_code", description: config.description, input_schema: { type: "object" as const, properties: { user_message: { type: "string" } }, required: ["user_message"] } });
        }
        break;
    }
  }

  // Custom HTTP tools
  for (const ct of agent.customTools) {
    const placeholders = [...(ct.url.match(/\{\{(\w+)\}\}/g) || []), ...((ct.bodyTemplate || "").match(/\{\{(\w+)\}\}/g) || [])];
    const props: Record<string, unknown> = {};
    const unique = Array.from(new Set(placeholders.map((p: string) => p.replace(/\{\{|\}\}/g, ""))));
    for (const name of unique) {
      props[name] = { type: "string", description: `Value for ${name}` };
    }
    tools.push({
      name: `custom_tool_${ct.name}`,
      description: ct.description,
      input_schema: { type: "object" as const, properties: props, required: unique },
    });
  }

  const userMessage = `Process this incoming webhook data and take appropriate action:\n\n\`\`\`json\n${payloadStr}\n\`\`\``;

  // LLM call
  const selectedModel = agent.llmModel || "claude-sonnet-4-20250514";
  const modelProvider = MODEL_PROVIDER_MAP[selectedModel] || "ANTHROPIC";
  let userApiKey: string | null = null;
  try {
    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: { userId_provider: { userId: agent.userId, provider: modelProvider.toLowerCase() } },
    });
    if (apiKeyRecord) userApiKey = decrypt(apiKeyRecord.encryptedKey);
  } catch { /* fallback */ }

  let responseText = "";
  const actionsExecuted: string[] = [];

  if (modelProvider === "OPENAI") {
    const openai = new OpenAI({ apiKey: userApiKey || process.env.OPENAI_API_KEY });
    const oaiTools = tools.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description || "", parameters: t.input_schema },
    }));

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];

    for (let round = 0; round < 5; round++) {
      const resp = await openai.chat.completions.create({
        model: selectedModel, max_tokens: 2048, messages,
        ...(oaiTools.length > 0 ? { tools: oaiTools } : {}),
      });

      const choice = resp.choices[0];
      if (!choice.message.tool_calls?.length) {
        responseText = choice.message.content || "";
        break;
      }

      messages.push(choice.message);
      for (const call of choice.message.tool_calls) {
        if (call.type !== "function") continue;
        const fnCall = call as { id: string; type: "function"; function: { name: string; arguments: string } };
        const args = JSON.parse(fnCall.function.arguments || "{}");
        const result = await executeToolForWebhook(fnCall.function.name, args, agent, payload);
        actionsExecuted.push(fnCall.function.name);
        messages.push({ role: "tool", tool_call_id: fnCall.id, content: JSON.stringify(result) });
      }
    }
  } else {
    const client = userApiKey ? getClaudeClientWithKey(userApiKey) : getClaudeClient();
    let currentMessages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];

    for (let round = 0; round < 5; round++) {
      const resp = await client.messages.create({
        model: selectedModel, max_tokens: 2048, system: systemPrompt,
        messages: currentMessages,
        ...(tools.length > 0 ? { tools } : {}),
      });

      const toolUseBlocks = resp.content.filter((b) => b.type === "tool_use");
      if (toolUseBlocks.length === 0) {
        for (const block of resp.content) {
          if (block.type === "text") responseText += block.text;
        }
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        if (block.type !== "tool_use") continue;
        const result = await executeToolForWebhook(block.name, block.input as Record<string, unknown>, agent, payload);
        actionsExecuted.push(block.name);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      }

      currentMessages = [
        ...currentMessages,
        { role: "assistant", content: resp.content },
        { role: "user", content: toolResults },
      ];
    }
  }

  // Deduct credits (non-blocking)
  waitUntil(
    deductCredits(agent.userId, selectedModel, "WEBHOOK", agent.id).catch((err) => {
      console.error("Agent webhook credit deduction failed:", err);
    })
  );

  const duration = Date.now() - startTime;

  // Log execution
  waitUntil(
    prisma.webhookExecution.create({
      data: {
        webhookId: webhook.id,
        incomingPayload: payload as object,
        agentResponse: responseText.slice(0, 5000),
        actionsExecuted,
        duration,
        statusCode: 200,
      },
    }).catch((err) => {
      console.error("Agent webhook execution log failed:", err);
    })
  );

  return { response: responseText, actionsExecuted, duration, statusCode: 200 };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeToolForWebhook(toolName: string, args: Record<string, unknown>, agent: any, webhookPayload: unknown): Promise<unknown> {
  // Custom HTTP tools
  if (toolName.startsWith("custom_tool_")) {
    const name = toolName.replace("custom_tool_", "");
    const ct = agent.customTools.find((t: { name: string }) => t.name === name);
    if (!ct) return { error: "Tool not found" };

    let url = ct.url;
    let body = ct.bodyTemplate || "";
    for (const [key, value] of Object.entries(args)) {
      url = url.replaceAll(`{{${key}}}`, encodeURIComponent(String(value)));
      body = body.replaceAll(`{{${key}}}`, String(value));
    }

    // SSRF protection
    const ctUrlCheck = await validateUrl(url);
    if (!ctUrlCheck.safe) return { success: false, error: ctUrlCheck.error };

    try {
      const resp = await fetch(url, {
        method: ct.method,
        headers: { "Content-Type": "application/json", ...(ct.headers as Record<string, string> || {}) },
        ...(ct.method !== "GET" && body ? { body } : {}),
        signal: AbortSignal.timeout(10000),
      });
      const data = await resp.json().catch(() => resp.text());
      return { success: resp.ok, status: resp.status, data };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Request failed" };
    }
  }

  // HTTP_REQUEST action
  if (toolName === "http_request") {
    const action = agent.actions.find((a: { type: string }) => a.type === "HTTP_REQUEST");
    if (!action?.config) return { error: "HTTP_REQUEST not configured" };
    const config = action.config as Record<string, string>;

    let url = config.url || "";
    let body = config.bodyTemplate || "";
    const reqData = (args.data || webhookPayload || {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(reqData)) {
      url = url.replaceAll(`{{${key}}}`, encodeURIComponent(String(value)));
      body = body.replaceAll(`{{${key}}}`, String(value));
    }

    // SSRF protection
    const httpUrlCheck = await validateUrl(url);
    if (!httpUrlCheck.safe) return { success: false, error: httpUrlCheck.error };

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (config.headers) {
        try { Object.assign(headers, JSON.parse(config.headers)); } catch { /* skip */ }
      }
      const method = config.method || "POST";
      const resp = await fetch(url, {
        method,
        headers,
        ...(method !== "GET" && body ? { body } : {}),
        signal: AbortSignal.timeout(10000),
      });
      const data = await resp.json().catch(() => resp.text());
      return { success: resp.ok, status: resp.status, data };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Request failed" };
    }
  }

  // collect_email
  if (toolName === "collect_email") {
    const email = args.email as string;
    if (email) {
      waitUntil(
        Promise.all([
          prisma.lead.create({
            data: { agentId: agent.id, email, name: (args.name as string) || null, context: "Collected via webhook trigger", score: null },
          }),
          syncLeadToAirtableIfConfigured(agent.id, {
            email,
            name: (args.name as string) || null,
            context: "Collected via webhook trigger",
            sourceAgentName: typeof agent.name === "string" ? agent.name : null,
          }),
        ]).catch((err) => {
          console.error("Webhook lead capture failed:", err);
        })
      );
    }
    return { success: true, message: "Email collected" };
  }

  // score_lead
  if (toolName === "score_lead") {
    const score = args.score as number;
    const email = args.email as string;
    if (email) {
      waitUntil(
        prisma.lead.create({
          data: { agentId: agent.id, email, score, context: (args.reasoning as string) || null },
        }).catch((err) => {
          console.error("Webhook lead score save failed:", err);
        })
      );
    }
    return { success: true, score, reasoning: args.reasoning };
  }

  return { error: `Unknown tool: ${toolName}` };
}

export async function POST(request: NextRequest, ctx: { params: { path: string } }) {
  return handleWebhookRequest(request, ctx);
}

export async function GET(request: NextRequest, ctx: { params: { path: string } }) {
  return handleWebhookRequest(request, ctx);
}

export async function PUT(request: NextRequest, ctx: { params: { path: string } }) {
  return handleWebhookRequest(request, ctx);
}
