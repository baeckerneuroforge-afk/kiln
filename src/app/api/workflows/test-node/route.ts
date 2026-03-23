import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { canEditTeam } from "@/lib/team-permissions";
import { executeLogicNode } from "@/lib/workflow-nodes/logic-nodes";
import { executeActionNode } from "@/lib/workflow-nodes/action-nodes";
import { executeIntegrationNode } from "@/lib/workflow-nodes/integration-nodes";
import { executeAiNode } from "@/lib/workflow-nodes/ai-nodes";
import { executeControlNode } from "@/lib/workflow-nodes/control-nodes";
import { executeTriggerNode } from "@/lib/workflow-nodes/trigger-nodes";
import type { WorkflowNodeType } from "@/lib/workflow-node-types";

/**
 * POST /api/workflows/test-node
 * Execute a single workflow node in isolation for testing.
 * Integration/email/slack nodes run in dry-run mode.
 */

// Node types that should NEVER actually send/trigger in test mode
const DRY_RUN_TYPES = new Set([
  "send_email",
  "send_slack",
  "gmail_send",
  "slack_send_integration",
  "calendar_create",
  "notion_create",
  "airtable_create",
  "google_sheets_write",
]);

const NODE_CATEGORIES: Record<string, string> = {
  trigger_webhook: "trigger",
  trigger_schedule: "trigger",
  trigger_lead: "trigger",
  trigger_chat: "trigger",
  trigger_manual: "trigger",
  agent: "agent",
  llm_prompt: "agent",
  if_condition: "logic",
  switch: "logic",
  filter: "logic",
  transform: "logic",
  loop: "logic",
  http_request: "action",
  send_email: "action",
  send_slack: "action",
  delay: "action",
  set_variable: "action",
  a2a_call: "action",
  approval_gate: "control",
  wait_webhook: "control",
  wait_form: "control",
  sub_workflow: "control",
  merge: "control",
  google_sheets_read: "integration",
  google_sheets_write: "integration",
  gmail_send: "integration",
  slack_send_integration: "integration",
  calendar_create: "integration",
  calendar_check: "integration",
  notion_create: "integration",
  airtable_create: "integration",
  data_query: "integration",
  mcp_tool: "integration",
  ai_summarize: "ai_tool",
  ai_classify: "ai_tool",
  ai_extract: "ai_tool",
  computer_use: "ai_tool",
  deep_research: "ai_tool",
  code_sandbox: "ai_tool",
  goal_trigger: "goal",
  spawn_helper: "spawn",
  agent_swarm: "swarm",
  parallel_split: "parallel",
  parallel_merge: "parallel",
  diff_detection: "ai_tool",
  multi_site: "ai_tool",
};

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { teamId, nodeType, nodeConfig, testInput } = body as {
      teamId: string;
      nodeType: WorkflowNodeType;
      nodeConfig: Record<string, unknown>;
      testInput?: Record<string, unknown>;
    };

    if (!teamId || !nodeType) {
      return Response.json({ error: "teamId and nodeType are required" }, { status: 400 });
    }

    if (!(await canEditTeam(teamId, userId))) {
      return Response.json({ error: "Team not found or insufficient permissions" }, { status: 404 });
    }

    const category = NODE_CATEGORIES[nodeType] || "unknown";

    // Build test context from input or defaults
    const context: Record<string, unknown> = {
      _testMode: true,
      _userId: userId,
      _teamId: teamId,
      message: "Hello, this is a test message.",
      variables: {},
      ...testInput,
    };

    // Dry-run: for email/slack/integration write nodes, return what WOULD be sent
    if (DRY_RUN_TYPES.has(nodeType)) {
      const dryRunOutput = buildDryRunOutput(nodeType, nodeConfig, context);
      return Response.json({
        success: true,
        dryRun: true,
        output: dryRunOutput,
        durationMs: Date.now() - startTime,
        creditsUsed: 0,
      });
    }

    // Execute based on category
    let output: Record<string, unknown> = {};
    let success = true;
    let error: string | undefined;

    try {
      switch (category) {
        case "logic": {
          const result = executeLogicNode(nodeType, nodeConfig, context);
          output = { outputHandle: result.outputHandle, ...result.meta };
          break;
        }

        case "action": {
          // Skip delay in test mode — it would block
          if (nodeType === "delay") {
            const delayMs = Number(nodeConfig.delayMs || nodeConfig.seconds && Number(nodeConfig.seconds) * 1000 || 1000);
            output = { contextDelta: {}, skipped: true, wouldDelay: `${delayMs}ms`, message: "Delay skipped in test mode" };
            break;
          }
          const actionResult = await executeActionNode(nodeType, nodeConfig, context);
          output = { ...actionResult.contextDelta, ...actionResult.meta };
          success = actionResult.success;
          error = actionResult.error;
          break;
        }

        case "integration": {
          // Read-only integrations are safe to execute
          const intResult = await executeIntegrationNode(nodeType, nodeConfig, context);
          output = { ...intResult.contextDelta, ...intResult.meta };
          success = intResult.success;
          error = intResult.error;
          break;
        }

        case "ai_tool": {
          const aiResult = await executeAiNode(nodeType, nodeConfig, context);
          output = { ...aiResult.contextDelta, ...aiResult.meta };
          success = aiResult.success;
          error = aiResult.error;
          break;
        }

        case "control": {
          const ctrlResult = executeControlNode(nodeType, nodeConfig, context);
          output = { action: ctrlResult.action, ...ctrlResult.contextDelta, ...ctrlResult.meta };
          break;
        }

        case "trigger": {
          const trigResult = executeTriggerNode(nodeType, nodeConfig, testInput);
          output = { context: trigResult.context };
          break;
        }

        case "agent": {
          // Agent nodes need team/member context — simulate with LLM call
          output = await executeTestAgentNode(nodeConfig, context);
          break;
        }

        default: {
          output = { message: `Node type "${nodeType}" (category: ${category}) cannot be tested in isolation.` };
          success = false;
          error = `Unsupported test category: ${category}`;
        }
      }
    } catch (execErr) {
      success = false;
      error = execErr instanceof Error ? execErr.message : String(execErr);
      output = { error };
    }

    const durationMs = Date.now() - startTime;

    return Response.json({
      success,
      output,
      error,
      durationMs,
      creditsUsed: category === "ai_tool" || category === "agent" ? 1 : 0,
    });
  } catch (err) {
    console.error("POST /api/workflows/test-node error:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * Build dry-run output showing what WOULD be sent without actually sending.
 */
function buildDryRunOutput(
  nodeType: string,
  config: Record<string, unknown>,
  context: Record<string, unknown>
): Record<string, unknown> {
  // Simple expression resolution for preview
  const resolve = (val: unknown): string => {
    if (typeof val !== "string") return String(val ?? "");
    return val.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
      const trimmed = key.trim();
      return context[trimmed] !== undefined ? String(context[trimmed]) : `{{${trimmed}}}`;
    });
  };

  switch (nodeType) {
    case "send_email":
    case "gmail_send":
      return {
        wouldSend: {
          to: resolve(config.to || config.recipient),
          subject: resolve(config.subject),
          body: resolve(config.body || config.htmlBody || config.textBody),
          from: config.from || "(default)",
        },
        message: "Dry run — email would be sent with the above data.",
      };

    case "send_slack":
    case "slack_send_integration":
      return {
        wouldSend: {
          channel: resolve(config.channel),
          message: resolve(config.message || config.text),
          botName: config.botName || "(default)",
        },
        message: "Dry run — Slack message would be sent with the above data.",
      };

    case "google_sheets_write":
      return {
        wouldWrite: {
          spreadsheetId: config.spreadsheetId,
          range: config.range,
          values: config.values,
        },
        message: "Dry run — data would be written to Google Sheets.",
      };

    case "calendar_create":
      return {
        wouldCreate: {
          title: resolve(config.title || config.summary),
          startTime: config.startTime,
          endTime: config.endTime,
          attendees: config.attendees,
        },
        message: "Dry run — calendar event would be created.",
      };

    case "notion_create":
      return {
        wouldCreate: {
          databaseId: config.databaseId,
          title: resolve(config.title),
          properties: config.properties,
        },
        message: "Dry run — Notion page would be created.",
      };

    case "airtable_create":
      return {
        wouldCreate: {
          baseId: config.baseId,
          tableId: config.tableId,
          fields: config.fields,
        },
        message: "Dry run — Airtable record would be created.",
      };

    default:
      return {
        config,
        message: `Dry run — "${nodeType}" action would execute with the above config.`,
      };
  }
}

/**
 * Test an agent/llm_prompt node by making a direct LLM call.
 */
async function executeTestAgentNode(
  config: Record<string, unknown>,
  context: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const systemPrompt = String(config.systemPrompt || config.instructions || "You are a helpful assistant.");
  const userMessage = String(
    context.message ||
    config.testMessage ||
    "Hello, this is a test. Please respond briefly."
  );
  const model = String(config.model || config.llmModel || "claude-haiku-4-5-20251001");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`Claude API error: ${JSON.stringify((errData as Record<string, unknown>).error || response.statusText)}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
    usage: { input_tokens: number; output_tokens: number };
    model: string;
  };

  const text = data.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");

  return {
    response: text,
    model: data.model,
    tokensIn: data.usage.input_tokens,
    tokensOut: data.usage.output_tokens,
    systemPrompt: systemPrompt.slice(0, 200) + (systemPrompt.length > 200 ? "..." : ""),
    userMessage,
  };
}
