import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { validateUrl } from "@/lib/url-validation";
import { safeEval } from "@/lib/safe-eval";

// ─── Tool Execution for Task agents ─────────────────────────

export async function executeTaskTool(
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
    const reqData = (args.data || taskInput || {}) as Record<string, unknown>;
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

  // FIRE_WEBHOOK action
  if (toolName === "fire_webhook") {
    const action = agent.actions.find((a: { type: string }) => a.type === "FIRE_WEBHOOK");
    if (!action?.config) return { error: "FIRE_WEBHOOK not configured" };
    const config = action.config as Record<string, string>;

    // SSRF protection
    const whUrlCheck = await validateUrl(config.url);
    if (!whUrlCheck.safe) return { success: false, error: whUrlCheck.error };

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
      waitUntil(
        prisma.lead.create({
          data: { agentId: agent.id, email, name: (args.name as string) || null, context: "Collected via task run", score: null },
        }).catch((err) => {
          console.error("Task run lead capture failed:", err);
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
          console.error("Task run lead scoring save failed:", err);
        })
      );
    }
    return { success: true, score, reasoning: args.reasoning };
  }

  return { error: `Unknown tool: ${toolName}` };
}

// ─── Condition Evaluator (Pre/Post-Process) ─────────────────

export function evalCondition(
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

// ─── Output Action Execution ────────────────────────────────

export async function executeOutputAction(
  outputType: string,
  outputConfig: Record<string, string>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agent: any,
  responseText: string,
  actionsExecuted: string[],
  request: Request
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = { type: outputType };

  switch (outputType) {
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
            result.emailSent = emailResp.ok;
            result.emailStatus = emailResp.status;
          }
        } catch (e) {
          result.emailError = e instanceof Error ? e.message : "Email send failed";
        }
      }
      break;
    }

    case "HTTP_REQUEST": {
      const url = outputConfig.url;
      if (url) {
        // SSRF protection
        const urlCheck = await validateUrl(url);
        if (!urlCheck.safe) {
          result.httpError = urlCheck.error || "URL blocked for security reasons";
          break;
        }
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
          result.httpStatus = httpResp.status;
          result.httpOk = httpResp.ok;
        } catch (e) {
          result.httpError = e instanceof Error ? e.message : "HTTP request failed";
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
          result.chainedAgentId = targetAgentId;
          result.chainedStatus = chainResp.status;
          result.chainedRunId = chainResult.runId;
        } catch (e) {
          result.chainError = e instanceof Error ? e.message : "Agent chaining failed";
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
          result.webhookStatus = whResp.status;
          result.webhookOk = whResp.ok;
        } catch (e) {
          result.webhookError = e instanceof Error ? e.message : "Webhook failed";
        }
      }
      break;
    }

    case "CUSTOM_CODE": {
      result.note = "Custom code execution not yet implemented";
      break;
    }

    case "NONE":
    default:
      break;
  }

  return result;
}

// ─── Branch Output Execution ────────────────────────────────

export async function executeBranchOutputs(
  branches: { name: string; condition: string; outputType: string; outputConfig: Record<string, string> }[],
  postProcessedOutput: unknown,
  input: unknown,
  userId: string,
  agentId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agent: any,
  responseText: string,
  request: Request
): Promise<{ branchOutputActions: { type: string; config: Record<string, string>; name: string }[]; branchResults: Record<string, unknown>[] }> {
  const branchOutputActions: { type: string; config: Record<string, string>; name: string }[] = [];

  for (const branch of branches) {
    if (branch.condition.trim()) {
      const condResult = await safeEval<boolean>({
        args: ["output", "input"],
        values: [postProcessedOutput, input],
        code: `return (${branch.condition});`,
        userId,
        agentId,
        label: "branch-condition",
      });
      if (condResult.success && condResult.result) {
        branchOutputActions.push({
          type: branch.outputType,
          config: branch.outputConfig,
          name: branch.name,
        });
      }
    } else {
      // No condition = always match (default/fallback branch)
      branchOutputActions.push({
        type: branch.outputType,
        config: branch.outputConfig,
        name: branch.name,
      });
    }
  }

  const branchResults: Record<string, unknown>[] = [];
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

  return { branchOutputActions, branchResults };
}
