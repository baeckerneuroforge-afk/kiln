import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import * as Sentry from "@sentry/nextjs";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { getClaudeClient, getClaudeClientWithKey, MODEL_PROVIDER_MAP } from "@/lib/ai";
import { searchRelevantChunks } from "@/lib/rag";
import { decrypt } from "@/lib/encryption";
import { checkCredits, deductCredits } from "@/lib/credits";
import { Prisma } from "@prisma/client";
import { buildStripeTools } from "@/lib/integrations/agent-stripe";
import { safeEval } from "@/lib/safe-eval";
import { executeTaskTool, evalCondition, executeOutputAction, executeBranchOutputs } from "@/lib/services/task-service";
import { emitEvent } from "@/lib/events";
import { AgentHealthMonitor } from "@/lib/monitoring/agent-health-monitor";
import { validateAgentInput, validateAgentOutput } from "@/lib/agents/io-schema-validator";
import { rateLimit, rateLimitedResponse } from "@/lib/rate-limit-distributed";

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

    const rl = await rateLimit(`agent-run:${userId}`, { limit: 30, windowSeconds: 60 });
    if (!rl.ok) return rateLimitedResponse(rl);

    const agentId = params.id;

    // 2. Load agent with relations
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        knowledgeBases: { where: { embeddingStatus: "READY" } },
        actions: { where: { enabled: true } },
        customTools: { where: { enabled: true } },
        channels: { where: { type: "STRIPE", isActive: true } },
      },
    });

    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    if (agent.userId !== userId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3. Guard: must be TASK mode
    if (agent.mode !== "TASK") {
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

    // 4a. Validate input against agent.inputSchema (if any). Fail-fast on
    // mismatch — caller passed wrong shape, no point burning credits.
    if (agent.inputSchema) {
      const inputResult = validateAgentInput(agent, input);
      if (!inputResult.valid) {
        return Response.json(
          {
            error: "Input does not match agent inputSchema.",
            details: inputResult.errors,
          },
          { status: 400 }
        );
      }
      input = inputResult.data as typeof input;
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
        const evalResult = await safeEval({
          args: ["input"],
          values: [input],
          code: preProcessConfig.code,
          userId,
          agentId: params.id,
          label: "pre-process",
        });
        if (evalResult.success && evalResult.result !== undefined && evalResult.result !== null) {
          input = evalResult.result as string | object;
        } else if (!evalResult.success) {
          console.error("Pre-process transform error:", evalResult.error);
        }
      }
    }

    // 5. Check credits
    const selectedModel = agent.llmModel || "claude-sonnet-4-6";
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

    tools.push(...buildStripeTools(agent.channels.length > 0));

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
          const result = await executeTaskTool(fnCall.function.name, args, agent, input);
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
          const result = await executeTaskTool(block.name, block.input as Record<string, unknown>, agent, input);
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
    let branchResults: Record<string, unknown>[] = [];

    if (postProcessConfig?.enabled) {
      // Transform output via JS code
      if (postProcessConfig.code?.trim()) {
        const evalResult = await safeEval({
          args: ["output", "input"],
          values: [responseText, input],
          code: postProcessConfig.code,
          userId,
          agentId: params.id,
          label: "post-process",
        });
        if (evalResult.success && evalResult.result !== undefined) {
          postProcessedOutput = evalResult.result;
          responseText = typeof evalResult.result === "string" ? evalResult.result : JSON.stringify(evalResult.result);
        } else if (!evalResult.success) {
          console.error("Post-process transform error:", evalResult.error);
        }
      }

      // Evaluate branch conditions and execute branch outputs
      if (postProcessConfig.branches?.length) {
        const branchData = await executeBranchOutputs(
          postProcessConfig.branches,
          postProcessedOutput,
          input,
          userId,
          params.id,
          agent,
          responseText,
          request
        );
        branchResults = branchData.branchResults;
      }
    }

    // 10. Process output based on agent's outputType
    const outputConfig = (agent.outputConfig || {}) as Record<string, string>;
    const outputActionResult = await executeOutputAction(
      agent.outputType,
      outputConfig,
      agent,
      responseText,
      actionsExecuted,
      request
    );

    if (branchResults.length > 0) {
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

    // 12. Emit task.completed event
    waitUntil(
      emitEvent("task.completed", userId, agent.id, {
        runId: run.id,
        duration,
        outputPreview: responseText.slice(0, 500),
        actionsExecuted,
      })
    );

    // Health recording (non-blocking)
    waitUntil(
      AgentHealthMonitor.recordExecution({
        agentId: agent.id,
        executionType: "workflow",
        success: true,
        durationMs: duration,
        creditsUsed: creditCheck.byokActive ? 0 : creditCheck.cost,
      })
    );

    // 13. Update agent.lastRunAt and lastRunResult
    waitUntil(
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
      }).catch((err) => {
        console.error("Task run agent metadata update failed:", err);
      })
    );

    // 14. Deduct credits
    if (!creditCheck.byokActive) {
      waitUntil(
        deductCredits(userId, selectedModel, "TASK_RUN", agent.id).then((result) => {
          if (result.creditsLow) {
            emitEvent("credits.low", userId, agent.id, {
              balance: result.newBalance,
              total: result.totalCredits,
              percentRemaining: result.totalCredits ? Math.round((result.newBalance / result.totalCredits) * 100) : 0,
            });
          }
        }).catch((err) => {
          Sentry.captureException(err, { tags: { component: "credit-deduction", agentId: agent.id }, extra: { userId, model: selectedModel } });
        })
      );
    }

    // 13b. Validate output against agent.outputSchema (if any). When set, the
    // agent is expected to return structured JSON — try to parse responseText
    // before validating. Default behavior is fail-soft (warn-only); enable
    // agent.strictOutputValidation to make schema mismatches a 4xx error.
    let outputWarnings: string[] | undefined;
    let parsedOutput: unknown = undefined;
    if (agent.outputSchema) {
      try {
        parsedOutput = JSON.parse(responseText);
      } catch {
        const msg = "outputSchema is set but agent did not return valid JSON.";
        if (agent.strictOutputValidation) {
          return Response.json(
            { error: msg, output: responseText, runId: run.id },
            { status: 422 }
          );
        }
        outputWarnings = [msg];
      }
      if (parsedOutput !== undefined) {
        const outputResult = validateAgentOutput(agent, parsedOutput);
        if (!outputResult.valid) {
          if (agent.strictOutputValidation) {
            return Response.json(
              {
                error: "Output does not match agent outputSchema.",
                details: outputResult.errors,
                output: parsedOutput,
                runId: run.id,
              },
              { status: 422 }
            );
          }
          outputWarnings = outputResult.errors;
          console.warn(
            `[agent-run] outputSchema violation for agent ${agent.id}:`,
            outputResult.errors
          );
        }
      }
    }

    // 14. Return result
    return Response.json({
      runId: run.id,
      output: responseText,
      status: "SUCCESS",
      duration,
      actionsExecuted,
      outputAction: outputActionResult,
      ...(outputWarnings ? { outputWarnings } : {}),
    });

  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: "task-run", agentId: params.id },
    });
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

    // Health recording (non-blocking)
    waitUntil(
      AgentHealthMonitor.recordExecution({
        agentId: params.id,
        executionType: "workflow",
        success: false,
        durationMs: duration,
        errorType: err instanceof Error ? err.constructor.name : "UnknownError",
        errorMessage: message,
      })
    );

    // Emit task.failed event (best-effort, userId may not be available in all error paths)
    try {
      const { userId: failedUserId } = await auth();
      if (failedUserId) {
        waitUntil(
          emitEvent("task.failed", failedUserId, params.id, {
            error: message,
            duration,
          })
        );
      }
    } catch { /* ignore */ }

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
