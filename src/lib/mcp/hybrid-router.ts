/**
 * Hybrid Router — MCP first, Computer Use fallback
 * Entscheidet ob eine Aktion via MCP oder Browser ausgeführt wird
 */

import { mcpConnectionManager } from "./mcp-connection-manager";

export interface RouteDecision {
  method: "mcp" | "computer_use";
  // MCP-spezifisch
  server?: string;
  tool?: string;
  connectionId?: string;
  // Computer Use-spezifisch
  url?: string;
  task?: string;
  // Reasoning
  reasoning: string;
  estimatedCreditsSaved?: number;
}

// Mapping: Service-Keywords → MCP-Server-Name-Patterns
const SERVICE_KEYWORDS: Record<string, string[]> = {
  notion: ["notion"],
  github: ["github", "gh"],
  slack: ["slack"],
  gmail: ["gmail", "google_mail"],
  google_calendar: ["calendar", "google_calendar", "gcal"],
  google_sheets: ["sheets", "google_sheets", "spreadsheet"],
  hubspot: ["hubspot", "hub_spot"],
  jira: ["jira", "atlassian_jira"],
  salesforce: ["salesforce", "sfdc"],
  airtable: ["airtable"],
  linear: ["linear"],
  figma: ["figma"],
  asana: ["asana"],
  trello: ["trello"],
  zendesk: ["zendesk"],
  stripe: ["stripe"],
  shopify: ["shopify"],
};

/**
 * Entscheidet ob MCP oder Computer Use genutzt werden soll
 */
export async function routeAction(
  agentId: string,
  action: string,
  target: string,
  preferMCPOverBrowser: boolean = true,
): Promise<RouteDecision> {
  if (!preferMCPOverBrowser) {
    return {
      method: "computer_use",
      url: target,
      task: action,
      reasoning: "MCP preference disabled — using browser",
    };
  }

  // Service aus Aktion/Target erkennen
  const detectedService = detectService(action, target);

  if (!detectedService) {
    return {
      method: "computer_use",
      url: target,
      task: action,
      reasoning: "No known service detected — using browser",
    };
  }

  // Prüfe ob Agent eine MCP-Verbindung für diesen Service hat
  const tools = await mcpConnectionManager.getAvailableTools(agentId);
  const matchingTools = tools.filter((t) => {
    const serverLower = t.serverName.toLowerCase().replace(/[^a-z0-9]/g, "_");
    const patterns = SERVICE_KEYWORDS[detectedService] || [detectedService];
    return patterns.some((p) => serverLower.includes(p));
  });

  if (matchingTools.length === 0) {
    return {
      method: "computer_use",
      url: target,
      task: action,
      reasoning: `Service '${detectedService}' detected but no MCP connection found — using browser`,
    };
  }

  // Finde das beste Tool für die Aktion
  const bestMatch = findBestTool(matchingTools, action);

  if (bestMatch) {
    return {
      method: "mcp",
      server: bestMatch.serverName,
      tool: bestMatch.originalName,
      connectionId: bestMatch.connectionId,
      reasoning: `Using MCP for ${bestMatch.serverName} instead of browser (saved ~20 credits)`,
      estimatedCreditsSaved: 20,
    };
  }

  return {
    method: "computer_use",
    url: target,
    task: action,
    reasoning: `Service '${detectedService}' has MCP connection but no matching tool for this action — using browser`,
  };
}

/**
 * Erkennt einen Service aus Aktion und Ziel
 */
function detectService(action: string, target: string): string | null {
  const combined = `${action} ${target}`.toLowerCase();

  for (const [service, keywords] of Object.entries(SERVICE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (combined.includes(keyword)) {
        return service;
      }
    }
  }

  // URL-basierte Erkennung
  try {
    const url = new URL(target);
    const hostname = url.hostname.replace(/^www\./, "");
    for (const [service, keywords] of Object.entries(SERVICE_KEYWORDS)) {
      if (keywords.some((k) => hostname.includes(k))) {
        return service;
      }
    }
  } catch {
    // Kein gültiger URL — ignorieren
  }

  return null;
}

/**
 * Findet das beste Tool für eine Aktion via einfaches Keyword-Matching
 */
function findBestTool(
  tools: Array<{ serverName: string; originalName: string; connectionId: string; description: string }>,
  action: string,
): { serverName: string; originalName: string; connectionId: string } | null {
  const actionLower = action.toLowerCase();

  // Aktions-Keywords extrahieren
  const actionKeywords = actionLower.split(/\s+/).filter((w) => w.length > 2);

  let bestTool = null;
  let bestScore = 0;

  for (const tool of tools) {
    const toolText = `${tool.originalName} ${tool.description}`.toLowerCase();
    let score = 0;

    for (const keyword of actionKeywords) {
      if (toolText.includes(keyword)) score++;
    }

    if (score > bestScore) {
      bestScore = score;
      bestTool = tool;
    }
  }

  // Mindestens ein Keyword muss matchen
  return bestScore > 0 ? bestTool : null;
}
