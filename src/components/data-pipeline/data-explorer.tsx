"use client";

/**
 * Data Explorer — Interaktive Daten-Exploration
 * SQL und Natural Language Queries gegen verbundene Datenquellen.
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Database,
  Table,
  Play,
  Download,
  Loader2,
  ChevronRight,
  ChevronDown,
  Search,
  Sparkles,
  RefreshCw,
} from "lucide-react";

/* ── Types ── */

interface ConnectionColumn {
  name: string;
  type: string;
}

interface SchemaTable {
  name: string;
  columns: ConnectionColumn[];
}

interface ConnectionOption {
  id: string;
  name: string;
  type: string;
}

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
}

/* ── Komponente ── */

export function DataExplorer() {
  // Connections
  const [connections, setConnections] = useState<ConnectionOption[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  const [schema, setSchema] = useState<SchemaTable[]>([]);
  const [loadingSchema, setLoadingSchema] = useState(false);

  // Query
  const [queryMode, setQueryMode] = useState<"sql" | "nl">("sql");
  const [queryInput, setQueryInput] = useState("");
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);

  // Suggestions
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Sidebar
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState("");

  // Verbindungen laden
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/data-pipeline/connections");
        if (res.ok) {
          const data = await res.json();
          const conns: ConnectionOption[] = (data.connections ?? []).map(
            (c: { id: string; name: string; type: string }) => ({
              id: c.id,
              name: c.name,
              type: c.type,
            })
          );
          setConnections(conns);
          if (conns.length > 0 && !selectedConnection) {
            setSelectedConnection(conns[0].id);
          }
        }
      } catch {
        // Fehler
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Schema laden wenn Verbindung wechselt
  const loadSchema = useCallback(async (connId: string) => {
    setLoadingSchema(true);
    setSchema([]);
    try {
      const res = await fetch(`/api/data-pipeline/connections/${connId}/schema`);
      if (res.ok) {
        const data = await res.json();
        setSchema(data.tables ?? []);
      }
    } catch {
      // Fehler
    } finally {
      setLoadingSchema(false);
    }
  }, []);

  useEffect(() => {
    if (selectedConnection) {
      loadSchema(selectedConnection);
    }
  }, [selectedConnection, loadSchema]);

  // Query ausfuehren
  const executeQuery = async () => {
    if (!selectedConnection || !queryInput.trim()) return;
    setExecuting(true);
    setResult(null);
    try {
      const res = await fetch(`/api/data-pipeline/connections/${selectedConnection}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: queryInput, mode: queryMode }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data);
      }
    } catch {
      // Fehler
    } finally {
      setExecuting(false);
    }
  };

  // Vorschlaege laden
  const loadSuggestions = async () => {
    if (!selectedConnection) return;
    setLoadingSuggestions(true);
    try {
      const res = await fetch(`/api/data-pipeline/connections/${selectedConnection}/suggest`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
      }
    } catch {
      // Fehler
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // Export
  const exportData = (format: "csv" | "json") => {
    if (!result) return;
    let content: string;
    let mimeType: string;
    let ext: string;

    if (format === "csv") {
      const header = result.columns.join(",");
      const rows = result.rows.map((r) =>
        result.columns.map((c) => JSON.stringify(r[c] ?? "")).join(",")
      );
      content = [header, ...rows].join("\n");
      mimeType = "text/csv";
      ext = "csv";
    } else {
      content = JSON.stringify(result.rows, null, 2);
      mimeType = "application/json";
      ext = "json";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `query-result.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredTables = schema.filter((t) =>
    t.name.toLowerCase().includes(tableFilter.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-[#0C0A09]">
      {/* ── Sidebar ── */}
      <div className="flex w-64 flex-col border-r border-stone-800 bg-stone-950">
        {/* Verbindungswahl */}
        <div className="border-b border-stone-800 p-3">
          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-stone-500">
            Verbindung
          </label>
          <select
            value={selectedConnection ?? ""}
            onChange={(e) => setSelectedConnection(e.target.value || null)}
            className="w-full rounded-md border border-stone-800 bg-stone-900/50 px-2.5 py-1.5 text-sm text-white outline-none focus:border-orange-500/50"
          >
            <option value="">Waehlen...</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Tabellenfilter */}
        <div className="border-b border-stone-800 p-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-stone-500" />
            <Input
              placeholder="Tabelle suchen..."
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              className="h-7 border-stone-800 bg-stone-900/50 pl-7 text-xs text-white placeholder:text-stone-600"
            />
          </div>
        </div>

        {/* Tabellen-Baum */}
        <div className="flex-1 overflow-y-auto p-2">
          {loadingSchema ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-4 animate-spin text-stone-500" />
            </div>
          ) : filteredTables.length === 0 ? (
            <p className="py-4 text-center text-xs text-stone-600">
              {selectedConnection ? "Keine Tabellen" : "Verbindung waehlen"}
            </p>
          ) : (
            <div className="space-y-0.5">
              {filteredTables.map((table) => (
                <div key={table.name}>
                  <button
                    onClick={() =>
                      setExpandedTable(expandedTable === table.name ? null : table.name)
                    }
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-stone-800/50"
                  >
                    {expandedTable === table.name ? (
                      <ChevronDown className="size-3 text-stone-500" />
                    ) : (
                      <ChevronRight className="size-3 text-stone-500" />
                    )}
                    <Table className="size-3 text-orange-400/70" />
                    <span className="truncate font-medium text-stone-300">{table.name}</span>
                  </button>
                  {expandedTable === table.name && (
                    <div className="ml-5 space-y-0.5 py-0.5">
                      {table.columns.map((col) => (
                        <div
                          key={col.name}
                          className="flex items-center gap-2 px-2 py-0.5 text-[11px]"
                        >
                          <span className="truncate text-stone-400">{col.name}</span>
                          <Badge className="ml-auto shrink-0 border-stone-700 bg-stone-800/50 px-1 py-0 text-[9px] font-mono text-stone-500">
                            {col.type}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Hauptbereich ── */}
      <div className="flex flex-1 flex-col">
        {/* Top Bar */}
        <div className="flex items-center gap-3 border-b border-stone-800 px-4 py-2.5">
          {/* Query-Modus Toggle */}
          <div className="flex rounded-lg border border-stone-800 bg-stone-900/50 p-0.5">
            <button
              onClick={() => setQueryMode("sql")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                queryMode === "sql"
                  ? "bg-orange-500/10 text-orange-400"
                  : "text-stone-500 hover:text-stone-300"
              )}
            >
              SQL
            </button>
            <button
              onClick={() => setQueryMode("nl")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                queryMode === "nl"
                  ? "bg-orange-500/10 text-orange-400"
                  : "text-stone-500 hover:text-stone-300"
              )}
            >
              Natural Language
            </button>
          </div>

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="sm"
            onClick={loadSuggestions}
            disabled={loadingSuggestions || !selectedConnection}
          >
            {loadingSuggestions ? (
              <Loader2 className="mr-1.5 size-3 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 size-3 text-orange-400" />
            )}
            Fragen vorschlagen
          </Button>

          <Button
            size="sm"
            onClick={executeQuery}
            disabled={executing || !queryInput.trim() || !selectedConnection}
            className="bg-orange-500 text-white hover:bg-orange-600"
          >
            {executing ? (
              <Loader2 className="mr-1.5 size-3 animate-spin" />
            ) : (
              <Play className="mr-1.5 size-3" />
            )}
            Ausfuehren
          </Button>
        </div>

        {/* Query Editor */}
        <div className="relative border-b border-stone-800 p-4">
          <Textarea
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder={
              queryMode === "sql"
                ? "SELECT * FROM users WHERE created_at > '2024-01-01' LIMIT 100;"
                : "Zeige mir alle Kunden, die sich in den letzten 30 Tagen registriert haben."
            }
            className={cn(
              "min-h-[120px] resize-y border-stone-800 bg-stone-900/30 text-white placeholder:text-stone-600",
              queryMode === "sql" && "font-mono text-sm"
            )}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                executeQuery();
              }
            }}
          />
          {queryMode === "sql" && (
            <button
              onClick={() => setQueryMode("nl")}
              className="absolute bottom-7 right-7 flex items-center gap-1.5 rounded-md border border-stone-700 bg-stone-800 px-2.5 py-1 text-[10px] text-stone-400 transition-colors hover:border-orange-500/50 hover:text-orange-400"
            >
              <Sparkles className="size-3" />
              Ask AI
            </button>
          )}

          {/* Vorschlaege */}
          {suggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setQueryInput(s);
                    setQueryMode("nl");
                  }}
                  className="rounded-full border border-stone-800 bg-stone-900/50 px-3 py-1 text-xs text-stone-400 transition-colors hover:border-orange-500/30 hover:text-orange-400"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Ergebnisse */}
        <div className="flex-1 overflow-auto">
          {executing ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-5 animate-spin text-stone-500" />
              <span className="ml-2 text-sm text-stone-500">Query wird ausgefuehrt...</span>
            </div>
          ) : result ? (
            <div className="flex h-full flex-col">
              {/* Ergebnis-Header */}
              <div className="flex items-center gap-3 border-b border-stone-800 px-4 py-2">
                <span className="text-xs text-stone-400">
                  {result.rowCount} Zeilen &middot; {result.executionTimeMs}ms
                </span>
                <div className="flex-1" />
                <Button variant="ghost" size="xs" onClick={() => exportData("csv")}>
                  <Download className="mr-1 size-3" />
                  CSV
                </Button>
                <Button variant="ghost" size="xs" onClick={() => exportData("json")}>
                  <Download className="mr-1 size-3" />
                  JSON
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    // Konfiguration in Zwischenablage kopieren
                    navigator.clipboard.writeText(
                      JSON.stringify({ connectionId: selectedConnection, query: queryInput, mode: queryMode })
                    );
                  }}
                >
                  <RefreshCw className="mr-1 size-3" />
                  Als Workflow-Node
                </Button>
              </div>

              {/* Tabelle */}
              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-800 bg-stone-900/50">
                      {result.columns.map((col) => (
                        <th
                          key={col}
                          className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-stone-400"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.slice(0, 100).map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-stone-800/50 transition-colors hover:bg-stone-900/30"
                      >
                        {result.columns.map((col) => (
                          <td
                            key={col}
                            className="max-w-[300px] truncate whitespace-nowrap px-3 py-1.5 font-mono text-xs text-stone-300"
                          >
                            {row[col] === null ? (
                              <span className="text-stone-600">NULL</span>
                            ) : (
                              String(row[col])
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16">
              <Database className="mb-3 size-8 text-stone-700" />
              <p className="text-sm text-stone-500">
                Schreibe eine Query und klicke auf &quot;Ausfuehren&quot;
              </p>
              <p className="mt-1 text-xs text-stone-600">
                Cmd+Enter zum schnellen Ausfuehren
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
