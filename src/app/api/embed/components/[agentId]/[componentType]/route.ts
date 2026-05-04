import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  EmbedManager,
  EMBED_COMPONENT_TYPES,
  type EmbedComponentType,
} from "@/lib/embeds/embed-manager";

export const dynamic = "force-dynamic";

// Rate-Limit-Cache: token → { count, windowStart }
const rateLimitCache = new Map<
  string,
  { count: number; windowStart: number }
>();

// Rate-Limit-Cleanup alle 5 Minuten
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitCache.entries()) {
    if (now - value.windowStart > 120_000) {
      rateLimitCache.delete(key);
    }
  }
}, 300_000);

/**
 * Prüft Rate-Limit für ein Token.
 * Gibt true zurück wenn das Limit überschritten ist.
 */
function isRateLimited(token: string, limit: number): boolean {
  const now = Date.now();
  const entry = rateLimitCache.get(token);

  if (!entry || now - entry.windowStart > 60_000) {
    // Neues Fenster starten
    rateLimitCache.set(token, { count: 1, windowStart: now });
    return false;
  }

  entry.count++;
  if (entry.count > limit) {
    return true;
  }

  return false;
}

// CORS-Header für Embed-Anfragen
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204, headers: corsHeaders() });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { agentId: string; componentType: string } }
) {
  const { agentId, componentType } = params;

  // Komponententyp validieren
  if (
    !EMBED_COMPONENT_TYPES.includes(componentType as EmbedComponentType)
  ) {
    return NextResponse.json(
      { error: "Ungültiger Komponententyp" },
      { status: 400, headers: corsHeaders() }
    );
  }

  // Token aus Authorization-Header extrahieren
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return NextResponse.json(
      { error: "Kein Token angegeben" },
      { status: 401, headers: corsHeaders() }
    );
  }

  // Token validieren
  const validation = await EmbedManager.validateToken(
    token,
    agentId,
    componentType as EmbedComponentType
  );

  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error },
      { status: 403, headers: corsHeaders() }
    );
  }

  // Rate-Limit prüfen
  const embedToken = await prisma.embedToken.findUnique({
    where: { token },
    select: { rateLimit: true },
  });

  if (isRateLimited(token, embedToken?.rateLimit || 100)) {
    return NextResponse.json(
      { error: "Rate-Limit überschritten. Bitte warte kurz." },
      { status: 429, headers: corsHeaders() }
    );
  }

  try {
    // Daten je nach Komponententyp laden
    const data = await fetchComponentData(
      agentId,
      componentType as EmbedComponentType,
      request
    );

    return NextResponse.json(
      { data },
      {
        headers: {
          ...corsHeaders(),
          "Cache-Control": "public, max-age=30, s-maxage=30",
        },
      }
    );
  } catch (err) {
    console.error(`[Embed] Fehler bei ${componentType}:`, err);
    return NextResponse.json(
      { error: "Daten konnten nicht geladen werden" },
      { status: 500, headers: corsHeaders() }
    );
  }
}

/**
 * Daten für eine Embed-Komponente laden
 */
async function fetchComponentData(
  agentId: string,
  componentType: EmbedComponentType,
  request: NextRequest
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  switch (componentType) {
    case "price_table":
      return fetchPriceTable(agentId);
    case "diff_timeline":
      return fetchDiffTimeline(agentId);
    case "agent_status":
      return fetchAgentStatus(agentId);
    case "knowledge_search":
      return fetchKnowledgeSearch(agentId, request);
    case "report_viewer":
      return fetchReportViewer(agentId);
    default:
      return null;
  }
}

/**
 * Preistabelle: Letzte Preis-/Vergleichsdaten aus AgentRun
 */
async function fetchPriceTable(agentId: string) {
  const runs = await prisma.agentRun.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { output: true, createdAt: true },
  });

  if (runs.length === 0 || !runs[0].output) return [];

  try {
    const output = JSON.parse(runs[0].output);
    // Preis-Einträge extrahieren (flexibles Format)
    if (Array.isArray(output.prices)) return output.prices;
    if (Array.isArray(output.results)) return output.results;
    if (Array.isArray(output)) return output;
    return [];
  } catch {
    return [];
  }
}

/**
 * Diff Timeline: Letzte Diff-Erkennungsergebnisse
 */
async function fetchDiffTimeline(agentId: string) {
  const runs = await prisma.agentRun.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, output: true, createdAt: true },
  });

  return runs
    .filter((r) => r.output)
    .map((run) => {
      try {
        const output = JSON.parse(run.output!);
        return {
          id: run.id,
          type: output.type || "info",
          title: output.title || output.summary || "Änderung erkannt",
          description: output.description || output.details || "",
          timestamp: run.createdAt.toISOString(),
        };
      } catch {
        return {
          id: run.id,
          type: "info",
          title: "Agent-Ausführung",
          description: run.output?.slice(0, 200) || "",
          timestamp: run.createdAt.toISOString(),
        };
      }
    });
}

/**
 * Agent Status: Status, letzter Lauf, nächster geplanter Lauf
 */
async function fetchAgentStatus(agentId: string) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      status: true,
      lastRunAt: true,
      triggerConfig: true,
      name: true,
    },
  });

  if (!agent) {
    return {
      status: "error",
      label: "Agent nicht gefunden",
      lastRun: null,
      nextScheduled: null,
    };
  }

  // Status-Mapping
  let status: "active" | "warning" | "error" = "active";
  if (agent.status === "DRAFT") status = "warning";
  if (agent.status === "PAUSED") status = "error";

  // Nächsten geplanten Lauf ermitteln
  let nextScheduled: string | null = null;
  if (agent.triggerConfig) {
    const tc = agent.triggerConfig as Record<string, unknown>;
    if (tc.nextRunAt) nextScheduled = tc.nextRunAt as string;
  }

  return {
    status,
    label: agent.name || "Agent",
    lastRun: agent.lastRunAt?.toISOString() || null,
    nextScheduled,
  };
}

/**
 * Wissenssuche: KnowledgeEntity nach Suchbegriff durchsuchen
 */
async function fetchKnowledgeSearch(
  agentId: string,
  request: NextRequest
) {
  const query = request.nextUrl.searchParams.get("q") || "";

  // Agent-Besitzer ermitteln für userId-Filter
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { userId: true },
  });

  if (!agent) return [];

  if (!query || query.length < 2) {
    // Letzte 10 Entitäten anzeigen
    return prisma.knowledgeEntity.findMany({
      where: { userId: agent.userId },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true, type: true, name: true, properties: true },
    });
  }

  // Suche nach Name (case-insensitive)
  return prisma.knowledgeEntity.findMany({
    where: {
      userId: agent.userId,
      name: { contains: query, mode: "insensitive" },
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { id: true, type: true, name: true, properties: true },
  });
}

/**
 * Report Viewer: Letzten Report-Bericht laden
 */
async function fetchReportViewer(agentId: string) {
  const latestRun = await prisma.agentRun.findFirst({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    select: { output: true, createdAt: true },
  });

  if (!latestRun || !latestRun.output) {
    return {
      title: "Kein Report vorhanden",
      summary: "Es wurde noch kein Report für diesen Agent erstellt.",
      createdAt: new Date().toISOString(),
      downloadUrl: null,
    };
  }

  try {
    const output = JSON.parse(latestRun.output);
    return {
      title: output.title || "Agent Report",
      summary:
        output.summary || output.report || latestRun.output.slice(0, 500),
      createdAt: latestRun.createdAt.toISOString(),
      downloadUrl: output.downloadUrl || output.url || null,
    };
  } catch {
    return {
      title: "Agent Report",
      summary: latestRun.output.slice(0, 500),
      createdAt: latestRun.createdAt.toISOString(),
      downloadUrl: null,
    };
  }
}
