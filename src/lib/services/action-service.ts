import Anthropic from "@anthropic-ai/sdk";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { sendAppointmentConfirmationEmails } from "@/lib/email-notifications";
import {
  getGoogleCalendarIntegrationForAgent,
  type GoogleCalendarDateRange,
} from "@/lib/integrations/google-calendar";
import { syncLeadToAirtableIfConfigured } from "@/lib/integrations/airtable";
import {
  buildStripeTools as buildAgentStripeTools,
  executeStripeTool,
  isStripeToolName,
} from "@/lib/integrations/agent-stripe";
import { safeEval } from "@/lib/safe-eval";
import { validateUrl } from "@/lib/url-validation";
import { logHandoff } from "@/lib/orchestration-logger";
import { isMCPToolName, executeMCPTool } from "@/lib/mcp/mcp-tool-bridge";

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

export interface ChatToolExecutionContext {
  userId?: string;
  conversationId?: string;
  visitorName?: string | null;
  visitorEmail?: string | null;
  agentName?: string;
}

function buildAvailabilityRange(toolInput: Record<string, unknown>): GoogleCalendarDateRange {
  const timezone = typeof toolInput.timezone === "string" && toolInput.timezone
    ? toolInput.timezone
    : "UTC";
  const slotMinutes = Number(toolInput.slotMinutes) || 30;
  const dayStartHour = Number(toolInput.dayStartHour);
  const dayEndHour = Number(toolInput.dayEndHour);

  if (typeof toolInput.rangeStart === "string" && typeof toolInput.rangeEnd === "string") {
    return {
      start: toolInput.rangeStart,
      end: toolInput.rangeEnd,
      timezone,
      slotMinutes,
      dayStartHour: Number.isFinite(dayStartHour) ? dayStartHour : undefined,
      dayEndHour: Number.isFinite(dayEndHour) ? dayEndHour : undefined,
      maxSlots: Number(toolInput.maxSlots) || 8,
    };
  }

  if (typeof toolInput.preferredDate === "string" && toolInput.preferredDate) {
    const preferredDate = new Date(toolInput.preferredDate);
    const start = new Date(preferredDate);
    start.setHours(Number.isFinite(dayStartHour) ? dayStartHour : 9, 0, 0, 0);
    const end = new Date(preferredDate);
    end.setHours(Number.isFinite(dayEndHour) ? dayEndHour : 17, 0, 0, 0);

    return {
      start: start.toISOString(),
      end: end.toISOString(),
      timezone,
      slotMinutes,
      dayStartHour: Number.isFinite(dayStartHour) ? dayStartHour : 9,
      dayEndHour: Number.isFinite(dayEndHour) ? dayEndHour : 17,
      maxSlots: Number(toolInput.maxSlots) || 8,
    };
  }

  const start = new Date();
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 5);
  end.setHours(17, 0, 0, 0);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    timezone,
    slotMinutes,
    dayStartHour: 9,
    dayEndHour: 17,
    maxSlots: Number(toolInput.maxSlots) || 8,
  };
}

function formatSlotList(slots: { label: string }[]) {
  return slots.map((slot, index) => `${index + 1}. ${slot.label}`).join("\n");
}

// Tool definitions based on enabled actions + custom tools
export function buildTools(
  actions: { type: string; enabled: boolean; config: unknown }[],
  customTools: CustomToolDef[] = [],
  stripeEnabled = false
): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = [];

  for (const action of actions) {
    if (!action.enabled) continue;
    const config = (action.config || {}) as Record<string, string>;

    switch (action.type) {
      case "BOOK_APPOINTMENT":
        tools.push({
          name: "book_appointment",
          description:
            "Use this tool when the user wants to book an appointment, asks for available times, or confirms a slot. First check live availability when possible. Once the user picks a time, create the booking with their name and email. If no live calendar is available, fall back to the configured booking link.",
          input_schema: {
            type: "object" as const,
            properties: {
              operation: {
                type: "string",
                enum: ["availability", "book"],
                description: "Use 'availability' to fetch open slots or 'book' to create the appointment.",
              },
              reason: {
                type: "string",
                description: "Reason for the appointment or meeting topic.",
              },
              preferredDate: {
                type: "string",
                description: "Preferred booking date if the user mentioned a specific day.",
              },
              rangeStart: {
                type: "string",
                description: "ISO datetime for the beginning of the availability search window.",
              },
              rangeEnd: {
                type: "string",
                description: "ISO datetime for the end of the availability search window.",
              },
              timezone: {
                type: "string",
                description: "IANA timezone like Europe/Berlin or America/New_York.",
              },
              slotStart: {
                type: "string",
                description: "ISO datetime for the chosen appointment start time.",
              },
              slotEnd: {
                type: "string",
                description: "ISO datetime for the chosen appointment end time.",
              },
              attendeeName: {
                type: "string",
                description: "Visitor or attendee name.",
              },
              attendeeEmail: {
                type: "string",
                description: "Visitor or attendee email address.",
              },
              title: {
                type: "string",
                description: "Optional custom appointment title.",
              },
            },
            required: ["operation"],
          },
        });
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

      case "HANDOFF_AGENT": {
        const targetAgentId = config.targetAgentId;
        const condition = config.condition || "";
        if (targetAgentId) {
          tools.push({
            name: "handoff_agent",
            description: condition
              ? `Use this tool when: ${condition}. This will seamlessly transfer the conversation to a specialized agent. The user will not notice the transfer.`
              : "Use this tool to transfer the conversation to a specialized agent when the current topic falls outside your expertise. The user will not notice the transfer.",
            input_schema: {
              type: "object" as const,
              properties: {
                reason: {
                  type: "string",
                  description: "Brief reason for the handoff — what topic or situation triggered it",
                },
                summary: {
                  type: "string",
                  description: "Brief summary of the conversation so far and what the user needs",
                },
              },
              required: ["reason", "summary"],
            },
          });
        }
        break;
      }

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

  tools.push(...buildAgentStripeTools(stripeEnabled));

  return tools;
}

// Execute tool calls for Chat agents
export async function executeChatTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  agentId: string,
  actions: { type: string; config: unknown }[],
  customTools: CustomToolDef[] = [],
  context: ChatToolExecutionContext = {}
): Promise<string> {
  // MCP Tool?
  if (isMCPToolName(toolName)) {
    return executeMCPTool(agentId, toolName, toolInput);
  }

  if (isStripeToolName(toolName)) {
    const result = await executeStripeTool(toolName, toolInput, agentId);
    return JSON.stringify(result);
  }

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
      const fallbackUrl = config.calendlyUrl || "";
      const operation =
        typeof toolInput.operation === "string" && toolInput.operation
          ? toolInput.operation
          : "availability";
      const googleCalendar = await getGoogleCalendarIntegrationForAgent(agentId);

      if (!googleCalendar) {
        if (!fallbackUrl) {
          return JSON.stringify({
            success: false,
            action: "unavailable",
            message:
              "Appointment booking is enabled, but this agent does not have Google Calendar connected and no fallback booking link is configured.",
          });
        }

        return JSON.stringify({
          success: true,
          action: "link_shared",
          message: `Here is the booking link: ${fallbackUrl}`,
          bookingUrl: fallbackUrl,
          reason: toolInput.reason || null,
        });
      }

      const { integration, config: connectionConfig } = googleCalendar;
      let calendarId = connectionConfig.selectedCalendarId || null;

      if (!calendarId) {
        const calendars = await integration.listCalendars();
        const primaryCalendar = calendars.find((calendar) => calendar.primary) || calendars[0];
        calendarId = primaryCalendar?.id || null;
      }

      if (!calendarId) {
        return JSON.stringify({
          success: false,
          action: "unavailable",
          message: "Google Calendar is connected, but no writable calendar is available for bookings.",
        });
      }

      if (operation === "availability") {
        const range = buildAvailabilityRange(toolInput);
        const slots = await integration.getAvailableSlots(calendarId, range);

        if (slots.length === 0) {
          return JSON.stringify({
            success: true,
            action: "availability",
            slots: [],
            message: "I could not find any open slots in that time range. Ask the user for another day or broader availability.",
          });
        }

        return JSON.stringify({
          success: true,
          action: "availability",
          calendarId,
          slots,
          message: `Here are the next available slots:\n${formatSlotList(slots)}`,
        });
      }

      if (operation !== "book") {
        return JSON.stringify({
          success: false,
          action: "invalid_operation",
          message: "Invalid appointment operation. Use 'availability' or 'book'.",
        });
      }

      const attendeeEmail =
        (typeof toolInput.attendeeEmail === "string" ? toolInput.attendeeEmail : null) ||
        context.visitorEmail ||
        null;
      const attendeeName =
        (typeof toolInput.attendeeName === "string" ? toolInput.attendeeName : null) ||
        context.visitorName ||
        null;
      const slotStart =
        typeof toolInput.slotStart === "string" ? new Date(toolInput.slotStart) : null;
      const slotEnd =
        typeof toolInput.slotEnd === "string" ? new Date(toolInput.slotEnd) : null;

      if (!attendeeEmail || !attendeeEmail.includes("@")) {
        return JSON.stringify({
          success: false,
          action: "missing_attendee_email",
          message: "Ask the user for a valid email address before booking the appointment.",
        });
      }

      if (!slotStart || Number.isNaN(slotStart.getTime())) {
        return JSON.stringify({
          success: false,
          action: "missing_slot",
          message: "Ask the user which available slot they want before creating the appointment.",
        });
      }

      const resolvedEnd =
        slotEnd && !Number.isNaN(slotEnd.getTime())
          ? slotEnd
          : new Date(slotStart.getTime() + 30 * 60_000);
      const timezone =
        (typeof toolInput.timezone === "string" && toolInput.timezone) ||
        "UTC";

      const availabilityCheck = await integration.getAvailableSlots(calendarId, {
        start: slotStart.toISOString(),
        end: resolvedEnd.toISOString(),
        timezone,
        slotMinutes: Math.max(15, Math.round((resolvedEnd.getTime() - slotStart.getTime()) / 60_000)),
        dayStartHour: slotStart.getHours(),
        dayEndHour: Math.max(slotStart.getHours() + 1, resolvedEnd.getHours()),
        maxSlots: 4,
      });

      const exactSlotStillFree = availabilityCheck.some(
        (slot) => slot.start === slotStart.toISOString() && slot.end === resolvedEnd.toISOString()
      );

      if (!exactSlotStillFree) {
        return JSON.stringify({
          success: false,
          action: "slot_unavailable",
          message: "That slot is no longer available. Ask the user to choose another open time.",
        });
      }

      const title =
        (typeof toolInput.title === "string" && toolInput.title) ||
        `${context.agentName || "KILN"} appointment`;
      const description = [
        typeof toolInput.reason === "string" && toolInput.reason
          ? `Reason: ${toolInput.reason}`
          : null,
        attendeeName ? `Attendee: ${attendeeName}` : null,
        attendeeEmail ? `Email: ${attendeeEmail}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const event = await integration.createEvent(calendarId, {
        title,
        description,
        start: slotStart.toISOString(),
        end: resolvedEnd.toISOString(),
        timezone,
        attendeeName,
        attendeeEmail,
      });

      if (context.conversationId) {
        await prisma.conversation.update({
          where: { id: context.conversationId },
          data: {
            visitorEmail: attendeeEmail,
            visitorName: attendeeName || undefined,
          },
        });
      }

      if (context.userId && context.agentName) {
        await sendAppointmentConfirmationEmails({
          agentOwnerId: context.userId,
          agentName: context.agentName,
          visitorEmail: attendeeEmail,
          visitorName: attendeeName,
          start: event.start.dateTime || slotStart.toISOString(),
          end: event.end.dateTime || resolvedEnd.toISOString(),
          timezone: event.start.timeZone || timezone,
          eventLink: event.htmlLink || null,
        });
      }

      return JSON.stringify({
        success: true,
        action: "booked",
        eventId: event.id,
        htmlLink: event.htmlLink || null,
        start: event.start.dateTime || slotStart.toISOString(),
        end: event.end.dateTime || resolvedEnd.toISOString(),
        attendeeEmail,
        attendeeName,
        message: `The appointment is confirmed for ${new Intl.DateTimeFormat("en-US", {
          dateStyle: "full",
          timeStyle: "short",
          timeZone: event.start.timeZone || timezone,
        }).format(slotStart)}.`,
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

      waitUntil(
        syncLeadToAirtableIfConfigured(agentId, {
          email,
          name: (toolInput.name as string) || null,
          context: (toolInput.context as string) || null,
          sourceAgentName: context.agentName || null,
        }).catch((error) => {
          console.error("Airtable lead sync failed:", error);
        })
      );

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

    case "handoff_agent": {
      const handoffAction = actions.find((a) => a.type === "HANDOFF_AGENT");
      const handoffConfig = (handoffAction?.config || {}) as Record<string, string>;
      const targetAgentId = handoffConfig.targetAgentId;

      if (!targetAgentId) {
        return JSON.stringify({ success: false, message: "No target agent configured for handoff." });
      }

      // Verify target agent exists
      const targetAgent = await prisma.agent.findUnique({
        where: { id: targetAgentId },
        select: { id: true, name: true },
      });

      if (!targetAgent) {
        return JSON.stringify({ success: false, message: "Target agent not found." });
      }

      // Update conversation to point to the target agent
      if (context.conversationId) {
        await prisma.conversation.update({
          where: { id: context.conversationId },
          data: {
            handoffAgentId: targetAgentId,
            handoffAt: new Date(),
          },
        });

        // Log the handoff in OrchestrationHandoff if an orchestration rule exists
        const rule = await prisma.agentOrchestration.findFirst({
          where: { sourceAgentId: agentId, targetAgentId, enabled: true },
        });

        if (rule) {
          await prisma.orchestrationHandoff.create({
            data: {
              orchestrationRuleId: rule.id,
              sourceAgentId: agentId,
              targetAgentId,
              conversationId: context.conversationId,
              reason: (toolInput.reason as string) || "Agent-triggered handoff",
            },
          });
        }
      }

      // Log handoff for orchestration training data
      logHandoff({
        teamId: agentId, // Use agentId as team reference for chat-level handoffs
        executionId: context.conversationId || `handoff_${Date.now()}`,
        sourceAgentId: agentId,
        sourceAgentName: context.agentName || agentId,
        targetAgentId,
        targetAgentName: targetAgent.name,
        reason: (toolInput.reason as string) || "Agent-triggered handoff",
        conversationId: context.conversationId,
      }).catch(() => {});

      return JSON.stringify({
        success: true,
        handoff: true,
        targetAgentId,
        targetAgentName: targetAgent.name,
        reason: toolInput.reason,
        summary: toolInput.summary,
        message: `Conversation handed off to ${targetAgent.name}. Continue responding as that agent.`,
      });
    }

    default:
      return JSON.stringify({ success: false, message: "Unknown tool" });
  }
}
