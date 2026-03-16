#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { KilnClient } from "./client.js";
import { createServer } from "./server.js";
// ── Parse CLI arguments ──
function parseArgs() {
    const args = process.argv.slice(2);
    let apiKey = process.env.KILN_API_KEY || "";
    let baseUrl = process.env.KILN_API_URL || "https://kilnbase.com/api/mcp";
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if ((arg === "--api-key" || arg === "-k") && args[i + 1]) {
            apiKey = args[++i];
        }
        else if ((arg === "--url" || arg === "-u") && args[i + 1]) {
            baseUrl = args[++i];
        }
        else if (arg === "--help" || arg === "-h") {
            printHelp();
            process.exit(0);
        }
        else if (arg === "--version" || arg === "-v") {
            console.log("@kilnbase/mcp-server v0.1.0");
            process.exit(0);
        }
    }
    if (!apiKey) {
        console.error("Error: API key required.\n\n" +
            "  kiln-mcp --api-key sk-kiln-YOUR_KEY\n\n" +
            "Or set the KILN_API_KEY environment variable.\n" +
            "Generate a key at: https://kilnbase.com/dashboard/settings\n");
        process.exit(1);
    }
    return { apiKey, baseUrl };
}
function printHelp() {
    console.log(`
@kilnbase/mcp-server — KILN AI Agent MCP Server

Usage:
  kiln-mcp --api-key <key>        Start the MCP server
  kiln-mcp --help                 Show this help
  kiln-mcp --version              Show version

Options:
  --api-key, -k <key>   KILN API key (or set KILN_API_KEY env var)
  --url, -u <url>        KILN API URL (default: https://kilnbase.com/api/mcp)

Environment Variables:
  KILN_API_KEY           API key for authentication
  KILN_API_URL           Custom API endpoint URL

Examples:
  # Start with API key
  kiln-mcp --api-key sk-kiln-abc123

  # Use with npx
  npx @kilnbase/mcp-server --api-key sk-kiln-abc123

  # Use environment variable
  export KILN_API_KEY=sk-kiln-abc123
  kiln-mcp

Generate an API key at https://kilnbase.com/dashboard/settings
`);
}
// ── Main ──
async function main() {
    const { apiKey, baseUrl } = parseArgs();
    const client = new KilnClient(apiKey, baseUrl);
    const server = createServer(client);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Graceful shutdown
    process.on("SIGINT", async () => {
        await server.close();
        process.exit(0);
    });
    process.on("SIGTERM", async () => {
        await server.close();
        process.exit(0);
    });
}
main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map