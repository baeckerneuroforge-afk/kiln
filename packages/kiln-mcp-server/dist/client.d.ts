/**
 * HTTP client that proxies MCP tool calls to the remote KILN API.
 * Sends JSON-RPC 2.0 messages to the KILN MCP endpoint.
 */
export type ToolResult = {
    [key: string]: unknown;
    content: {
        type: "text";
        text: string;
    }[];
    isError?: boolean;
};
export declare class KilnClient {
    private apiKey;
    private baseUrl;
    private requestId;
    constructor(apiKey: string, baseUrl?: string);
    callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
}
export declare function ok(data: unknown): ToolResult;
export declare function error(message: string): ToolResult;
//# sourceMappingURL=client.d.ts.map