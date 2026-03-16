/**
 * HTTP client that proxies MCP tool calls to the remote KILN API.
 * Sends JSON-RPC 2.0 messages to the KILN MCP endpoint.
 */

// Use index-signature-compatible type to satisfy McpServer's CallToolResult
export type ToolResult = {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

interface JsonRpcResponse {
  jsonrpc: "2.0";
  result?: ToolResult;
  error?: { code: number; message: string; data?: unknown };
  id: number;
}

export class KilnClient {
  private requestId = 0;

  constructor(
    private apiKey: string,
    private baseUrl: string = "https://kilnbase.com/api/mcp"
  ) {}

  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const id = ++this.requestId;

    let response: Response;
    try {
      response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: { name, arguments: args },
          id,
        }),
      });
    } catch (e) {
      return error(
        `Failed to connect to KILN API: ${e instanceof Error ? e.message : "Network error"}`
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      if (response.status === 401) {
        return error("Authentication failed. Check your API key.");
      }
      if (response.status === 429) {
        return error("Rate limit exceeded. Wait a moment and try again.");
      }
      return error(`KILN API error (${response.status}): ${text || response.statusText}`);
    }

    const json = (await response.json()) as JsonRpcResponse;

    if (json.error) {
      return error(json.error.message || "Unknown API error");
    }

    return json.result || ok("No response from server.");
  }
}

// Helpers matching the remote server's response format
export function ok(data: unknown): ToolResult {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function error(message: string): ToolResult {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}
