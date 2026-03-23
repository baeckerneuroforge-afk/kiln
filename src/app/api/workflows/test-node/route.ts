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
 * Returns structured errors with type, message, details, and suggestions.
 */

/* ── Structured Error Type ── */

export type ErrorType =
  | "api_error"
  | "config_error"
  | "auth_error"
  | "timeout"
  | "credit_error"
  | "runtime_error"
  | "connection_error";

export interface StructuredError {
  type: ErrorType;
  message: string;
  details?: string;
  nodeType: string;
  field?: string; // Which config field caused the error
  suggestions: string[];
}

/* ── Config Validation ── */

interface ValidationError {
  field: string;
  message: string;
}

function validateNodeConfig(
  nodeType: string,
  config: Record<string, unknown>
): ValidationError[] {
  const errors: ValidationError[] = [];
  const str = (v: unknown) => typeof v === "string" ? v.trim() : "";

  switch (nodeType) {
    case "agent":
    case "llm_prompt":
      if (!str(config.systemPrompt) && !str(config.instructions)) {
        errors.push({ field: "systemPrompt", message: "System prompt is empty. Add instructions for the AI." });
      }
      break;

    case "send_email":
    case "gmail_send":
      if (!str(config.to) && !str(config.recipient)) {
        errors.push({ field: "to", message: "Recipient email address is required." });
      } else {
        const email = str(config.to || config.recipient);
        if (email && !email.includes("{{") && !email.includes("@")) {
          errors.push({ field: "to", message: "Invalid email format. Include the @ symbol." });
        }
      }
      if (!str(config.subject)) {
        errors.push({ field: "subject", message: "Subject line is empty." });
      }
      break;

    case "http_request":
      if (!str(config.url)) {
        errors.push({ field: "url", message: "URL is required." });
      } else {
        const url = str(config.url);
        if (url && !url.includes("{{") && !url.startsWith("http://") && !url.startsWith("https://")) {
          errors.push({ field: "url", message: "Invalid URL. Include the protocol (https://...)" });
        }
      }
      break;

    case "if_condition":
      if (!str(config.field)) {
        errors.push({ field: "field", message: "Condition field is empty." });
      }
      break;

    case "computer_use":
      if (!str(config.url) && !str(config.startUrl)) {
        errors.push({ field: "url", message: "Start URL is required." });
      }
      if (!str(config.task)) {
        errors.push({ field: "task", message: "Task description is required." });
      }
      break;

    case "code_sandbox":
      if (!str(config.code) && !str(config.task)) {
        errors.push({ field: "code", message: "Code or task description is required." });
      }
      break;

    case "agent_swarm":
      if (!str(config.goal)) {
        errors.push({ field: "goal", message: "Goal description is required." });
      }
      if (config.maxAgents !== undefined && Number(config.maxAgents) < 1) {
        errors.push({ field: "maxAgents", message: "Max agents must be at least 1." });
      }
      break;

    case "send_slack":
    case "slack_send_integration":
      if (!str(config.channel)) {
        errors.push({ field: "channel", message: "Slack channel is required." });
      }
      if (!str(config.message) && !str(config.text)) {
        errors.push({ field: "message", message: "Message text is required." });
      }
      break;

    case "ai_summarize":
    case "ai_classify":
    case "ai_extract":
      if (!str(config.input) && !str(config.text) && !str(config.content)) {
        errors.push({ field: "input", message: "Input text is required." });
      }
      break;
  }

  return errors;
}

/* ── Error Classification ── */

function classifyError(err: unknown, nodeType: string): StructuredError {
  const msg = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack?.split("\n").slice(0, 3).join("\n") : undefined;

  // API auth errors
  if (msg.includes("401") || msg.includes("Unauthorized") || msg.includes("Invalid API key") || msg.includes("invalid x-api-key")) {
    return {
      type: "auth_error",
      message: "API authentication failed",
      details: msg,
      nodeType,
      suggestions: [
        "Check that your API key is set in Settings → API Keys",
        "Verify the key hasn't expired or been revoked",
        "Try regenerating the API key in your provider's dashboard",
      ],
    };
  }

  // Rate limiting
  if (msg.includes("429") || msg.includes("rate limit") || msg.includes("Rate limit") || msg.includes("too many requests")) {
    return {
      type: "api_error",
      message: "Rate limit exceeded",
      details: msg,
      nodeType,
      suggestions: [
        "Wait a moment and try again",
        "Switch to a different model (Haiku has higher rate limits)",
        "Reduce max tokens to lower resource usage",
      ],
    };
  }

  // Timeout
  if (msg.includes("timeout") || msg.includes("Timeout") || msg.includes("ETIMEDOUT") || msg.includes("AbortError")) {
    return {
      type: "timeout",
      message: "Request timed out",
      details: msg,
      nodeType,
      suggestions: [
        "Try reducing max_tokens or using a faster model like Haiku",
        "Check if the external service is responding",
        "Try again — this may be a temporary issue",
      ],
    };
  }

  // Network / DNS errors
  if (msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED") || msg.includes("DNS") || msg.includes("getaddrinfo") || msg.includes("fetch failed")) {
    return {
      type: "connection_error",
      message: "Could not reach the service",
      details: msg,
      nodeType,
      suggestions: [
        "Check your internet connection",
        "Verify the URL or endpoint is correct",
        "The external service may be temporarily down",
      ],
    };
  }

  // Missing API key
  if (msg.includes("API_KEY") || msg.includes("api_key") || msg.includes("not configured") || msg.includes("apiKey")) {
    return {
      type: "config_error",
      message: "API key not configured",
      details: msg,
      nodeType,
      field: "apiKey",
      suggestions: [
        "Add the required API key in Settings → API Keys",
        "Check .env.local for the correct environment variable",
      ],
    };
  }

  // Invalid model
  if (msg.includes("model") && (msg.includes("not found") || msg.includes("does not exist") || msg.includes("invalid"))) {
    return {
      type: "config_error",
      message: "Invalid model selected",
      details: msg,
      nodeType,
      field: "model",
      suggestions: [
        "Select a valid model from the dropdown",
        "Try Claude Haiku 4.5 or Claude Sonnet 4.6",
      ],
    };
  }

  // Permission / forbidden
  if (msg.includes("403") || msg.includes("Forbidden") || msg.includes("permission")) {
    return {
      type: "auth_error",
      message: "Permission denied",
      details: msg,
      nodeType,
      suggestions: [
        "Your API key may not have permission for this operation",
        "Check API key scopes and permissions",
      ],
    };
  }

  // Generic runtime error
  return {
    type: "runtime_error",
    message: msg.length > 200 ? msg.slice(0, 200) + "..." : msg,
    details: stack || msg,
    nodeType,
    suggestions: [
      "Check the node configuration for typos or missing values",
      "Try running the workflow to see if the error reproduces",
      "Check the browser console for additional details",
    ],
  };
}

/* ── Constants ── */

const DRY_RUN_TYPES = new Set([
  "send_email", "send_slack", "gmail_send", "slack_send_integration",
  "calendar_create", "notion_create", "airtable_create", "google_sheets_write",
]);

const NODE_CATEGORIES: Record<string, string> = {
  trigger_webhook: "trigger", trigger_schedule: "trigger", trigger_lead: "trigger",
  trigger_chat: "trigger", trigger_manual: "trigger",
  agent: "agent", llm_prompt: "agent",
  if_condition: "logic", switch: "logic", filter: "logic", transform: "logic", loop: "logic",
  http_request: "action", send_email: "action", send_slack: "action", delay: "action",
  set_variable: "action", a2a_call: "action",
  approval_gate: "control", wait_webhook: "control", wait_form: "control",
  sub_workflow: "control", merge: "control",
  google_sheets_read: "integration", google_sheets_write: "integration",
  gmail_send: "integration", slack_send_integration: "integration",
  calendar_create: "integration", calendar_check: "integration",
  notion_create: "integration", airtable_create: "integration",
  data_query: "integration", mcp_tool: "integration",
  ai_summarize: "ai_tool", ai_classify: "ai_tool", ai_extract: "ai_tool",
  computer_use: "ai_tool", deep_research: "ai_tool", code_sandbox: "ai_tool",
  goal_trigger: "goal", spawn_helper: "spawn", agent_swarm: "swarm",
  parallel_split: "parallel", parallel_merge: "parallel",
  diff_detection: "ai_tool", multi_site: "ai_tool",
};

/* ── Main Handler ── */

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({
        success: false,
        error: { type: "auth_error", message: "Not logged in", nodeType: "", suggestions: ["Please sign in to test nodes"] } satisfies StructuredError,
        durationMs: Date.now() - startTime,
      }, { status: 401 });
    }

    const body = await request.json();
    const { teamId, nodeType, nodeConfig, testInput } = body as {
      teamId: string;
      nodeType: WorkflowNodeType;
      nodeConfig: Record<string, unknown>;
      testInput?: Record<string, unknown>;
    };

    if (!teamId || !nodeType) {
      return Response.json({
        success: false,
        error: { type: "config_error", message: "teamId and nodeType are required", nodeType: nodeType || "", suggestions: [] } satisfies StructuredError,
        durationMs: Date.now() - startTime,
      }, { status: 400 });
    }

    if (!(await canEditTeam(teamId, userId))) {
      return Response.json({
        success: false,
        error: { type: "auth_error", message: "Team not found or insufficient permissions", nodeType, suggestions: ["Verify you have edit access to this team"] } satisfies StructuredError,
        durationMs: Date.now() - startTime,
      }, { status: 404 });
    }

    // Pre-flight validation
    const validationErrors = validateNodeConfig(nodeType, nodeConfig);
    if (validationErrors.length > 0) {
      return Response.json({
        success: false,
        error: {
          type: "config_error",
          message: validationErrors.map((e) => e.message).join(" "),
          nodeType,
          field: validationErrors[0].field,
          suggestions: validationErrors.map((e) => `Fix: ${e.message}`),
        } satisfies StructuredError,
        validationErrors,
        durationMs: Date.now() - startTime,
        creditsUsed: 0,
      });
    }

    const category = NODE_CATEGORIES[nodeType] || "unknown";

    // Build test context
    const context: Record<string, unknown> = {
      _testMode: true, _userId: userId, _teamId: teamId,
      message: "Hello, this is a test message.",
      variables: {},
      ...testInput,
    };

    // Dry-run for write/send nodes
    if (DRY_RUN_TYPES.has(nodeType)) {
      const dryRunOutput = buildDryRunOutput(nodeType, nodeConfig, context);
      return Response.json({
        success: true, dryRun: true, output: dryRunOutput,
        durationMs: Date.now() - startTime, creditsUsed: 0,
      });
    }

    // Execute
    let output: Record<string, unknown> = {};
    let success = true;
    let error: StructuredError | undefined;

    try {
      switch (category) {
        case "logic": {
          const result = executeLogicNode(nodeType, nodeConfig, context);
          output = { outputHandle: result.outputHandle, ...result.meta };
          break;
        }
        case "action": {
          if (nodeType === "delay") {
            const delayMs = Number(nodeConfig.delayMs || (nodeConfig.seconds ? Number(nodeConfig.seconds) * 1000 : 1000));
            output = { skipped: true, wouldDelay: `${delayMs}ms`, message: "Delay skipped in test mode" };
            break;
          }
          const actionResult = await executeActionNode(nodeType, nodeConfig, context);
          output = { ...actionResult.contextDelta, ...actionResult.meta };
          if (!actionResult.success) {
            success = false;
            error = classifyError(new Error(actionResult.error || "Action failed"), nodeType);
          }
          break;
        }
        case "integration": {
          const intResult = await executeIntegrationNode(nodeType, nodeConfig, context);
          output = { ...intResult.contextDelta, ...intResult.meta };
          if (!intResult.success) {
            success = false;
            error = classifyError(new Error(intResult.error || "Integration failed"), nodeType);
          }
          break;
        }
        case "ai_tool": {
          const aiResult = await executeAiNode(nodeType, nodeConfig, context);
          output = { ...aiResult.contextDelta, ...aiResult.meta };
          if (!aiResult.success) {
            success = false;
            error = classifyError(new Error(aiResult.error || "AI tool failed"), nodeType);
          }
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
          output = await executeTestAgentNode(nodeConfig, context);
          break;
        }
        default: {
          success = false;
          error = {
            type: "runtime_error",
            message: `Node type "${nodeType}" (category: ${category}) cannot be tested in isolation.`,
            nodeType,
            suggestions: ["This node type requires full workflow context to execute"],
          };
        }
      }
    } catch (execErr) {
      success = false;
      error = classifyError(execErr, nodeType);
      output = {};
    }

    return Response.json({
      success,
      output: success ? output : undefined,
      error: error || undefined,
      durationMs: Date.now() - startTime,
      creditsUsed: success && (category === "ai_tool" || category === "agent") ? 1 : 0,
    });
  } catch (err) {
    console.error("POST /api/workflows/test-node error:", err);
    return Response.json({
      success: false,
      error: classifyError(err, "unknown"),
      durationMs: Date.now() - startTime,
    }, { status: 500 });
  }
}

/* ── Dry-run Output ── */

function buildDryRunOutput(
  nodeType: string,
  config: Record<string, unknown>,
  context: Record<string, unknown>
): Record<string, unknown> {
  const resolve = (val: unknown): string => {
    if (typeof val !== "string") return String(val ?? "");
    return val.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
      const trimmed = key.trim();
      return context[trimmed] !== undefined ? String(context[trimmed]) : `{{${trimmed}}}`;
    });
  };

  switch (nodeType) {
    case "send_email": case "gmail_send":
      return {
        wouldSend: {
          to: resolve(config.to || config.recipient),
          subject: resolve(config.subject),
          body: resolve(config.body || config.htmlBody || config.textBody),
          from: config.from || "(default)",
        },
        message: "Dry run — email would be sent with the above data.",
      };
    case "send_slack": case "slack_send_integration":
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
        wouldWrite: { spreadsheetId: config.spreadsheetId, range: config.range, values: config.values },
        message: "Dry run — data would be written to Google Sheets.",
      };
    case "calendar_create":
      return {
        wouldCreate: { title: resolve(config.title || config.summary), startTime: config.startTime, endTime: config.endTime, attendees: config.attendees },
        message: "Dry run — calendar event would be created.",
      };
    case "notion_create":
      return {
        wouldCreate: { databaseId: config.databaseId, title: resolve(config.title), properties: config.properties },
        message: "Dry run — Notion page would be created.",
      };
    case "airtable_create":
      return {
        wouldCreate: { baseId: config.baseId, tableId: config.tableId, fields: config.fields },
        message: "Dry run — Airtable record would be created.",
      };
    default:
      return { config, message: `Dry run — "${nodeType}" action would execute with the above config.` };
  }
}

/* ── Agent Node Test ── */

async function executeTestAgentNode(
  config: Record<string, unknown>,
  context: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured — add it in Settings → API Keys");
  }

  const systemPrompt = String(config.systemPrompt || config.instructions || "You are a helpful assistant.");
  const userMessage = String(
    context.message || config.testMessage || "Hello, this is a test. Please respond briefly."
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
    const errData = await response.json().catch(() => ({})) as Record<string, unknown>;
    const errMsg = errData.error ? JSON.stringify(errData.error) : response.statusText;
    // Throw with HTTP status embedded so classifyError can detect it
    throw new Error(`HTTP ${response.status}: ${errMsg}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
    usage: { input_tokens: number; output_tokens: number };
    model: string;
  };

  const text = data.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");

  return {
    response: text,
    model: data.model,
    tokensIn: data.usage.input_tokens,
    tokensOut: data.usage.output_tokens,
    systemPrompt: systemPrompt.slice(0, 200) + (systemPrompt.length > 200 ? "..." : ""),
    userMessage,
  };
}
