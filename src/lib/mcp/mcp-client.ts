/**
 * MCP Client — Verbindet sich mit externen MCP Servern
 * Nutzt @modelcontextprotocol/sdk für standardkonforme Kommunikation
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPAuthConfig {
  type: "none" | "api_key" | "oauth";
  value?: string;
  headerName?: string; // Default: "Authorization"
}

export interface MCPCallResult {
  success: boolean;
  content: unknown;
  error?: string;
  isError?: boolean;
}

export class MCPClient {
  private client: Client | null = null;
  private transport: SSEClientTransport | StreamableHTTPClientTransport | null = null;
  private serverUrl: string;
  private authConfig: MCPAuthConfig;
  private transportType: "sse" | "streamable_http";
  private timeoutMs: number;
  private connected = false;

  constructor(
    serverUrl: string,
    authConfig: MCPAuthConfig = { type: "none" },
    transportType: "sse" | "streamable_http" = "sse",
    timeoutMs: number = 30000,
  ) {
    this.serverUrl = serverUrl;
    this.authConfig = authConfig;
    this.transportType = transportType;
    this.timeoutMs = timeoutMs;
  }

  async connect(): Promise<void> {
    if (this.connected && this.client) return;

    try {
      this.client = new Client({
        name: "kiln-mcp-client",
        version: "1.0.0",
      }, {
        capabilities: {},
      });

      const url = new URL(this.serverUrl);
      const headers: Record<string, string> = {};

      if (this.authConfig.type === "api_key" && this.authConfig.value) {
        const headerName = this.authConfig.headerName || "Authorization";
        headers[headerName] = headerName.toLowerCase() === "authorization"
          ? `Bearer ${this.authConfig.value}`
          : this.authConfig.value;
      } else if (this.authConfig.type === "oauth" && this.authConfig.value) {
        headers["Authorization"] = `Bearer ${this.authConfig.value}`;
      }

      if (this.transportType === "streamable_http") {
        this.transport = new StreamableHTTPClientTransport(url, {
          requestInit: { headers },
        });
      } else {
        this.transport = new SSEClientTransport(url, {
          requestInit: { headers },
          eventSourceInit: { fetch: (input: string | URL | Request, init?: RequestInit) => {
            return fetch(input, { ...init, headers: { ...headers, ...(init?.headers as Record<string, string> || {}) } });
          }},
        });
      }

      await this.client.connect(this.transport);
      this.connected = true;
    } catch (err) {
      this.connected = false;
      this.client = null;
      this.transport = null;

      if (err instanceof Error) {
        if (err.message.includes("401") || err.message.includes("403") || err.message.includes("Unauthorized")) {
          throw new MCPError("auth_failed", `Authentication failed: ${err.message}`);
        }
        if (err.message.includes("ECONNREFUSED") || err.message.includes("fetch failed")) {
          throw new MCPError("connection_refused", `Cannot connect to MCP server at ${this.serverUrl}: ${err.message}`);
        }
      }
      throw new MCPError("connection_failed", `Failed to connect: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  async discoverTools(): Promise<MCPToolDefinition[]> {
    await this.ensureConnected();
    if (!this.client) throw new MCPError("not_connected", "Client not connected");

    try {
      const result = await this.client.listTools();
      return (result.tools || []).map((tool) => ({
        name: tool.name,
        description: tool.description || "",
        inputSchema: (tool.inputSchema || {}) as Record<string, unknown>,
      }));
    } catch (err) {
      throw new MCPError("discovery_failed", `Failed to discover tools: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<MCPCallResult> {
    await this.ensureConnected();
    if (!this.client) throw new MCPError("not_connected", "Client not connected");

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const result = await this.client.callTool({
        name: toolName,
        arguments: args,
      }, undefined, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const content = result.content;
      const isError = result.isError === true;

      // Extrahiere Text-Content
      let extractedContent: unknown = content;
      if (Array.isArray(content)) {
        const textBlocks = content.filter((c) => c.type === "text");
        if (textBlocks.length === 1) {
          try {
            extractedContent = JSON.parse(textBlocks[0].text);
          } catch {
            extractedContent = textBlocks[0].text;
          }
        } else if (textBlocks.length > 1) {
          extractedContent = textBlocks.map((b) => b.text).join("\n");
        }
      }

      return {
        success: !isError,
        content: extractedContent,
        isError,
        error: isError ? String(extractedContent) : undefined,
      };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new MCPError("timeout", `Tool call '${toolName}' timed out after ${this.timeoutMs}ms`);
      }
      throw new MCPError("call_failed", `Tool call '${toolName}' failed: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try { await this.client.close(); } catch { /* ignore */ }
    }
    if (this.transport) {
      try { await this.transport.close(); } catch { /* ignore */ }
    }
    this.client = null;
    this.transport = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected || !this.client) {
      await this.connect();
    }
  }
}

export class MCPError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MCPError";
    this.code = code;
  }
}
