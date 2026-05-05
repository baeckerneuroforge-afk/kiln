"use client";

import { useState, useEffect, useCallback } from "react";
import { Plug, Info, RefreshCw, Loader2 } from "lucide-react";

interface ConfigProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

interface MCPConnection {
  id: string;
  name: string;
  status: string;
  discoveredTools: MCPTool[];
  enabledTools: string[];
}

interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * MCP Tool Node — Workflow-Konfiguration für explizite MCP-Tool-Nutzung.
 * Nutzer wählt: MCP Server → Tool → Parameter.
 */
export function MCPToolConfig({ config, onChange }: ConfigProps) {
  const [connections, setConnections] = useState<MCPConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingTools, setLoadingTools] = useState(false);

  const selectedConnectionId = String(config.mcpConnectionId || "");
  const selectedTool = String(config.toolName || "");
  const toolParams = (config.toolParams || {}) as Record<string, string>;
  const resultKey = String(config.resultKey || "mcpResult");
  const agentId = String(config.agentId || "");

  // Verbindungen laden
  const loadConnections = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/mcp`);
      if (res.ok) {
        const data = await res.json();
        setConnections(data.connections || []);
      }
    } catch {
      // Fehler ignorieren
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  // Tools für gewählte Verbindung laden
  const loadToolDetails = useCallback(async () => {
    if (!agentId || !selectedConnectionId) return;
    setLoadingTools(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/mcp/${selectedConnectionId}`);
      if (res.ok) {
        const data = await res.json();
        setConnections((prev) =>
          prev.map((c) =>
            c.id === selectedConnectionId
              ? { ...c, discoveredTools: data.discoveredTools || [], enabledTools: data.enabledTools || [] }
              : c,
          ),
        );
      }
    } catch {
      // Fehler ignorieren
    } finally {
      setLoadingTools(false);
    }
  }, [agentId, selectedConnectionId]);

  useEffect(() => {
    loadToolDetails();
  }, [loadToolDetails]);

  const selectedConnection = connections.find((c) => c.id === selectedConnectionId);
  const availableTools = selectedConnection?.discoveredTools?.filter(
    (t) => (selectedConnection.enabledTools || []).includes(t.name),
  ) || [];
  const selectedToolDef = availableTools.find((t) => t.name === selectedTool);

  // Input-Schema Parameter extrahieren
  const paramFields: { name: string; type: string; description?: string; required: boolean }[] = [];
  if (selectedToolDef?.inputSchema) {
    const schema = selectedToolDef.inputSchema;
    const properties = (schema.properties || {}) as Record<string, { type?: string; description?: string }>;
    const required = (schema.required || []) as string[];
    for (const [name, prop] of Object.entries(properties)) {
      paramFields.push({
        name,
        type: prop.type || "string",
        description: prop.description,
        required: required.includes(name),
      });
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Plug className="h-4 w-4 text-blue-400" />
        <span className="text-xs font-medium text-blue-400 uppercase tracking-wide">MCP Tool</span>
      </div>

      {/* Agent ID (nötig um Connections zu laden) */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Agent ID</label>
        <input
          value={agentId}
          onChange={(e) => onChange({ ...config, agentId: e.target.value })}
          placeholder="Agent ID für MCP-Verbindungen"
          className="w-full rounded-lg border border-border bg-card/50 px-3 py-1.5 text-xs text-foreground outline-none focus:border-blue-500/50 transition-colors placeholder:text-muted-foreground font-mono"
        />
      </div>

      {/* MCP Server auswählen */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">MCP Server</label>
          {agentId && (
            <button
              onClick={loadConnections}
              className="text-muted-foreground hover:text-blue-400 transition-colors"
              title="Verbindungen aktualisieren"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </button>
          )}
        </div>
        <select
          value={selectedConnectionId}
          onChange={(e) => onChange({ ...config, mcpConnectionId: e.target.value, toolName: "", toolParams: {} })}
          className="w-full rounded-lg border border-border bg-card/50 px-3 py-1.5 text-xs text-foreground outline-none focus:border-blue-500/50 transition-colors"
        >
          <option value="">Server wählen...</option>
          {connections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.status !== "active" ? `(${c.status})` : ""}
            </option>
          ))}
        </select>
        {connections.length === 0 && agentId && !loading && (
          <p className="text-[10px] text-muted-foreground">Keine MCP-Verbindungen. Zuerst im Agent konfigurieren.</p>
        )}
      </div>

      {/* Tool auswählen */}
      {selectedConnectionId && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Tool</label>
            {loadingTools && <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />}
          </div>
          <select
            value={selectedTool}
            onChange={(e) => onChange({ ...config, toolName: e.target.value, toolParams: {} })}
            className="w-full rounded-lg border border-border bg-card/50 px-3 py-1.5 text-xs text-foreground outline-none focus:border-blue-500/50 transition-colors"
          >
            <option value="">Tool wählen...</option>
            {availableTools.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
          {selectedToolDef?.description && (
            <p className="text-[10px] text-muted-foreground">{selectedToolDef.description}</p>
          )}
        </div>
      )}

      {/* Tool Parameter */}
      {selectedTool && paramFields.length > 0 && (
        <div className="space-y-3">
          <label className="text-xs font-medium text-muted-foreground">Parameter</label>
          {paramFields.map((field) => (
            <div key={field.name} className="space-y-1">
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-foreground font-mono">{field.name}</span>
                {field.required && <span className="text-[9px] text-orange-400">*</span>}
                <span className="text-[9px] text-muted-foreground">({field.type})</span>
              </div>
              {field.description && (
                <p className="text-[10px] text-muted-foreground">{field.description}</p>
              )}
              <input
                value={toolParams[field.name] || ""}
                onChange={(e) =>
                  onChange({
                    ...config,
                    toolParams: { ...toolParams, [field.name]: e.target.value },
                  })
                }
                placeholder={`{{variable}} oder Wert`}
                className="w-full rounded-lg border border-border bg-card/50 px-3 py-1.5 text-xs text-foreground outline-none focus:border-blue-500/50 transition-colors placeholder:text-muted-foreground font-mono"
              />
            </div>
          ))}
        </div>
      )}

      {/* Result Key */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Result Key</label>
        <input
          value={resultKey}
          onChange={(e) => onChange({ ...config, resultKey: e.target.value })}
          placeholder="mcpResult"
          className="w-full rounded-lg border border-border bg-card/50 px-3 py-1.5 text-xs text-foreground outline-none focus:border-blue-500/50 transition-colors placeholder:text-muted-foreground font-mono"
        />
      </div>

      {/* Info */}
      <div className="rounded-lg border border-border/50 bg-card/30 p-2.5">
        <div className="flex items-start gap-1.5">
          <Info className="h-3 w-3 text-blue-400 mt-0.5 shrink-0" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Führt ein Tool eines verbundenen MCP-Servers aus. Parameter unterstützen
            Workflow-Variablen mit <code className="text-blue-400/70">{"{{variable}}"}</code> Syntax.
          </p>
        </div>
      </div>
    </div>
  );
}
