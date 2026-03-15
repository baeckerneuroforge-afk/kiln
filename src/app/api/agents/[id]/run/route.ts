import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { getClaudeClient, getClaudeClientWithKey, MODEL_PROVIDER_MAP } from "@/lib/ai";
import { searchRelevantChunks } from "@/lib/rag";
import { decrypt } from "@/lib/encryption";
import { checkCredits, deductCredits } from "@/lib/credits";
import { Prisma } from "@prisma/client";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

// POST /api/agents/[id]/run — Execute a Task Agent
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const startTime = Date.now();

  try {
    // 1. Auth check
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agentId = params.id;

    // 2. Load agent with relations
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        knowledgeBases: { where: { embeddingStatus: "READY" } },
        actions: { where: { enabled: true } },
        customTools: { where: { enabled: true } },
      },
    });

    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    if (agent.userId !== userId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3. Guard: must be TASK mode
    if (agent.agentMode !== "TASK") {
      return Response.json(
        { error: "This endpoint is only for Task Agents. Use the chat endpoint for Chat Agents." },
        { status: 400 }
      );
    }

    // 4. Parse body
    let input: string | object | undefined;
    try {
      const body = await request.json();
      input = body.input;
    } catch {
      // Kein Body — ist ok, Task kann auch ohne Input laufen
    }

    // 4b. Pre-Process: conditions + transform (no LLM, no credits)
    const preProcessConfig = agent.preProcessConfig as {
      enabled?: boolean;
      code?: string;
      conditions?: { field: string; op: string; value: string }[];
    } | null;

    if (preProcessConfig?.enabled) {
      // Evaluate conditions — if any fail, skip the run
      if (preProcessConfig.conditions?.length) {
        for (const cond of preProcessConfig.conditions) {
          if (!evalCondition(cond, input)) {
            // Condition failed — log as skipped, no credits consumed
            const skipRun = await prisma.agentRun.create({
              data: {
                agentId: agent.id,
                triggerType: "MANUAL",
                input: input ? (typeof input === "object" ? (input as Prisma.InputJsonValue) : { text: input }) : Prisma.DbNull,
                output: `Skipped: condition "${cond.field} ${cond.op} ${cond.value}" not met`,
                status: "SUCCESS",
                duration: Date.now() - startTime,
                creditsUsed: 0,
              },
            });
            return Response.json({
              runId: skipRun.id,
              output: skipRun.output,
              status: "SKIPPED",
              duration: Date.now() - startTime,
              actionsExecuted: [],
              outputAction: { type: "SKIPPED", reason: "pre-process condition failed" },
              creditsUsed: 0,
            });
          }
        }
      }

      // Transform input via JS code
      if (preProcessConfig.code?.trim()) {
        try {
          const fn = new Function("input", `"use strict";\n${preProcessConfig.code}`);
          const transformed = fn(input);
          if (transformed !== undefined) input = transformed;
        } catch (err) {
          // Log transform error but continue with original input
          console.error("Pre-process transform error:", err);
        }
      }
    }

    // 5. Check credits
    const selectedModel = agent.llmModel || "claude-sonnet-4-20250514";
    const modelProvider = MODEL_PROVIDER_MAP[selectedModel] || "ANTHROPIC";

    let userApiKey: string | null = null;
    try {
      const apiKeyRecord = await prisma.apiKey.findUnique({
        where: { userId_provider: { userId, provider: modelProvider.toLowerCase() } },
      });
      if (apiKeyRecord) userApiKey = decrypt(apiKeyRecord.encryptedKey);
    } catch { /* fallback to platform key */ }

    const creditCheck = await checkCredits(userId, selectedModel, !!userApiKey);
    if (!creditCheck.allowed) {
      return Response.json(
        { error: creditCheck.message || "Insufficient credits" },
        { status: 402 }
      );
    }

    // 6. Build system prompt with RAG context
    let systemPrompt = agent.systemPrompt;

    const inputStr = typeof input === "object" ? JSON.stringify(input) : String(input || "");
    if (agent.knowledgeBases.length > 0 && inputStr) {
      try {
        const chunks = await searchRelevantChunks(agentId, inputStr.slice(0, 500), 5);
        if (chunks.length > 0) {
          systemPrompt += "\n\n---\nRELEVANT KNOWLEDGE:\n" +
            chunks.map((c: { content: string }, i: number) => `[${i + 1}] ${c.content}`).join("\n\n");
        }
      } catch { /* skip RAG on error */ }
    }

    // 7. Build input message
    const taskInput = input
      ? (typeof input === "object" ? JSON.stringify(input, null, 2) : String(input))
      : "Run your configured task.";
    const userMessage = `Execute the following task:\n\n${taskInput}`;

    // 8. Build tools from agent's actions and customTools
    const tools: Anthropic.Tool[] = [];
    for (const action of agent.actions) {
      const config = (action.config || {}) as Record<string, string>;
      switch (action.type) {
        case "COLLECT_EMAIL":
          tools.push({
            name: "collect_email",
            description: "Collect visitor email when they show interest",
            input_schema: {
              type: "object" as const,
              properties: {
                email: { type: "string", description: "Email address" },
                name: { type: "string", description: "Visitor name" },
              },
              required: ["email"],
            },
          });
          break;
        case "SCORE_LEAD":
          tools.push({
            name: "score_lead",
            description: "Score lead quality 1-10",
            input_schema: {
              type: "object" as const,
              properties: {
                score: { type: "number", description: "Score 1-10" },
                reasoning: { type: "string" },
                email: { type: "string" },
              },
              required: ["score", "reasoning"],
            },
          });
          break;
        case "HTTP_REQUEST":
          if (config.url && config.description) {
            tools.push({
              name: "http_request",
              description: config.description,
              input_schema: {
                type: "object" as const,
                properties: {
                  data: { type: "object", description: "Data to include in the request" },
                },
                required: [],
              },
            });
          }
          break;
        case "FIRE_WEBHOOK":
          if (config.url) {
            tools.push({
              name: "fire_webhook",
              description: config.description || "Fire a webhook to an external URL",
              input_schema: {
                type: "object" as const,
                properties: {
                  data: { type: "object", description: "Payload data to send" },
                },
                required: [],
              },
            });
          }
          break;
        case "CUSTOM_CODE":
          if (config.code && config.description) {
            tools.push({
              name: "custom_code",
              description: config.description,
              input_schema: {
                type: "object" as const,
                properties: {
                  user_message: { type: "string" },
                },
                required: ["user_message"],
              },
            });
          }
          break;
      }
    }

    // Custom HTTP tools
    for (const ct of agent.customTools) {
      const placeholders = [
        ...(ct.url.match(/\{\{(\w+)\}\}/g) || []),
        ...((ct.bodyTemplate || "").match(/\{\{(\w+)\}\}/g) || []),
      ];
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

    // 9. Call LLM (non-streaming) with tool loop
    let responseText = "";
    const actionsExecuted: string[] = [];

    const isOpenAICompat = modelProvider === "OPENAI" || modelProvider === "PERPLEXITY" || modelProvider === "GROQ";
    const isGoogle = modelProvider === "GOOGLE";

    // Require BYOK for non-Anthropic/OpenAI providers
    if ((modelProvider === "PERPLEXITY" || modelProvider === "GOOGLE" || modelProvider === "GROQ") && !userApiKey) {
      return Response.json(
        { error: `${modelProvider} requires your own API key. Add it in Settings > API Keys.` },
        { status: 400 }
      );
    }

    if (isGoogle && userApiKey) {
      // ===== Google Gemini REST API =====
      const geminiMessages = [
        { role: "user" as const, parts: [{ text: userMessage }] },
      ];

      const geminiBody = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: geminiMessages,
        generationConfig: { maxOutputTokens: 2048 },
      };

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${userApiKey}`,
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
      responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else if (isOpenAICompat) {
      // ===== OpenAI-compatible API (OpenAI, Perplexity, Groq) =====
      let openaiClient: OpenAI;
      if (modelProvider === "OPENAI") {
        openaiClient = new OpenAI({ apiKey: userApiKey || process.env.OPENAI_API_KEY });
      } else if (modelProvider === "PERPLEXITY") {
        openaiClient = new OpenAI({ apiKey: userApiKey!, baseURL: "https://api.perplexity.ai" });
      } else {
        openaiClient = new OpenAI({ apiKey: userApiKey!, baseURL: "https://api.groq.com/openai/v1" });
      }

      // Tools only for OpenAI (Perplexity/Groq don't support function calling)
      const providerSupportsTools = modelProvider === "OPENAI";
      const oaiTools: OpenAI.ChatCompletionTool[] = providerSupportsTools
        ? tools.map((t) => ({
            type: "function" as const,
            function: { name: t.name, description: t.description || "", parameters: t.input_schema },
          }))
        : [];

      const messages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ];

      for (let round = 0; round < 5; round++) {
        const resp = await openaiClient.chat.completions.create({
          model: selectedModel,
          max_tokens: 2048,
          messages,
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
          const result = await executeTool(fnCall.function.name, args, agent, input);
          actionsExecuted.push(fnCall.function.name);
          messages.push({ role: "tool", tool_call_id: fnCall.id, content: JSON.stringify(result) });
        }
      }
    } else {
      // ===== Anthropic (default) =====
      const client = userApiKey ? getClaudeClientWithKey(userApiKey) : getClaudeClient();
      let currentMessages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];

      for (let round = 0; round < 5; round++) {
        const resp = await client.messages.create({
          model: selectedModel,
          max_tokens: 2048,
          system: systemPrompt,
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
          const result = await executeTool(block.name, block.input as Record<string, unknown>, agent, input);
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

    // 9b. Post-Process: transform output + branch routing (no LLM, no credits)
    const postProcessConfig = agent.postProcessConfig as {
      enabled?: boolean;
      code?: string;
      conditions?: { field: string; op: string; value: string }[];
      branches?: { name: string; condition: string; outputType: string; outputConfig: Record<string, string> }[];
    } | null;

    let postProcessedOutput: unknown = responseText;
    const branchOutputActions: { type: string; config: Record<string, string>; name: string }[] = [];

    if (postProcessConfig?.enabled) {
      // Transform output via JS code
      if (postProcessConfig.code?.trim()) {
        try {
          const fn = new Function("output", "input", `"use strict";\n${postProcessConfig.code}`);
          const transformed = fn(responseText, input);
          if (transformed !== undefined) {
            postProcessedOutput = transformed;
            responseText = typeof transformed === "string" ? transformed : JSON.stringify(transformed);
          }
        } catch (err) {
          console.error("Post-process transform error:", err);
        }
      }

      // Evaluate branch conditions
      if (postProcessConfig.branches?.length) {
        for (const branch of postProcessConfig.branches) {
          if (branch.condition.trim()) {
            try {
              const condFn = new Function("output", "input", `"use strict";\nreturn (${branch.condition});`);
              if (condFn(postProcessedOutput, input)) {
                branchOutputActions.push({
                  type: branch.outputType,
                  config: branch.outputConfig,
                  name: branch.name,
                });
              }
            } catch { /* skip broken condition */ }
          } else {
            // No condition = always match (default/fallback branch)
            branchOutputActions.push({
              type: branch.outputType,
              config: branch.outputConfig,
              name: branch.name,
            });
          }
        }
      }
    }

    // 10. Process output based on agent's outputType
    const outputConfig = (agent.outputConfig || {}) as Record<string, string>;
    const outputActionResult: Record<string, unknown> = { type: agent.outputType };

    switch (agent.outputType) {
      case "EMAIL": {
        const to = outputConfig.email || outputConfig.to;
        const subject = outputConfig.subject || `Task Agent "${agent.name}" Result`;
        if (to) {
          try {
            const resendKey = process.env.RESEND_API_KEY;
            if (resendKey) {
              const emailResp = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${resendKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  from: "KILN Tasks <noreply@getkiln.com>",
                  to,
                  subject,
                  text: `Agent: ${agent.name}\nTime: ${new Date().toISOString()}\n\nResult:\n${responseText.slice(0, 5000)}`,
                }),
              });
              outputActionResult.emailSent = emailResp.ok;
              outputActionResult.emailStatus = emailResp.status;
            }
          } catch (e) {
            outputActionResult.emailError = e instanceof Error ? e.message : "Email send failed";
          }
        }
        break;
      }

      case "HTTP_REQUEST": {
        const url = outputConfig.url;
        if (url) {
          try {
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (outputConfig.headers) {
              try { Object.assign(headers, JSON.parse(outputConfig.headers)); } catch { /* skip */ }
            }
            const httpResp = await fetch(url, {
              method: outputConfig.method || "POST",
              headers,
              body: JSON.stringify({
                agentId: agent.id,
                agentName: agent.name,
                output: responseText,
                actionsExecuted,
                timestamp: new Date().toISOString(),
              }),
              signal: AbortSignal.timeout(15000),
            });
            outputActionResult.httpStatus = httpResp.status;
            outputActionResult.httpOk = httpResp.ok;
          } catch (e) {
            outputActionResult.httpError = e instanceof Error ? e.message : "HTTP request failed";
          }
        }
        break;
      }

      case "NEXT_AGENT": {
        const targetAgentId = outputConfig.targetAgentId;
        if (targetAgentId) {
          try {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kiln.hephaistos-systems.de";
            const chainResp = await fetch(`${baseUrl}/api/agents/${targetAgentId}/run`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                // Forward auth cookie for internal call
                Cookie: request.headers.get("cookie") || "",
              },
              body: JSON.stringify({ input: responseText }),
              signal: AbortSignal.timeout(60000),
            });
            const chainResult = await chainResp.json().catch(() => ({}));
            outputActionResult.chainedAgentId = targetAgentId;
            outputActionResult.chainedStatus = chainResp.status;
            outputActionResult.chainedRunId = chainResult.runId;
          } catch (e) {
            outputActionResult.chainError = e instanceof Error ? e.message : "Agent chaining failed";
          }
        }
        break;
      }

      case "WEBHOOK": {
        const webhookUrl = outputConfig.url || outputConfig.webhookUrl;
        if (webhookUrl) {
          try {
            const whResp = await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                agentId: agent.id,
                agentName: agent.name,
                output: responseText,
                actionsExecuted,
                timestamp: new Date().toISOString(),
              }),
              signal: AbortSignal.timeout(15000),
            });
            outputActionResult.webhookStatus = whResp.status;
            outputActionResult.webhookOk = whResp.ok;
          } catch (e) {
            outputActionResult.webhookError = e instanceof Error ? e.message : "Webhook failed";
          }
        }
        break;
      }

      case "CUSTOM_CODE": {
        // Custom code execution — skip for now, just log
        outputActionResult.note = "Custom code execution not yet implemented";
        break;
      }

      case "NONE":
      default:
        // Kein Output-Action nötig
        break;
    }

    // 10b. Execute post-process branch outputs (if any matched)
    const branchResults: Record<string, unknown>[] = [];
    if (branchOutputActions.length > 0) {
      for (const branch of branchOutputActions) {
        const branchResult: Record<string, unknown> = { branch: branch.name, type: branch.type };
        try {
          switch (branch.type) {
            case "EMAIL": {
              const to = branch.config.email;
              const subject = branch.config.subject || `[${branch.name}] ${agent.name}`;
              if (to) {
                const resendKey = process.env.RESEND_API_KEY;
                if (resendKey) {
                  const r = await fetch("https://api.resend.com/emails", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({
                      from: "KILN Tasks <noreply@getkiln.com>",
                      to, subject,
                      text: `Branch: ${branch.name}\nAgent: ${agent.name}\n\n${responseText.slice(0, 5000)}`,
                    }),
                  });
                  branchResult.emailSent = r.ok;
                }
              }
              break;
            }
            case "HTTP_REQUEST":
            case "WEBHOOK": {
              const url = branch.config.url;
              if (url) {
                const r = await fetch(url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    agentId: agent.id, branch: branch.name,
                    output: responseText, timestamp: new Date().toISOString(),
                  }),
                  signal: AbortSignal.timeout(15000),
                });
                branchResult.status = r.status;
                branchResult.ok = r.ok;
              }
              break;
            }
            case "NEXT_AGENT": {
              const targetId = branch.config.targetAgentId;
              if (targetId) {
                const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kiln.hephaistos-systems.de";
                const r = await fetch(`${baseUrl}/api/agents/${targetId}/run`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Cookie: request.headers.get("cookie") || "" },
                  body: JSON.stringify({ input: responseText }),
                  signal: AbortSignal.timeout(60000),
                });
                const data = await r.json().catch(() => ({}));
                branchResult.chainedRunId = data.runId;
              }
              break;
            }
          }
        } catch (e) {
          branchResult.error = e instanceof Error ? e.message : "Branch execution failed";
        }
        branchResults.push(branchResult);
      }
      outputActionResult.branches = branchResults;
    }

    const duration = Date.now() - startTime;

    // 11. Create AgentRun record
    const run = await prisma.agentRun.create({
      data: {
        agentId: agent.id,
        triggerType: "MANUAL",
        input: input ? (typeof input === "object" ? (input as Prisma.InputJsonValue) : { text: input }) : Prisma.DbNull,
        output: responseText.slice(0, 10000),
        outputAction: outputActionResult as Prisma.InputJsonValue,
        status: "SUCCESS",
        duration,
        creditsUsed: creditCheck.byokActive ? 0 : creditCheck.cost,
      },
    });

    // 12. Update agent.lastRunAt and lastRunResult
    prisma.agent.update({
      where: { id: agent.id },
      data: {
        lastRunAt: new Date(),
        lastRunResult: {
          runId: run.id,
          status: "SUCCESS",
          duration,
          outputPreview: responseText.slice(0, 500),
          actionsExecuted,
        },
      },
    }).catch(() => {});

    // 13. Deduct credits
    if (!creditCheck.byokActive) {
      deductCredits(userId, selectedModel, "TASK_RUN", agent.id).catch(() => {});
    }

    // 14. Return result
    return Response.json({
      runId: run.id,
      output: responseText,
      status: "SUCCESS",
      duration,
      actionsExecuted,
      outputAction: outputActionResult,
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    const message = err instanceof Error ? err.message : "Server error";

    // Log failed run if we have enough context
    try {
      const agentId = params.id;
      await prisma.agentRun.create({
        data: {
          agentId,
          triggerType: "MANUAL",
          status: "ERROR",
          error: message,
          duration,
          creditsUsed: 0,
        },
      });
    } catch { /* ignore logging errors */ }

    return Response.json({ error: message }, { status: 500 });
  }
}

// GET /api/agents/[id]/run — Get execution history
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agentId = params.id;

    // Verify ownership
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, userId: true },
    });

    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    if (agent.userId !== userId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // Load runs
    const runs = await prisma.agentRun.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return Response.json({ runs });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// ─── Tool Execution ─────────────────────────────────────────

async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agent: any, // Prisma Agent with included relations
  taskInput: unknown
): Promise<unknown> {
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
    const reqData = (args.data || taskInput || {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(reqData)) {
      url = url.replaceAll(`{{${key}}}`, encodeURIComponent(String(value)));
      body = body.replaceAll(`{{${key}}}`, String(value));
    }

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

  // FIRE_WEBHOOK action
  if (toolName === "fire_webhook") {
    const action = agent.actions.find((a: { type: string }) => a.type === "FIRE_WEBHOOK");
    if (!action?.config) return { error: "FIRE_WEBHOOK not configured" };
    const config = action.config as Record<string, string>;

    try {
      const resp = await fetch(config.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
          data: args.data || {},
          timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await resp.json().catch(() => resp.text());
      return { success: resp.ok, status: resp.status, data };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Webhook failed" };
    }
  }

  // collect_email
  if (toolName === "collect_email") {
    const email = args.email as string;
    if (email) {
      prisma.lead.create({
        data: { agentId: agent.id, email, name: (args.name as string) || null, context: "Collected via task run", score: null },
      }).catch(() => {});
    }
    return { success: true, message: "Email collected" };
  }

  // score_lead
  if (toolName === "score_lead") {
    const score = args.score as number;
    const email = args.email as string;
    if (email) {
      prisma.lead.create({
        data: { agentId: agent.id, email, score, context: (args.reasoning as string) || null },
      }).catch(() => {});
    }
    return { success: true, score, reasoning: args.reasoning };
  }

  return { error: `Unknown tool: ${toolName}` };
}

// ─── Condition Evaluator (Pre/Post-Process) ─────────────────

function evalCondition(
  cond: { field: string; op: string; value: string },
  data: unknown
): boolean {
  const fieldPath = cond.field.replace(/^(input|output)\.?/, "");
  let fieldValue: unknown = data;

  if (fieldPath) {
    const parts = fieldPath.split(".");
    for (const part of parts) {
      if (fieldValue == null || typeof fieldValue !== "object") { fieldValue = undefined; break; }
      fieldValue = (fieldValue as Record<string, unknown>)[part];
    }
  }

  switch (cond.op) {
    case "exists": return fieldValue != null && fieldValue !== "";
    case "not_exists": return fieldValue == null || fieldValue === "";
    case "equals": return String(fieldValue) === cond.value;
    case "not_equals": return String(fieldValue) !== cond.value;
    case "contains": return String(fieldValue ?? "").includes(cond.value);
    case "not_contains": return !String(fieldValue ?? "").includes(cond.value);
    case "gt": return Number(fieldValue) > Number(cond.value);
    case "lt": return Number(fieldValue) < Number(cond.value);
    case "gte": return Number(fieldValue) >= Number(cond.value);
    case "lte": return Number(fieldValue) <= Number(cond.value);
    default: return true;
  }
}
