/**
 * API Autodiscovery — Agent Reads Docs, Builds Integration
 * Browst API-Dokumentation, versteht Endpoints, generiert Integration,
 * testet sie, und registriert sie als Agent-Tool.
 */

import { prisma } from "@/lib/prisma";

/* ── Types ── */

export interface ApiEndpoint {
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  description: string;
  params?: Array<{ name: string; type: string; required: boolean; description: string }>;
  bodySchema?: Record<string, unknown>;
  responseSchema?: Record<string, unknown>;
}

export interface ApiSpec {
  serviceName: string;
  baseUrl: string;
  auth: {
    type: "api_key" | "bearer" | "oauth" | "basic" | "none";
    headerName?: string;
    tokenUrl?: string;
    prefix?: string; // z.B. "Bearer " oder "Token "
  };
  endpoints: ApiEndpoint[];
  documentation: string; // URL der Dokumentation
}

export interface ToolDefinition {
  name: string;
  description: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  bodyTemplate?: string;
  responseMapping?: string;
}

export interface DiscoveryResult {
  discoveryId: string;
  status: string;
  apiSpec?: ApiSpec;
  generatedCode?: string;
  toolDefinitions?: ToolDefinition[];
  testResults?: Array<{ endpoint: string; success: boolean; statusCode?: number; error?: string }>;
}

const DISCOVERY_MODEL = "claude-sonnet-4-6";

/* ── API Discovery ── */

/**
 * Startet den API-Discovery-Prozess.
 */
export async function startDiscovery(
  agentId: string,
  userId: string,
  serviceName: string,
  docsUrl?: string,
): Promise<string> {
  const discovery = await prisma.apiDiscovery.create({
    data: {
      agentId,
      userId,
      serviceName,
      docsUrl,
      status: docsUrl ? "READING_DOCS" : "SEARCHING",
    },
  });
  return discovery.id;
}

/**
 * Vollständiger Discovery-Prozess (async).
 */
export async function processDiscovery(
  discoveryId: string,
  apiKey?: string,
): Promise<void> {
  try {
    const discovery = await prisma.apiDiscovery.findUnique({
      where: { id: discoveryId },
    });
    if (!discovery) return;

    let docsUrl = discovery.docsUrl;

    // Step 1: Docs-URL finden falls nicht angegeben
    if (!docsUrl) {
      await updateDiscoveryStatus(discoveryId, "SEARCHING");
      docsUrl = await findDocsUrl(discovery.serviceName);
      if (docsUrl) {
        await prisma.apiDiscovery.update({
          where: { id: discoveryId },
          data: { docsUrl },
        });
      }
    }

    if (!docsUrl) {
      await updateDiscoveryStatus(discoveryId, "FAILED", "Keine API-Dokumentation gefunden");
      return;
    }

    // Step 2: Dokumentation lesen und API-Spec extrahieren
    await updateDiscoveryStatus(discoveryId, "READING_DOCS");
    const apiSpec = await readAndExtractApiSpec(discovery.serviceName, docsUrl);

    if (!apiSpec || apiSpec.endpoints.length === 0) {
      await updateDiscoveryStatus(discoveryId, "FAILED", "Keine Endpoints in der Dokumentation gefunden");
      return;
    }

    await prisma.apiDiscovery.update({
      where: { id: discoveryId },
      data: { apiSpec: JSON.parse(JSON.stringify(apiSpec)) },
    });

    // Step 3: TypeScript-Integration generieren
    await updateDiscoveryStatus(discoveryId, "GENERATING");
    const generatedCode = generateIntegrationCode(apiSpec);
    const toolDefinitions = generateToolDefinitions(apiSpec);

    await prisma.apiDiscovery.update({
      where: { id: discoveryId },
      data: {
        generatedCode,
        toolDefinitions: JSON.parse(JSON.stringify(toolDefinitions)),
      },
    });

    // Step 4: Testen (wenn API-Key vorhanden)
    let testResults: Array<{ endpoint: string; success: boolean; statusCode?: number; error?: string }> = [];
    if (apiKey) {
      await updateDiscoveryStatus(discoveryId, "TESTING");
      testResults = await testEndpoints(apiSpec, apiKey);
      await prisma.apiDiscovery.update({
        where: { id: discoveryId },
        data: { testResults: JSON.parse(JSON.stringify(testResults)) },
      });
    }

    // Step 5: Fertig
    await updateDiscoveryStatus(discoveryId, "COMPLETED");
  } catch (err) {
    await updateDiscoveryStatus(
      discoveryId,
      "FAILED",
      err instanceof Error ? err.message : "Unbekannter Fehler",
    );
  }
}

/**
 * Sucht die API-Dokumentation eines Services.
 */
async function findDocsUrl(serviceName: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `Was ist die offizielle API-Dokumentations-URL für "${serviceName}"? Antworte NUR mit der URL, nichts anderes. Wenn du es nicht weißt, antworte "UNKNOWN".`,
        }],
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
    };
    const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();

    if (text === "UNKNOWN" || !text.startsWith("http")) return null;
    return text;
  } catch {
    return null;
  }
}

/**
 * Liest API-Dokumentation und extrahiert eine strukturierte API-Spec.
 */
async function readAndExtractApiSpec(serviceName: string, docsUrl: string): Promise<ApiSpec | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  // Dokumentation abrufen
  let docsContent = "";
  try {
    const response = await fetch(docsUrl, {
      headers: { "User-Agent": "KILN-API-Discoverer/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) {
      const html = await response.text();
      // HTML zu Text konvertieren (vereinfacht)
      docsContent = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 15000); // Max 15k Zeichen für LLM
    }
  } catch {
    // Konnte Docs nicht laden — LLM soll aus Wissen antworten
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DISCOVERY_MODEL,
        max_tokens: 3000,
        system: `Du bist ein API-Analyst. Extrahiere die API-Spezifikation aus der Dokumentation.

Antworte NUR als JSON:
{
  "serviceName": "Name",
  "baseUrl": "https://api.service.com/v1",
  "auth": {
    "type": "api_key" | "bearer" | "oauth" | "basic" | "none",
    "headerName": "Authorization" | "X-API-Key" | etc,
    "prefix": "Bearer " | "Token " | ""
  },
  "endpoints": [
    {
      "name": "listContacts",
      "method": "GET",
      "path": "/contacts",
      "description": "Listet alle Kontakte",
      "params": [{ "name": "limit", "type": "number", "required": false, "description": "Max Ergebnisse" }],
      "bodySchema": null,
      "responseSchema": { "data": "Contact[]" }
    }
  ],
  "documentation": "${docsUrl}"
}

Fokus auf die wichtigsten CRUD-Endpoints (max 10).`,
        messages: [{
          role: "user",
          content: `Service: ${serviceName}\nDokumentation URL: ${docsUrl}\n\n${docsContent ? `Dokumentations-Inhalt:\n${docsContent}` : "Dokumentation konnte nicht geladen werden — nutze dein Wissen über diese API."}`,
        }],
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!response.ok) return null;

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
    };
    const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]) as ApiSpec;
  } catch {
    return null;
  }
}

/* ── Code Generation ── */

/**
 * Generiert TypeScript-Integrationscode aus einer API-Spec.
 */
export function generateIntegrationCode(spec: ApiSpec): string {
  const lines: string[] = [];

  lines.push(`/**`);
  lines.push(` * ${spec.serviceName} Integration — Auto-generated by KILN`);
  lines.push(` * Base URL: ${spec.baseUrl}`);
  lines.push(` * Auth: ${spec.auth.type}`);
  lines.push(` */`);
  lines.push(``);
  lines.push(`const BASE_URL = "${spec.baseUrl}";`);
  lines.push(``);

  // Auth-Header-Funktion
  lines.push(`function getAuthHeaders(apiKey: string): Record<string, string> {`);
  switch (spec.auth.type) {
    case "api_key":
      lines.push(`  return { "${spec.auth.headerName || "X-API-Key"}": apiKey };`);
      break;
    case "bearer":
      lines.push(`  return { "Authorization": "${spec.auth.prefix || "Bearer "}$\{apiKey}" };`);
      break;
    case "basic":
      lines.push(`  return { "Authorization": "Basic " + btoa(apiKey) };`);
      break;
    default:
      lines.push(`  return {};`);
  }
  lines.push(`}`);
  lines.push(``);

  // Endpoint-Funktionen generieren
  for (const ep of spec.endpoints) {
    const fnName = ep.name.replace(/[^a-zA-Z0-9]/g, "_");
    const params: string[] = ["apiKey: string"];

    // Path-Parameter
    const pathParams = ep.path.match(/\{(\w+)\}/g) || [];
    for (const pp of pathParams) {
      const name = pp.replace(/[{}]/g, "");
      params.push(`${name}: string`);
    }

    // Body
    if (["POST", "PUT", "PATCH"].includes(ep.method)) {
      params.push("body?: Record<string, unknown>");
    }

    // Query-Parameter
    if (ep.params && ep.params.length > 0) {
      params.push("params?: Record<string, string | number>");
    }

    lines.push(`/** ${ep.description} */`);
    lines.push(`export async function ${fnName}(${params.join(", ")}) {`);

    let pathExpr = `\`\${BASE_URL}${ep.path}\``;
    for (const pp of pathParams) {
      const name = pp.replace(/[{}]/g, "");
      pathExpr = pathExpr.replace(pp, `\${${name}}`);
    }

    if (ep.params && ep.params.length > 0) {
      lines.push(`  const url = new URL(${pathExpr});`);
      lines.push(`  if (params) {`);
      lines.push(`    for (const [k, v] of Object.entries(params)) {`);
      lines.push(`      url.searchParams.set(k, String(v));`);
      lines.push(`    }`);
      lines.push(`  }`);
      lines.push(`  const response = await fetch(url.toString(), {`);
    } else {
      lines.push(`  const response = await fetch(${pathExpr}, {`);
    }

    lines.push(`    method: "${ep.method}",`);
    lines.push(`    headers: {`);
    lines.push(`      ...getAuthHeaders(apiKey),`);
    if (["POST", "PUT", "PATCH"].includes(ep.method)) {
      lines.push(`      "Content-Type": "application/json",`);
    }
    lines.push(`    },`);
    if (["POST", "PUT", "PATCH"].includes(ep.method)) {
      lines.push(`    body: body ? JSON.stringify(body) : undefined,`);
    }
    lines.push(`  });`);
    lines.push(`  if (!response.ok) throw new Error(\`${fnName} failed: \${response.status}\`);`);
    lines.push(`  return response.json();`);
    lines.push(`}`);
    lines.push(``);
  }

  return lines.join("\n");
}

/**
 * Konvertiert API-Spec in KILN Agent Tool-Definitionen.
 */
export function generateToolDefinitions(spec: ApiSpec): ToolDefinition[] {
  return spec.endpoints.map((ep) => {
    const authHeader = spec.auth.type === "api_key"
      ? { [spec.auth.headerName || "X-API-Key"]: "{{apiKey}}" }
      : spec.auth.type === "bearer"
        ? { Authorization: `${spec.auth.prefix || "Bearer "}{{apiKey}}` }
        : {};

    const tool: ToolDefinition = {
      name: `${spec.serviceName.toLowerCase().replace(/\s+/g, "_")}_${ep.name}`,
      description: `${spec.serviceName}: ${ep.description}`,
      method: ep.method,
      url: `${spec.baseUrl}${ep.path}`,
      headers: {
        ...authHeader,
        ...(["POST", "PUT", "PATCH"].includes(ep.method) ? { "Content-Type": "application/json" } : {}),
      } as Record<string, string>,
    };

    if (ep.bodySchema) {
      tool.bodyTemplate = JSON.stringify(ep.bodySchema, null, 2);
    }

    return tool;
  });
}

/* ── Testing ── */

/**
 * Testet Endpoints mit einem echten API-Key.
 * Nur sichere GET-Requests werden automatisch getestet.
 */
async function testEndpoints(
  spec: ApiSpec,
  apiKey: string,
): Promise<Array<{ endpoint: string; success: boolean; statusCode?: number; error?: string }>> {
  const results: Array<{ endpoint: string; success: boolean; statusCode?: number; error?: string }> = [];

  // Nur GET-Endpoints testen (sicher, keine Seiteneffekte)
  const safeEndpoints = spec.endpoints.filter((ep) => ep.method === "GET");

  for (const ep of safeEndpoints.slice(0, 3)) { // Max 3 Tests
    try {
      const authHeaders: Record<string, string> = {};
      if (spec.auth.type === "api_key") {
        authHeaders[spec.auth.headerName || "X-API-Key"] = apiKey;
      } else if (spec.auth.type === "bearer") {
        authHeaders.Authorization = `${spec.auth.prefix || "Bearer "}${apiKey}`;
      }

      // Path-Parameter durch Platzhalter ersetzen
      let path = ep.path.replace(/\{[^}]+\}/g, "test");
      // Query-Parameter für Limit hinzufügen
      if (!path.includes("?")) path += "?limit=1";

      const response = await fetch(`${spec.baseUrl}${path}`, {
        method: "GET",
        headers: { ...authHeaders, "User-Agent": "KILN-API-Test/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      results.push({
        endpoint: `${ep.method} ${ep.path}`,
        success: response.ok,
        statusCode: response.status,
      });
    } catch (err) {
      results.push({
        endpoint: `${ep.method} ${ep.path}`,
        success: false,
        error: err instanceof Error ? err.message : "Fehler",
      });
    }
  }

  return results;
}

/* ── Activation ── */

/**
 * Aktiviert eine entdeckte API als Agent-Tools.
 */
export async function activateDiscovery(discoveryId: string): Promise<void> {
  const discovery = await prisma.apiDiscovery.findUnique({
    where: { id: discoveryId },
  });

  if (!discovery || discovery.status !== "COMPLETED") {
    throw new Error("Discovery nicht abgeschlossen");
  }

  const toolDefs = discovery.toolDefinitions as unknown as ToolDefinition[];
  if (!toolDefs || toolDefs.length === 0) {
    throw new Error("Keine Tool-Definitionen vorhanden");
  }

  // Tools als AgentCustomTool registrieren
  for (const tool of toolDefs) {
    await prisma.agentCustomTool.create({
      data: {
        agentId: discovery.agentId,
        name: tool.name,
        description: tool.description,
        method: tool.method,
        url: tool.url,
        headers: tool.headers ? JSON.parse(JSON.stringify(tool.headers)) : undefined,
        bodyTemplate: tool.bodyTemplate || null,
        responseMapping: tool.responseMapping || null,
        enabled: true,
      },
    });
  }

  await prisma.apiDiscovery.update({
    where: { id: discoveryId },
    data: { isActivated: true },
  });
}

/* ── Helpers ── */

async function updateDiscoveryStatus(id: string, status: string, errorMessage?: string): Promise<void> {
  await prisma.apiDiscovery.update({
    where: { id },
    data: { status, errorMessage: errorMessage || null },
  }).catch(() => {});
}
