"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plug,
  Plus,
  X,
  Check,
  Loader2,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Globe,
  Key,
  Shield,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface MCPConnectionData {
  id: string;
  name: string;
  serverUrl: string;
  transport: string;
  authType: string;
  status: string;
  toolCount: number;
  enabledToolCount: number;
  lastTestedAt: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
}

interface DirectoryEntry {
  id: string;
  name: string;
  description: string;
  url: string;
  authType: string;
  setupInstructions: string;
  category: string;
  verified: boolean;
}

interface MCPConnectionsTabProps {
  agentId: string;
  className?: string;
}

export function MCPConnectionsTab({ agentId, className }: MCPConnectionsTabProps) {
  const [connections, setConnections] = useState<MCPConnectionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedTools, setExpandedTools] = useState<MCPTool[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);

  // Add-Formular
  const [addName, setAddName] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [addAuthType, setAddAuthType] = useState<"none" | "api_key" | "oauth">("none");
  const [addAuthValue, setAddAuthValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Directory
  const [showDirectory, setShowDirectory] = useState(false);
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [dirSearch, setDirSearch] = useState("");

  // Aktionen
  const [testing, setTesting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/mcp`);
      if (res.ok) {
        const data = await res.json();
        setConnections(data.connections || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [agentId]);

  useEffect(() => { fetchConnections(); }, [fetchConnections]);

  const handleAdd = async () => {
    if (!addName || !addUrl) return;
    setAdding(true);
    setAddError(null);

    try {
      const res = await fetch(`/api/agents/${agentId}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addName,
          serverUrl: addUrl,
          authType: addAuthType,
          authValue: addAuthValue || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error || "Failed to add connection");
        return;
      }

      setShowAddModal(false);
      setAddName("");
      setAddUrl("");
      setAddAuthType("none");
      setAddAuthValue("");
      setTestResult(null);
      fetchConnections();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed");
    } finally {
      setAdding(false);
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const res = await fetch(`/api/agents/${agentId}/mcp/${id}`, { method: "POST" });
      const data = await res.json();
      if (data.connected) {
        fetchConnections();
      }
    } catch { /* ignore */ }
    setTesting(null);
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await fetch(`/api/agents/${agentId}/mcp/${id}`, { method: "DELETE" });
      fetchConnections();
    } catch { /* ignore */ }
    setDeleting(null);
  };

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setLoadingTools(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/mcp/${id}`);
      const data = await res.json();
      setExpandedTools(data.discoveredTools || []);
    } catch { /* ignore */ }
    setLoadingTools(false);
  };

  const loadDirectory = async () => {
    try {
      const res = await fetch("/api/mcp/directory");
      if (res.ok) {
        const data = await res.json();
        setDirectory(data.entries || []);
      }
    } catch { /* ignore */ }
    setShowDirectory(true);
  };

  const connectFromDirectory = (entry: DirectoryEntry) => {
    setAddName(entry.name);
    setAddUrl(entry.url);
    setAddAuthType(entry.authType as "none" | "api_key" | "oauth");
    setAddAuthValue("");
    setShowDirectory(false);
    setShowAddModal(true);
  };

  const filteredDirectory = dirSearch
    ? directory.filter((e) => e.name.toLowerCase().includes(dirSearch.toLowerCase()) || e.description.toLowerCase().includes(dirSearch.toLowerCase()))
    : directory;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">MCP Connections</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Connect external MCP servers to give your agent access to tools like Notion, GitHub, Slack, and more.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={loadDirectory} className="h-8 text-xs">
            <Globe className="h-3.5 w-3.5 mr-1.5" />
            Browse Directory
          </Button>
          <Button size="sm" onClick={() => setShowAddModal(true)} className="h-8 text-xs">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Server
          </Button>
        </div>
      </div>

      {/* Connections List */}
      {connections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Plug className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No MCP servers connected</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Connect an MCP server to give your agent access to external tools
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="rounded-xl border border-border bg-card overflow-hidden"
            >
              <div
                className="flex items-center gap-3 p-4 cursor-pointer hover:bg-accent/5 transition-colors"
                onClick={() => handleExpand(conn.id)}
              >
                <div className={cn(
                  "h-2 w-2 rounded-full shrink-0",
                  conn.status === "connected" ? "bg-emerald-400" : conn.status === "error" ? "bg-red-400" : "bg-neutral-400",
                )} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{conn.name}</span>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {conn.enabledToolCount} tool{conn.enabledToolCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{conn.serverUrl}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={(e) => { e.stopPropagation(); handleTest(conn.id); }}
                    disabled={testing === conn.id}
                  >
                    {testing === conn.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <RefreshCw className="h-3.5 w-3.5" />
                    }
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-red-400 hover:text-red-300"
                    onClick={(e) => { e.stopPropagation(); handleDelete(conn.id); }}
                    disabled={deleting === conn.id}
                  >
                    {deleting === conn.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />
                    }
                  </Button>
                  {expandedId === conn.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>

              {/* Expanded tools */}
              {expandedId === conn.id && (
                <div className="border-t border-border p-4">
                  {conn.lastError && (
                    <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-500/10 p-3 text-xs text-red-400">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      {conn.lastError}
                    </div>
                  )}
                  {loadingTools ? (
                    <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                  ) : expandedTools.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No tools discovered</p>
                  ) : (
                    <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                      {expandedTools.map((tool) => (
                        <div key={tool.name} className="flex items-start gap-2 rounded-lg bg-muted/30 p-2.5">
                          <Plug className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-mono font-medium">{tool.name}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{tool.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold">Add MCP Server</h3>
              <button onClick={() => { setShowAddModal(false); setAddError(null); setTestResult(null); }}>
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Server Name</label>
                <input
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. Notion"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Server URL</label>
                <input
                  value={addUrl}
                  onChange={(e) => setAddUrl(e.target.value)}
                  placeholder="https://mcp.example.com/sse"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Authentication</label>
                <select
                  value={addAuthType}
                  onChange={(e) => setAddAuthType(e.target.value as "none" | "api_key" | "oauth")}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="none">No authentication</option>
                  <option value="api_key">API Key</option>
                  <option value="oauth">OAuth Token</option>
                </select>
              </div>

              {addAuthType !== "none" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    {addAuthType === "api_key" ? "API Key" : "OAuth Token"}
                  </label>
                  <div className="relative mt-1">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="password"
                      value={addAuthValue}
                      onChange={(e) => setAddAuthValue(e.target.value)}
                      placeholder={addAuthType === "api_key" ? "sk-..." : "Bearer token"}
                      className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
                    />
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Shield className="h-3 w-3" />
                    Encrypted at rest with AES-256-GCM
                  </p>
                </div>
              )}

              {addError && (
                <div className="flex items-start gap-2 rounded-lg bg-red-500/10 p-3 text-xs text-red-400">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {addError}
                </div>
              )}

              {testResult && (
                <div className={cn(
                  "flex items-start gap-2 rounded-lg p-3 text-xs",
                  testResult.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400",
                )}>
                  {testResult.ok ? <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
                  {testResult.message}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setShowAddModal(false); setAddError(null); setTestResult(null); }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={adding || !addName || !addUrl}
                  className="flex-1"
                >
                  {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plug className="h-3.5 w-3.5 mr-1.5" />}
                  Connect
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Directory Modal */}
      {showDirectory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">MCP Server Directory</h3>
              <button onClick={() => setShowDirectory(false)}>
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            </div>

            <input
              value={dirSearch}
              onChange={(e) => setDirSearch(e.target.value)}
              placeholder="Search servers..."
              className="mb-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />

            <div className="flex-1 overflow-y-auto space-y-2">
              {filteredDirectory.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 hover:bg-accent/5 transition-colors">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 shrink-0">
                    <Plug className="h-4 w-4 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{entry.name}</span>
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {entry.category.replace("_", " ")}
                      </span>
                      {!entry.verified && (
                        <span className="text-[9px] text-amber-400">verify URL</span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{entry.description}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs shrink-0"
                    onClick={() => connectFromDirectory(entry)}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Connect
                  </Button>
                </div>
              ))}
              {filteredDirectory.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No servers found</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
