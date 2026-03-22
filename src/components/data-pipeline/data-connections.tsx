"use client";

/**
 * Datenverbindungen — Verwaltung externer Datenquellen
 * PostgreSQL, MySQL, Supabase, REST API, Snowflake, BigQuery
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  Database,
  Globe,
  BarChart3,
  Plus,
  Trash2,
  Check,
  X,
  Loader2,
  ChevronRight,
  ChevronDown,
  AlertCircle,
} from "lucide-react";

/* ── Types ── */

interface ConnectionColumn {
  name: string;
  type: string;
  nullable: boolean;
}

interface ConnectionTable {
  name: string;
  columns: ConnectionColumn[];
}

interface DataConnection {
  id: string;
  name: string;
  type: string;
  status: "connected" | "error";
  tablesCount: number;
  lastUsed: string;
  tables?: ConnectionTable[];
  config: Record<string, unknown>;
}

interface ConnectionType {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  available: boolean;
}

const CONNECTION_TYPES: ConnectionType[] = [
  { id: "postgresql", label: "PostgreSQL", icon: <Database className="size-5" />, color: "text-cyan-400", available: true },
  { id: "mysql", label: "MySQL", icon: <Database className="size-5" />, color: "text-blue-400", available: true },
  { id: "snowflake", label: "Snowflake", icon: <Database className="size-5" />, color: "text-sky-300", available: false },
  { id: "bigquery", label: "BigQuery", icon: <BarChart3 className="size-5" />, color: "text-yellow-400", available: false },
  { id: "supabase", label: "Supabase", icon: <Database className="size-5" />, color: "text-green-400", available: true },
  { id: "rest_api", label: "REST API", icon: <Globe className="size-5" />, color: "text-orange-400", available: true },
];

/* ── Komponente ── */

export function DataConnections() {
  const [connections, setConnections] = useState<DataConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [expandedConnection, setExpandedConnection] = useState<string | null>(null);

  // Formular-State
  const [formName, setFormName] = useState("");
  const [formHost, setFormHost] = useState("");
  const [formPort, setFormPort] = useState("");
  const [formDatabase, setFormDatabase] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formConnectionString, setFormConnectionString] = useState("");
  const [formProjectUrl, setFormProjectUrl] = useState("");
  const [formServiceKey, setFormServiceKey] = useState("");
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const [formAuthType, setFormAuthType] = useState<"none" | "api_key" | "bearer">("none");
  const [formAuthValue, setFormAuthValue] = useState("");
  const [formReadOnly, setFormReadOnly] = useState(true);
  const [useConnectionString, setUseConnectionString] = useState(false);

  // Status
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchConnections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/data-pipeline/connections");
      if (res.ok) {
        const data = await res.json();
        setConnections(data.connections ?? []);
      }
    } catch {
      // Fehler still behandeln
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const resetForm = () => {
    setFormName("");
    setFormHost("");
    setFormPort("");
    setFormDatabase("");
    setFormUsername("");
    setFormPassword("");
    setFormConnectionString("");
    setFormProjectUrl("");
    setFormServiceKey("");
    setFormBaseUrl("");
    setFormAuthType("none");
    setFormAuthValue("");
    setFormReadOnly(true);
    setUseConnectionString(false);
    setTestStatus("idle");
    setSelectedType(null);
  };

  const buildConfig = () => {
    if (!selectedType) return {};
    if (selectedType === "postgresql" || selectedType === "mysql") {
      if (useConnectionString) {
        return { connectionString: formConnectionString, readOnly: formReadOnly };
      }
      return {
        host: formHost,
        port: parseInt(formPort) || (selectedType === "postgresql" ? 5432 : 3306),
        database: formDatabase,
        username: formUsername,
        password: formPassword,
        readOnly: formReadOnly,
      };
    }
    if (selectedType === "supabase") {
      return { projectUrl: formProjectUrl, serviceRoleKey: formServiceKey, readOnly: formReadOnly };
    }
    if (selectedType === "rest_api") {
      return { baseUrl: formBaseUrl, authType: formAuthType, authValue: formAuthValue };
    }
    return {};
  };

  const handleTest = async () => {
    setTestStatus("testing");
    try {
      const res = await fetch("/api/data-pipeline/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", type: selectedType, config: buildConfig() }),
      });
      setTestStatus(res.ok ? "success" : "error");
    } catch {
      setTestStatus("error");
    }
  };

  const handleSave = async () => {
    if (!selectedType || !formName) return;
    setSaving(true);
    try {
      const res = await fetch("/api/data-pipeline/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName, type: selectedType, config: buildConfig() }),
      });
      if (res.ok) {
        resetForm();
        setShowAdd(false);
        fetchConnections();
      }
    } catch {
      // Fehler
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await fetch(`/api/data-pipeline/connections/${id}`, { method: "DELETE" });
      fetchConnections();
    } catch {
      // Fehler
    } finally {
      setDeleting(null);
    }
  };

  const toggleExpand = async (conn: DataConnection) => {
    if (expandedConnection === conn.id) {
      setExpandedConnection(null);
      return;
    }
    setExpandedConnection(conn.id);
    // Schema laden falls nicht vorhanden
    if (!conn.tables) {
      try {
        const res = await fetch(`/api/data-pipeline/connections/${conn.id}/schema`);
        if (res.ok) {
          const data = await res.json();
          setConnections((prev) =>
            prev.map((c) => (c.id === conn.id ? { ...c, tables: data.tables ?? [] } : c))
          );
        }
      } catch {
        // Fehler
      }
    }
  };

  /* ── Render ── */

  const renderConnectionForm = () => {
    if (!selectedType) return null;
    const typeInfo = CONNECTION_TYPES.find((t) => t.id === selectedType);
    if (!typeInfo?.available) {
      return (
        <div className="rounded-lg border border-stone-800 bg-stone-900/50 p-6 text-center">
          <AlertCircle className="mx-auto mb-2 size-8 text-stone-500" />
          <p className="text-stone-400">Kommt bald</p>
          <p className="mt-1 text-xs text-stone-500">
            {typeInfo?.label}-Integration wird in Kuerze verfuegbar sein.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Verbindungsname */}
        <div className="space-y-1.5">
          <Label className="text-stone-300">Verbindungsname</Label>
          <Input
            placeholder="z.B. Produktions-DB"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            className="border-stone-800 bg-stone-900/50 text-white placeholder:text-stone-600"
          />
        </div>

        {/* PostgreSQL / MySQL */}
        {(selectedType === "postgresql" || selectedType === "mysql") && (
          <>
            <div className="flex items-center gap-2">
              <Switch checked={useConnectionString} onCheckedChange={setUseConnectionString} />
              <Label className="text-xs text-stone-400">Connection String verwenden</Label>
            </div>
            {useConnectionString ? (
              <div className="space-y-1.5">
                <Label className="text-stone-300">Connection String</Label>
                <Input
                  placeholder={`${selectedType}://user:pass@host:port/db`}
                  value={formConnectionString}
                  onChange={(e) => setFormConnectionString(e.target.value)}
                  className="border-stone-800 bg-stone-900/50 font-mono text-sm text-white placeholder:text-stone-600"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-stone-300">Host</Label>
                  <Input
                    placeholder="localhost"
                    value={formHost}
                    onChange={(e) => setFormHost(e.target.value)}
                    className="border-stone-800 bg-stone-900/50 text-white placeholder:text-stone-600"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-stone-300">Port</Label>
                  <Input
                    placeholder={selectedType === "postgresql" ? "5432" : "3306"}
                    value={formPort}
                    onChange={(e) => setFormPort(e.target.value)}
                    className="border-stone-800 bg-stone-900/50 text-white placeholder:text-stone-600"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-stone-300">Datenbank</Label>
                  <Input
                    placeholder="mydb"
                    value={formDatabase}
                    onChange={(e) => setFormDatabase(e.target.value)}
                    className="border-stone-800 bg-stone-900/50 text-white placeholder:text-stone-600"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-stone-300">Benutzername</Label>
                  <Input
                    placeholder="user"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    className="border-stone-800 bg-stone-900/50 text-white placeholder:text-stone-600"
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-stone-300">Passwort</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="border-stone-800 bg-stone-900/50 text-white placeholder:text-stone-600"
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* Supabase */}
        {selectedType === "supabase" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-stone-300">Projekt-URL</Label>
              <Input
                placeholder="https://xyz.supabase.co"
                value={formProjectUrl}
                onChange={(e) => setFormProjectUrl(e.target.value)}
                className="border-stone-800 bg-stone-900/50 text-white placeholder:text-stone-600"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-stone-300">Service Role Key</Label>
              <Input
                type="password"
                placeholder="eyJ..."
                value={formServiceKey}
                onChange={(e) => setFormServiceKey(e.target.value)}
                className="border-stone-800 bg-stone-900/50 text-white placeholder:text-stone-600"
              />
            </div>
          </div>
        )}

        {/* REST API */}
        {selectedType === "rest_api" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-stone-300">Base URL</Label>
              <Input
                placeholder="https://api.example.com/v1"
                value={formBaseUrl}
                onChange={(e) => setFormBaseUrl(e.target.value)}
                className="border-stone-800 bg-stone-900/50 text-white placeholder:text-stone-600"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-stone-300">Authentifizierung</Label>
              <div className="flex gap-2">
                {(["none", "api_key", "bearer"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFormAuthType(t)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-xs transition-colors",
                      formAuthType === t
                        ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
                        : "border-stone-800 bg-stone-900/50 text-stone-400 hover:border-stone-700"
                    )}
                  >
                    {t === "none" ? "Keine" : t === "api_key" ? "API Key" : "Bearer Token"}
                  </button>
                ))}
              </div>
            </div>
            {formAuthType !== "none" && (
              <div className="space-y-1.5">
                <Label className="text-stone-300">
                  {formAuthType === "api_key" ? "API Key" : "Bearer Token"}
                </Label>
                <Input
                  type="password"
                  placeholder={formAuthType === "api_key" ? "sk-..." : "eyJ..."}
                  value={formAuthValue}
                  onChange={(e) => setFormAuthValue(e.target.value)}
                  className="border-stone-800 bg-stone-900/50 text-white placeholder:text-stone-600"
                />
              </div>
            )}
          </div>
        )}

        {/* Read-Only Toggle */}
        {selectedType !== "rest_api" && (
          <div className="flex items-center gap-2">
            <Switch checked={formReadOnly} onCheckedChange={setFormReadOnly} />
            <Label className="text-xs text-stone-400">Nur-Lese-Zugriff (empfohlen)</Label>
          </div>
        )}

        {/* Test & Verbinden */}
        <div className="flex items-center gap-3 pt-2">
          <Button variant="outline" onClick={handleTest} disabled={testStatus === "testing"}>
            {testStatus === "testing" && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            {testStatus === "success" && <Check className="mr-1.5 size-3.5 text-green-400" />}
            {testStatus === "error" && <X className="mr-1.5 size-3.5 text-red-400" />}
            Verbindung testen
          </Button>
          <Button onClick={handleSave} disabled={saving || !formName}>
            {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Verbinden
          </Button>
        </div>
        {testStatus === "success" && (
          <p className="text-xs text-green-400">Verbindung erfolgreich hergestellt.</p>
        )}
        {testStatus === "error" && (
          <p className="text-xs text-red-400">Verbindung fehlgeschlagen. Bitte Zugangsdaten pruefen.</p>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl text-white">Datenverbindungen</h2>
          <p className="mt-1 text-sm text-stone-400">
            Verbinde externe Datenbanken und APIs mit deinen Agents und Workflows.
          </p>
        </div>
        <Button
          onClick={() => {
            setShowAdd(!showAdd);
            if (showAdd) resetForm();
          }}
          className="bg-orange-500 text-white hover:bg-orange-600"
        >
          <Plus className="mr-1.5 size-3.5" />
          Verbindung hinzufuegen
        </Button>
      </div>

      {/* Neue Verbindung */}
      {showAdd && (
        <div className="rounded-xl border border-stone-800 bg-stone-950 p-5 space-y-5">
          <h3 className="text-sm font-medium text-white">Datenquelle waehlen</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {CONNECTION_TYPES.map((ct) => (
              <button
                key={ct.id}
                onClick={() => {
                  setSelectedType(ct.id);
                  setTestStatus("idle");
                }}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 text-left transition-all",
                  selectedType === ct.id
                    ? "border-orange-500/50 bg-orange-500/5"
                    : "border-stone-800 bg-stone-900/30 hover:border-stone-700",
                  !ct.available && "opacity-60"
                )}
              >
                <span className={ct.color}>{ct.icon}</span>
                <div>
                  <p className="text-sm font-medium text-white">{ct.label}</p>
                  {!ct.available && (
                    <p className="text-[10px] text-stone-500">Kommt bald</p>
                  )}
                </div>
              </button>
            ))}
          </div>

          {renderConnectionForm()}
        </div>
      )}

      {/* Verbindungsliste */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-5 animate-spin text-stone-500" />
        </div>
      ) : connections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-800 py-12 text-center">
          <Database className="mx-auto mb-3 size-8 text-stone-600" />
          <p className="text-stone-400">Noch keine Verbindungen</p>
          <p className="mt-1 text-xs text-stone-500">
            Verbinde eine Datenbank oder API, um Daten in deinen Workflows zu nutzen.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="rounded-xl border border-stone-800 bg-stone-950 overflow-hidden"
            >
              {/* Kopfzeile */}
              <div
                className="flex cursor-pointer items-center gap-3 p-4 hover:bg-stone-900/50 transition-colors"
                onClick={() => toggleExpand(conn)}
              >
                {expandedConnection === conn.id ? (
                  <ChevronDown className="size-4 text-stone-500" />
                ) : (
                  <ChevronRight className="size-4 text-stone-500" />
                )}
                <span className={CONNECTION_TYPES.find((t) => t.id === conn.type)?.color ?? "text-stone-400"}>
                  {CONNECTION_TYPES.find((t) => t.id === conn.type)?.icon ?? <Database className="size-5" />}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{conn.name}</p>
                  <p className="text-xs text-stone-500">
                    {conn.tablesCount} Tabellen &middot; Zuletzt genutzt: {conn.lastUsed}
                  </p>
                </div>
                <Badge
                  className={cn(
                    "text-[10px]",
                    conn.status === "connected"
                      ? "border-green-500/30 bg-green-500/10 text-green-400"
                      : "border-red-500/30 bg-red-500/10 text-red-400"
                  )}
                >
                  <span
                    className={cn(
                      "mr-1.5 inline-block size-1.5 rounded-full",
                      conn.status === "connected" ? "bg-green-400" : "bg-red-400"
                    )}
                  />
                  {conn.status === "connected" ? "Verbunden" : "Fehler"}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(conn.id);
                  }}
                  disabled={deleting === conn.id}
                >
                  {deleting === conn.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5 text-stone-500 hover:text-red-400" />
                  )}
                </Button>
              </div>

              {/* Erweiterte Tabellen-Ansicht */}
              {expandedConnection === conn.id && (
                <div className="border-t border-stone-800 bg-stone-900/30 p-4">
                  {conn.tables ? (
                    conn.tables.length > 0 ? (
                      <div className="space-y-2">
                        {conn.tables.map((table) => (
                          <TableRow key={table.name} table={table} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-stone-500">Keine Tabellen gefunden.</p>
                    )
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-stone-500">
                      <Loader2 className="size-3 animate-spin" />
                      Schema wird geladen...
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Hilfsfunktion: Tabellen-Zeile ── */

function TableRow({ table }: { table: ConnectionTable }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-stone-800/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="size-3 text-stone-500" />
        ) : (
          <ChevronRight className="size-3 text-stone-500" />
        )}
        <Database className="size-3 text-stone-500" />
        <span className="font-medium text-stone-300">{table.name}</span>
        <Badge className="ml-auto border-stone-700 bg-stone-800 text-[10px] text-stone-400">
          {table.columns.length} Spalten
        </Badge>
      </button>
      {expanded && (
        <div className="ml-7 mt-1 space-y-0.5">
          {table.columns.map((col) => (
            <div key={col.name} className="flex items-center gap-2 px-2 py-0.5 text-xs">
              <span className="text-stone-400">{col.name}</span>
              <Badge className="border-stone-700 bg-stone-800/50 text-[9px] font-mono text-stone-500">
                {col.type}
              </Badge>
              {col.nullable && (
                <span className="text-[9px] text-stone-600">nullable</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
