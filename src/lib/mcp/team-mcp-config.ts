/**
 * Team MCP Config
 * Weist MCP-Verbindungen bestimmten Team-Rollen zu
 */

import { prisma } from "@/lib/prisma";
import { mcpConnectionManager, type MCPAggregatedTool } from "./mcp-connection-manager";

export interface TeamMCPTemplate {
  name: string;
  description: string;
  roleAssignments: Record<string, string[]>; // role → MCP server names
}

// Vorgefertigte Templates
export const TEAM_MCP_TEMPLATES: TeamMCPTemplate[] = [
  {
    name: "Sales Team",
    description: "CRM-focused with communication and data tools",
    roleAssignments: {
      HEAD: ["slack", "gmail"],
      COORDINATOR: ["slack"],
      EXECUTOR: ["hubspot", "google_calendar"],
      REPORTER: ["google_sheets", "notion"],
    },
  },
  {
    name: "Support Team",
    description: "Ticket management with knowledge base access",
    roleAssignments: {
      HEAD: ["slack", "zendesk"],
      COORDINATOR: ["slack"],
      EXECUTOR: ["jira", "github"],
      REPORTER: ["notion"],
    },
  },
  {
    name: "Content Team",
    description: "Content creation and publishing workflow",
    roleAssignments: {
      HEAD: ["slack"],
      COORDINATOR: ["notion"],
      EXECUTOR: ["notion", "airtable"],
      REPORTER: ["google_sheets"],
    },
  },
];

/**
 * Weist MCP-Verbindungen einer Team-Rolle zu
 */
export async function assignMCPToRole(
  teamId: string,
  role: string,
  mcpConnectionIds: string[],
): Promise<void> {
  await prisma.mCPTeamRoleConfig.upsert({
    where: { teamId_role: { teamId, role } },
    create: {
      teamId,
      role,
      mcpConnectionIds: JSON.parse(JSON.stringify(mcpConnectionIds)),
    },
    update: {
      mcpConnectionIds: JSON.parse(JSON.stringify(mcpConnectionIds)),
    },
  });
}

/**
 * Gibt nur die MCP-Tools zurück, die eine bestimmte Rolle verwenden darf
 */
export async function getRoleMCPTools(
  teamId: string,
  role: string,
  agentId: string,
): Promise<MCPAggregatedTool[]> {
  const roleConfig = await prisma.mCPTeamRoleConfig.findUnique({
    where: { teamId_role: { teamId, role } },
  });

  // Kein Config → alle Tools verfügbar (Backward Compatibility)
  if (!roleConfig) {
    return mcpConnectionManager.getAvailableTools(agentId);
  }

  const allowedIds = new Set((roleConfig.mcpConnectionIds as string[]) || []);
  const allTools = await mcpConnectionManager.getAvailableTools(agentId);

  return allTools.filter((t) => allowedIds.has(t.connectionId));
}

/**
 * Gibt alle Rollen-Konfigurationen eines Teams zurück
 */
export async function getTeamMCPConfig(
  teamId: string,
): Promise<Record<string, string[]>> {
  const configs = await prisma.mCPTeamRoleConfig.findMany({
    where: { teamId },
  });

  const result: Record<string, string[]> = {};
  for (const config of configs) {
    result[config.role] = (config.mcpConnectionIds as string[]) || [];
  }
  return result;
}

/**
 * Entfernt alle MCP-Konfigurationen eines Teams
 */
export async function clearTeamMCPConfig(teamId: string): Promise<void> {
  await prisma.mCPTeamRoleConfig.deleteMany({ where: { teamId } });
}
