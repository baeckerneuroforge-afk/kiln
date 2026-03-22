/**
 * MCP Tool Bridge
 * Bridges MCP tools into KILN's existing agent tool system.
 * Converts MCP tool schemas to Anthropic.Tool format and routes execution.
 */

import Anthropic from "@anthropic-ai/sdk";
import { mcpConnectionManager, type MCPAggregatedTool } from "./mcp-connection-manager";
import { MCPError } from "./mcp-client";

/**
 * Gibt MCP-Tools als Anthropic.Tool[] zurück, bereit für buildTools()-Integration
 */
export async function getMCPToolDefinitions(agentId: string): Promise<Anthropic.Tool[]> {
  const mcpTools = await mcpConnectionManager.getAvailableTools(agentId);
  return mcpTools.map(convertToAnthropicTool);
}

/**
 * Konvertiert ein MCP-Tool in Anthropic.Tool Format
 */
function convertToAnthropicTool(tool: MCPAggregatedTool): Anthropic.Tool {
  const schema = tool.inputSchema || {};

  // MCP inputSchema ist bereits JSON Schema — direkt verwenden
  const inputSchema: Anthropic.Tool["input_schema"] = {
    type: "object" as const,
    properties: (schema.properties || {}) as Record<string, unknown>,
    required: (schema.required || []) as string[],
  };

  return {
    name: tool.prefixedName,
    description: `[${tool.serverName}] ${tool.description}`,
    input_schema: inputSchema,
  };
}

/**
 * Führt einen MCP-Tool-Call aus.
 * Wird aufgerufen wenn toolName mit "mcp__" beginnt.
 */
export async function executeMCPTool(
  agentId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  // Parse: "mcp__notion__create_page" → serverPrefix="notion", originalTool="create_page"
  const parts = toolName.replace(/^mcp__/, "").split("__");
  if (parts.length < 2) {
    return JSON.stringify({ success: false, error: `Invalid MCP tool name: ${toolName}` });
  }

  const serverPrefix = parts[0];
  const originalToolName = parts.slice(1).join("__");

  // Finde die richtige Verbindung
  const allTools = await mcpConnectionManager.getAvailableTools(agentId);
  const matchedTool = allTools.find((t) => t.prefixedName === toolName);

  if (!matchedTool) {
    return JSON.stringify({
      success: false,
      error: `MCP tool not found: ${originalToolName} on server ${serverPrefix}`,
    });
  }

  let client;
  try {
    client = await mcpConnectionManager.getClient(matchedTool.connectionId);
    await client.connect();
    const result = await client.callTool(originalToolName, args);

    // Mark as used (fire-and-forget)
    mcpConnectionManager.markUsed(matchedTool.connectionId);

    return JSON.stringify({
      success: result.success,
      data: result.content,
      error: result.error || undefined,
      source: `mcp:${matchedTool.serverName}`,
    });
  } catch (err) {
    const errorMessage = err instanceof MCPError
      ? `MCP ${err.code}: ${err.message}`
      : (err instanceof Error ? err.message : "MCP tool execution failed");

    return JSON.stringify({
      success: false,
      error: errorMessage,
      source: `mcp:${matchedTool.serverName}`,
    });
  } finally {
    if (client) {
      await client.disconnect().catch(() => {});
    }
  }
}

/**
 * Prüft ob ein Tool-Name ein MCP-Tool ist
 */
export function isMCPToolName(toolName: string): boolean {
  return toolName.startsWith("mcp__");
}
