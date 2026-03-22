/**
 * MCP Connection Manager
 * Verwaltet mehrere MCP-Server-Verbindungen pro Agent
 */

import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import { MCPClient, MCPError, type MCPToolDefinition, type MCPAuthConfig } from "./mcp-client";

export interface MCPServerConfig {
  name: string;
  serverUrl: string;
  transport?: "sse" | "streamable_http";
  authType: "none" | "api_key" | "oauth";
  authValue?: string;
}

export interface MCPConnectionInfo {
  id: string;
  name: string;
  serverUrl: string;
  transport: string;
  authType: string;
  status: string;
  toolCount: number;
  enabledToolCount: number;
  lastTestedAt: Date | null;
  lastUsedAt: Date | null;
  lastError: string | null;
}

export interface MCPAggregatedTool {
  serverName: string;
  serverUrl: string;
  connectionId: string;
  originalName: string;
  prefixedName: string; // "mcp__notion__create_page"
  description: string;
  inputSchema: Record<string, unknown>;
}

// In-Memory Cache für Tool-Listen
const toolCache = new Map<string, { tools: MCPAggregatedTool[]; cachedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 Minuten

export class MCPConnectionManager {

  /**
   * Fügt eine neue MCP-Server-Verbindung hinzu
   */
  async addConnection(agentId: string, config: MCPServerConfig): Promise<{ id: string; tools: MCPToolDefinition[] }> {
    // Teste Verbindung zuerst
    const testResult = await this.testConnection(config.serverUrl, {
      type: config.authType,
      value: config.authValue,
    }, (config.transport || "sse") as "sse" | "streamable_http");

    // Auth-Wert verschlüsseln
    const encryptedAuth = config.authValue ? encrypt(config.authValue) : null;

    const connection = await prisma.mCPConnection.create({
      data: {
        agentId,
        name: config.name,
        serverUrl: config.serverUrl,
        transport: config.transport || "sse",
        authType: config.authType,
        encryptedAuthValue: encryptedAuth,
        status: "connected",
        discoveredTools: JSON.parse(JSON.stringify(testResult.tools)),
        enabledTools: JSON.parse(JSON.stringify(testResult.tools.map((t) => t.name))),
        lastTestedAt: new Date(),
      },
    });

    // Cache invalidieren
    this.invalidateCache(agentId);

    return { id: connection.id, tools: testResult.tools };
  }

  /**
   * Entfernt eine Verbindung
   */
  async removeConnection(agentId: string, connectionId: string): Promise<void> {
    await prisma.mCPConnection.deleteMany({
      where: { id: connectionId, agentId },
    });
    this.invalidateCache(agentId);
  }

  /**
   * Gibt alle Verbindungen eines Agents zurück
   */
  async getConnections(agentId: string): Promise<MCPConnectionInfo[]> {
    const connections = await prisma.mCPConnection.findMany({
      where: { agentId },
      orderBy: { createdAt: "asc" },
    });

    return connections.map((c) => {
      const discovered = (c.discoveredTools || []) as unknown as MCPToolDefinition[];
      const enabled = (c.enabledTools || []) as unknown as string[];
      return {
        id: c.id,
        name: c.name,
        serverUrl: c.serverUrl,
        transport: c.transport,
        authType: c.authType,
        status: c.status,
        toolCount: discovered.length,
        enabledToolCount: enabled.length,
        lastTestedAt: c.lastTestedAt,
        lastUsedAt: c.lastUsedAt,
        lastError: c.lastError,
      };
    });
  }

  /**
   * Gibt alle verfügbaren Tools aller MCP-Server eines Agents zurück
   */
  async getAvailableTools(agentId: string): Promise<MCPAggregatedTool[]> {
    // Cache prüfen
    const cached = toolCache.get(agentId);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.tools;
    }

    const connections = await prisma.mCPConnection.findMany({
      where: { agentId, status: { not: "error" } },
    });

    const tools: MCPAggregatedTool[] = [];

    for (const conn of connections) {
      const discovered = (conn.discoveredTools || []) as unknown as MCPToolDefinition[];
      const enabled = new Set((conn.enabledTools || []) as unknown as string[]);
      const serverPrefix = conn.name.toLowerCase().replace(/[^a-z0-9]/g, "_");

      for (const tool of discovered) {
        if (!enabled.has(tool.name)) continue;
        tools.push({
          serverName: conn.name,
          serverUrl: conn.serverUrl,
          connectionId: conn.id,
          originalName: tool.name,
          prefixedName: `mcp__${serverPrefix}__${tool.name}`,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
      }
    }

    toolCache.set(agentId, { tools, cachedAt: Date.now() });
    return tools;
  }

  /**
   * Testet eine Verbindung und gibt discovered tools zurück
   */
  async testConnection(
    serverUrl: string,
    auth: MCPAuthConfig,
    transport: "sse" | "streamable_http" = "sse",
  ): Promise<{ connected: boolean; tools: MCPToolDefinition[]; error?: string }> {
    const client = new MCPClient(serverUrl, auth, transport, 15000);
    try {
      await client.connect();
      const tools = await client.discoverTools();
      await client.disconnect();
      return { connected: true, tools };
    } catch (err) {
      await client.disconnect().catch(() => {});
      const message = err instanceof MCPError ? err.message : (err instanceof Error ? err.message : "Connection failed");
      return { connected: false, tools: [], error: message };
    }
  }

  /**
   * Testet und aktualisiert eine bestehende Verbindung
   */
  async refreshConnection(connectionId: string): Promise<{ connected: boolean; toolCount: number; error?: string }> {
    const conn = await prisma.mCPConnection.findUnique({ where: { id: connectionId } });
    if (!conn) return { connected: false, toolCount: 0, error: "Connection not found" };

    const auth: MCPAuthConfig = {
      type: conn.authType as MCPAuthConfig["type"],
      value: conn.encryptedAuthValue ? decrypt(conn.encryptedAuthValue) : undefined,
    };

    const result = await this.testConnection(
      conn.serverUrl,
      auth,
      conn.transport as "sse" | "streamable_http",
    );

    await prisma.mCPConnection.update({
      where: { id: connectionId },
      data: {
        status: result.connected ? "connected" : "error",
        discoveredTools: result.connected ? JSON.parse(JSON.stringify(result.tools)) : undefined,
        lastTestedAt: new Date(),
        lastError: result.error || null,
      },
    });

    this.invalidateCache(conn.agentId);
    return { connected: result.connected, toolCount: result.tools.length, error: result.error };
  }

  /**
   * Aktualisiert welche Tools aktiviert sind
   */
  async updateEnabledTools(connectionId: string, enabledToolNames: string[]): Promise<void> {
    const conn = await prisma.mCPConnection.findUnique({ where: { id: connectionId } });
    if (!conn) return;

    await prisma.mCPConnection.update({
      where: { id: connectionId },
      data: { enabledTools: JSON.parse(JSON.stringify(enabledToolNames)) },
    });
    this.invalidateCache(conn.agentId);
  }

  /**
   * Gibt einen MCPClient für eine bestimmte Verbindung zurück
   */
  async getClient(connectionId: string): Promise<MCPClient> {
    const conn = await prisma.mCPConnection.findUnique({ where: { id: connectionId } });
    if (!conn) throw new MCPError("not_found", "MCP connection not found");

    const auth: MCPAuthConfig = {
      type: conn.authType as MCPAuthConfig["type"],
      value: conn.encryptedAuthValue ? decrypt(conn.encryptedAuthValue) : undefined,
    };

    return new MCPClient(
      conn.serverUrl,
      auth,
      conn.transport as "sse" | "streamable_http",
    );
  }

  /**
   * Markiert Verbindung als "zuletzt verwendet"
   */
  async markUsed(connectionId: string): Promise<void> {
    await prisma.mCPConnection.update({
      where: { id: connectionId },
      data: { lastUsedAt: new Date() },
    }).catch(() => {});
  }

  private invalidateCache(agentId: string): void {
    toolCache.delete(agentId);
  }
}

// Singleton
export const mcpConnectionManager = new MCPConnectionManager();
