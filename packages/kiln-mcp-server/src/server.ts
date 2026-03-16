import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { KilnClient } from "./client.js";
import { registerAgentTools } from "./tools/agents.js";
import { registerKnowledgeTools } from "./tools/knowledge.js";
import { registerTeamTools } from "./tools/teams.js";
import { registerChatTools } from "./tools/chat.js";
import { registerMarketplaceTools } from "./tools/marketplace.js";

export function createServer(client: KilnClient): McpServer {
  const server = new McpServer(
    { name: "kiln-mcp", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "KILN AI Creation Platform MCP Server. Create, deploy, and manage AI agents, knowledge bases, teams, automations, and conversations programmatically.",
    }
  );

  registerAgentTools(server, client);
  registerKnowledgeTools(server, client);
  registerTeamTools(server, client);
  registerChatTools(server, client);
  registerMarketplaceTools(server, client);

  return server;
}
