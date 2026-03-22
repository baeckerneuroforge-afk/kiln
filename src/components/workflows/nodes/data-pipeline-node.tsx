"use client";

/**
 * Data Pipeline Node — Workflow-Node fuer Datenbankabfragen
 * Konfiguriert SQL oder Natural-Language Queries gegen verbundene Datenquellen.
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Play,
  Loader2,
  Sparkles,
} from "lucide-react";

/* ── Types ── */

interface ConnectionOption {
  id: string;
  name: string;
  type: string;
}

interface PreviewResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

interface DataPipelineNodeProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

/* ── Komponente ── */

export function DataPipelineNode({ config, onChange }: DataPipelineNodeProps) {
  const [connections, setConnections] = useState<ConnectionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const connectionId = (config.connectionId as string) ?? "";
  const queryMode = (config.queryMode as "sql" | "nl") ?? "sql";
  const query = (config.query as string) ?? "";
  const resultKey = (config.resultKey as string) ?? "queryResult";

  // Verbindungen laden
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/data-pipeline/connections");
        if (res.ok) {
          const data = await res.json();
          setConnections(
            (data.connections ?? []).map((c: { id: string; name: string; type: string }) => ({
              id: c.id,
              name: c.name,
              type: c.type,
            }))
          );
        }
      } catch {
        // Fehler
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const update = (partial: Record<string, unknown>) => {
    onChange({ ...config, ...partial });
  };

  // Vorschau ausfuehren
  const runPreview = async () => {
    if (!connectionId || !query) return;
    setPreviewing(true);
    setPreview(null);
    try {
      const res = await fetch(`/api/data-pipeline/connections/${connectionId}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, mode: queryMode, limit: 10 }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreview({ columns: data.columns ?? [], rows: (data.rows ?? []).slice(0, 10) });
      }
    } catch {
      // Fehler
    } finally {
      setPreviewing(false);
    }
  };

  // Fragen vorschlagen
  const loadSuggestions = async () => {
    if (!connectionId) return;
    setLoadingSuggestions(true);
    try {
      const res = await fetch(`/api/data-pipeline/connections/${connectionId}/suggest`);
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

  return (
    <div className="space-y-4 p-4">
      {/* Verbindungswahl */}
      <div className="space-y-1.5">
        <Label className="text-stone-300">Datenverbindung</Label>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <Loader2 className="size-3 animate-spin" />
            Verbindungen laden...
          </div>
        ) : (
          <select
            value={connectionId}
            onChange={(e) => update({ connectionId: e.target.value })}
            className="w-full rounded-md border border-stone-800 bg-stone-900/50 px-2.5 py-1.5 text-sm text-white outline-none focus:border-orange-500/50"
          >
            <option value="">Verbindung waehlen...</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Query-Modus */}
      <div className="space-y-1.5">
        <Label className="text-stone-300">Query-Modus</Label>
        <div className="flex rounded-lg border border-stone-800 bg-stone-900/50 p-0.5">
          <button
            onClick={() => update({ queryMode: "sql" })}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              queryMode === "sql"
                ? "bg-orange-500/10 text-orange-400"
                : "text-stone-500 hover:text-stone-300"
            )}
          >
            SQL
          </button>
          <button
            onClick={() => update({ queryMode: "nl" })}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              queryMode === "nl"
                ? "bg-orange-500/10 text-orange-400"
                : "text-stone-500 hover:text-stone-300"
            )}
          >
            Natural Language
          </button>
        </div>
      </div>

      {/* Query-Eingabe */}
      <div className="space-y-1.5">
        <Label className="text-stone-300">
          {queryMode === "sql" ? "SQL Query" : "Frage in natuerlicher Sprache"}
        </Label>
        <Textarea
          value={query}
          onChange={(e) => update({ query: e.target.value })}
          placeholder={
            queryMode === "sql"
              ? "SELECT * FROM users LIMIT 10;"
              : "Zeige mir die letzten 10 Kunden..."
          }
          className={cn(
            "min-h-[80px] border-stone-800 bg-stone-900/30 text-white placeholder:text-stone-600",
            queryMode === "sql" && "font-mono text-sm"
          )}
        />
      </div>

      {/* Vorschlaege */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => update({ query: s, queryMode: "nl" })}
              className="rounded-full border border-stone-800 bg-stone-900/50 px-2.5 py-1 text-[10px] text-stone-400 transition-colors hover:border-orange-500/30 hover:text-orange-400"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Result Key */}
      <div className="space-y-1.5">
        <Label className="text-stone-300">Ergebnis-Variable</Label>
        <Input
          value={resultKey}
          onChange={(e) => update({ resultKey: e.target.value })}
          placeholder="queryResult"
          className="border-stone-800 bg-stone-900/50 font-mono text-sm text-white placeholder:text-stone-600"
        />
        <p className="text-[10px] text-stone-500">
          Unter diesem Key stehen die Ergebnisse im Workflow zur Verfuegung.
        </p>
      </div>

      {/* Aktionen */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          onClick={runPreview}
          disabled={previewing || !connectionId || !query}
        >
          {previewing ? (
            <Loader2 className="mr-1.5 size-3 animate-spin" />
          ) : (
            <Play className="mr-1.5 size-3" />
          )}
          Vorschau
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadSuggestions}
          disabled={loadingSuggestions || !connectionId}
        >
          {loadingSuggestions ? (
            <Loader2 className="mr-1.5 size-3 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 size-3 text-orange-400" />
          )}
          Fragen vorschlagen
        </Button>
      </div>

      {/* Vorschau-Ergebnisse */}
      {preview && (
        <div className="rounded-lg border border-stone-800 bg-stone-900/30 overflow-hidden">
          <div className="border-b border-stone-800 px-3 py-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-stone-500">
              Vorschau (max. 10 Zeilen)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-800">
                  {preview.columns.map((col) => (
                    <th
                      key={col}
                      className="whitespace-nowrap px-2.5 py-1.5 text-left font-medium text-stone-400"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => (
                  <tr key={i} className="border-b border-stone-800/50">
                    {preview.columns.map((col) => (
                      <td
                        key={col}
                        className="max-w-[200px] truncate whitespace-nowrap px-2.5 py-1 font-mono text-stone-300"
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
      )}
    </div>
  );
}
