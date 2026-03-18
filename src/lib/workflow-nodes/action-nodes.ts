/**
 * Action Node Executors
 * Führen Seiteneffekte aus: HTTP-Requests, E-Mails, Slack, Delays, Variablen.
 */

import {
  resolveExpression,
  resolveExpressionDeep,
  type ExpressionContext,
} from "@/lib/workflow-expressions";

export interface ActionNodeResult {
  /** Daten die in den Kontext geschrieben werden */
  contextDelta: Record<string, unknown>;
  /** Ob der Node erfolgreich war */
  success: boolean;
  /** Fehlermeldung bei Misserfolg */
  error?: string;
  /** Metadaten für das Log */
  meta?: Record<string, unknown>;
}

/* ── HTTP Request ── */

export async function executeHttpRequest(
  config: Record<string, unknown>,
  context: ExpressionContext
): Promise<ActionNodeResult> {
  const method = String(config.method || "GET").toUpperCase();
  const url = resolveExpression(String(config.url || ""), context);
  const headersRaw = (config.headers || {}) as Record<string, string>;
  const bodyTemplate = config.body ? String(config.body) : undefined;

  if (!url) {
    return { contextDelta: {}, success: false, error: "URL ist leer" };
  }

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(headersRaw)) {
    headers[key] = resolveExpression(value, context);
  }

  // Content-Type Default
  if (!headers["Content-Type"] && bodyTemplate) {
    headers["Content-Type"] = "application/json";
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(30_000), // 30s Timeout
  };

  if (bodyTemplate && method !== "GET" && method !== "HEAD") {
    const resolvedBody = resolveExpression(bodyTemplate, context);
    fetchOptions.body = resolvedBody;
  }

  try {
    const response = await fetch(url, fetchOptions);
    const responseText = await response.text();

    let responseData: unknown = responseText;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      // Text Response
    }

    const resultKey = String(config.resultKey || "httpResponse");

    if (!response.ok) {
      return {
        contextDelta: {
          [resultKey]: {
            status: response.status,
            statusText: response.statusText,
            body: responseData,
          },
        },
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        meta: { url, method, status: response.status },
      };
    }

    return {
      contextDelta: {
        [resultKey]: {
          status: response.status,
          body: responseData,
        },
      },
      success: true,
      meta: { url, method, status: response.status },
    };
  } catch (err) {
    return {
      contextDelta: {},
      success: false,
      error: err instanceof Error ? err.message : "HTTP Request fehlgeschlagen",
      meta: { url, method },
    };
  }
}

/* ── Send Email (via Resend) ── */

export async function executeSendEmail(
  config: Record<string, unknown>,
  context: ExpressionContext
): Promise<ActionNodeResult> {
  const to = resolveExpression(String(config.to || ""), context);
  const subject = resolveExpression(String(config.subject || ""), context);
  const body = resolveExpression(String(config.body || ""), context);
  const from = resolveExpression(
    String(config.from || "KILN AI <noreply@kiln.email>"),
    context
  );

  if (!to || !subject) {
    return {
      contextDelta: {},
      success: false,
      error: "E-Mail benötigt mindestens Empfänger und Betreff",
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      contextDelta: {},
      success: false,
      error: "RESEND_API_KEY nicht konfiguriert",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html: body,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        contextDelta: {},
        success: false,
        error: `Resend API: ${(errData as Record<string, string>).message || response.statusText}`,
        meta: { to, subject },
      };
    }

    const data = await response.json();
    return {
      contextDelta: {
        emailSent: {
          id: (data as Record<string, string>).id,
          to,
          subject,
          sentAt: new Date().toISOString(),
        },
      },
      success: true,
      meta: { to, subject, emailId: (data as Record<string, string>).id },
    };
  } catch (err) {
    return {
      contextDelta: {},
      success: false,
      error: err instanceof Error ? err.message : "E-Mail Versand fehlgeschlagen",
    };
  }
}

/* ── Send Slack Message ── */

export async function executeSendSlack(
  config: Record<string, unknown>,
  context: ExpressionContext
): Promise<ActionNodeResult> {
  const webhookUrl = resolveExpression(
    String(config.webhookUrl || config.channel || ""),
    context
  );
  const message = resolveExpression(String(config.message || ""), context);

  if (!webhookUrl) {
    return {
      contextDelta: {},
      success: false,
      error: "Slack Webhook URL fehlt",
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return {
        contextDelta: {},
        success: false,
        error: `Slack Webhook: ${response.statusText}`,
      };
    }

    return {
      contextDelta: {
        slackSent: {
          channel: config.channel || webhookUrl,
          sentAt: new Date().toISOString(),
        },
      },
      success: true,
      meta: { channel: config.channel },
    };
  } catch (err) {
    return {
      contextDelta: {},
      success: false,
      error: err instanceof Error ? err.message : "Slack Nachricht fehlgeschlagen",
    };
  }
}

/* ── Delay ── */

export async function executeDelay(
  config: Record<string, unknown>
): Promise<ActionNodeResult> {
  const duration = Number(config.duration) || 60;
  const unit = String(config.unit || "seconds");

  let ms: number;
  switch (unit) {
    case "milliseconds":
      ms = duration;
      break;
    case "seconds":
      ms = duration * 1000;
      break;
    case "minutes":
      ms = duration * 60 * 1000;
      break;
    case "hours":
      ms = duration * 60 * 60 * 1000;
      break;
    default:
      ms = duration * 1000;
  }

  // Maximal 1 Stunde, um Runaway-Executions zu verhindern
  ms = Math.min(ms, 3_600_000);

  await new Promise((resolve) => setTimeout(resolve, ms));

  return {
    contextDelta: {
      _lastDelay: {
        duration,
        unit,
        ms,
        completedAt: new Date().toISOString(),
      },
    },
    success: true,
    meta: { duration, unit, ms },
  };
}

/* ── Set Variable ── */

export function executeSetVariable(
  config: Record<string, unknown>,
  context: ExpressionContext
): ActionNodeResult {
  const key = String(config.key || "").trim();

  if (!key) {
    return { contextDelta: {}, success: false, error: "Variable-Key fehlt" };
  }

  // Wert kann ein Template sein
  const rawValue = config.value;
  let resolvedValue: unknown;

  if (typeof rawValue === "string") {
    // Versuche als Expression aufzulösen
    resolvedValue = resolveExpressionDeep(rawValue, context);
  } else {
    resolvedValue = resolveExpressionDeep(rawValue, context);
  }

  const contextDelta: Record<string, unknown> = { [key]: resolvedValue };

  // Wenn der Key mit "variables." beginnt, aktualisiere auch das variables-Objekt
  if (key.startsWith("variables.")) {
    const varName = key.slice("variables.".length);
    const existingVars = (context.variables && typeof context.variables === "object")
      ? { ...(context.variables as Record<string, unknown>) }
      : {};
    existingVars[varName] = resolvedValue;
    contextDelta.variables = existingVars;
  }

  return {
    contextDelta,
    success: true,
    meta: { key, value: resolvedValue },
  };
}

/* ── Dispatcher ── */

export async function executeActionNode(
  nodeType: string,
  config: Record<string, unknown>,
  context: ExpressionContext
): Promise<ActionNodeResult> {
  switch (nodeType) {
    case "http_request":
      return executeHttpRequest(config, context);
    case "send_email":
      return executeSendEmail(config, context);
    case "send_slack":
      return executeSendSlack(config, context);
    case "delay":
      return executeDelay(config);
    case "set_variable":
      return executeSetVariable(config, context);
    default:
      throw new Error(`Unbekannter Action-Node-Typ: ${nodeType}`);
  }
}
