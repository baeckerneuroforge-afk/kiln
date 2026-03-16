/**
 * HTTP client that proxies MCP tool calls to the remote KILN API.
 * Sends JSON-RPC 2.0 messages to the KILN MCP endpoint.
 */
export class KilnClient {
    apiKey;
    baseUrl;
    requestId = 0;
    constructor(apiKey, baseUrl = "https://kilnbase.com/api/mcp") {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }
    async callTool(name, args) {
        const id = ++this.requestId;
        let response;
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
        }
        catch (e) {
            return error(`Failed to connect to KILN API: ${e instanceof Error ? e.message : "Network error"}`);
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
        const json = (await response.json());
        if (json.error) {
            return error(json.error.message || "Unknown API error");
        }
        return json.result || ok("No response from server.");
    }
}
// Helpers matching the remote server's response format
export function ok(data) {
    return {
        content: [
            {
                type: "text",
                text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
            },
        ],
    };
}
export function error(message) {
    return {
        content: [{ type: "text", text: message }],
        isError: true,
    };
}
//# sourceMappingURL=client.js.map