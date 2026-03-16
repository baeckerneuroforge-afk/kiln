import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { safeEval } from "@/lib/safe-eval";
import { validateUrl } from "@/lib/url-validation";

// Custom Tool Definition Typ
export interface CustomToolDef {
  id: string;
  name: string;
  description: string;
  method: string;
  url: string;
  headers: unknown;
  bodyTemplate: string | null;
  responseMapping: string | null;
}

// Einfacher JSON-Pfad-Accessor: "data.results[0].name" → Wert
export function resolveJsonPath(obj: unknown, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// Tool definitions based on enabled actions + custom tools
export function buildTools(
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

      case "HANDOFF_HUMAN":
        tools.push({
          name: "handoff_human",
          description:
            "Use this tool when the user explicitly asks to speak to a human, or when you cannot adequately help with their request. This will notify a team member to follow up.",
          input_schema: {
            type: "object" as const,
            properties: {
              reason: {
                type: "string",
                description: "Brief summary of why the handoff is needed",
              },
            },
            required: ["reason"],
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

      case "HTTP_REQUEST": {
        if (config.url && config.description) {
          // Platzhalter aus URL und Body extrahieren
          const placeholders = new Set<string>();
          const re = /\{\{(\w+)\}\}/g;
          let m;
          while ((m = re.exec(config.url)) !== null) placeholders.add(m[1]);
          if (config.bodyTemplate) {
            re.lastIndex = 0;
            while ((m = re.exec(config.bodyTemplate)) !== null) placeholders.add(m[1]);
          }
          const phArr = Array.from(placeholders);
          const props: Record<string, { type: string; description: string }> = {};
          for (const p of phArr) {
            props[p] = { type: "string", description: `Value for ${p}` };
          }

          tools.push({
            name: "http_request",
            description: config.description,
            input_schema: {
              type: "object" as const,
              properties: props,
              required: phArr,
            },
          });
        }
        break;
      }
    }
  }

  // Custom HTTP Tools — dynamische Parameter aus URL/Body-Template extrahieren
  for (const ct of customTools) {
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

// Execute tool calls for Chat agents
export async function executeChatTool(
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

      // SSRF protection
      const urlCheck = await validateUrl(url);
      if (!urlCheck.safe) {
        return JSON.stringify({ success: false, message: urlCheck.error });
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

        const evalResult = await safeEval<{ response?: string; data?: unknown }>({
          args: ["context"],
          values: [context],
          code: config.code,
          agentId,
          label: "chat-custom-code",
        });

        if (!evalResult.success) {
          return JSON.stringify({ success: false, message: evalResult.error });
        }

        const result = evalResult.result;
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

    case "http_request": {
      const httpAction = actions.find((a) => a.type === "HTTP_REQUEST");
      const config = (httpAction?.config || {}) as Record<string, string>;
      if (!config.url) {
        return JSON.stringify({ success: false, message: "No HTTP request URL configured" });
      }

      try {
        let url = config.url;
        let body = config.bodyTemplate || "";
        for (const [key, value] of Object.entries(toolInput)) {
          const ph = `{{${key}}}`;
          url = url.replaceAll(ph, encodeURIComponent(String(value)));
          body = body.replaceAll(ph, String(value));
        }

        // SSRF protection
        const urlCheck = await validateUrl(url);
        if (!urlCheck.safe) {
          return JSON.stringify({ success: false, message: urlCheck.error });
        }

        const method = (config.method || "GET").toUpperCase();
        const fetchOpts: RequestInit = {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(config.headers ? JSON.parse(config.headers) : {}),
          },
        };
        if (body && method !== "GET") {
          fetchOpts.body = body;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        fetchOpts.signal = controller.signal;

        const response = await fetch(url, fetchOpts);
        clearTimeout(timeout);

        const contentType = response.headers.get("content-type") || "";
        let responseData: unknown;
        if (contentType.includes("application/json")) {
          responseData = await response.json();
        } else {
          responseData = await response.text();
        }

        if (config.responseMapping && responseData && typeof responseData === "object") {
          const mapped = resolveJsonPath(responseData, config.responseMapping);
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

    case "handoff_human": {
      return JSON.stringify({
        success: true,
        message: "A team member has been notified and will follow up shortly.",
        reason: toolInput.reason,
      });
    }

    default:
      return JSON.stringify({ success: false, message: "Unknown tool" });
  }
}
