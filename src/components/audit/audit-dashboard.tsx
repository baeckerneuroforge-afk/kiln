"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText, Download, Filter, ChevronDown, ChevronUp, Clock,
  Shield, Bot, Zap, Globe, Settings, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface AuditEvent {
  id: string;
  category: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  severity: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  agent: <Bot className="h-3.5 w-3.5" />,
  workflow: <Zap className="h-3.5 w-3.5" />,
  approval: <Shield className="h-3.5 w-3.5" />,
  portal: <Globe className="h-3.5 w-3.5" />,
  settings: <Settings className="h-3.5 w-3.5" />,
  export: <Download className="h-3.5 w-3.5" />,
  mcp: <FileText className="h-3.5 w-3.5" />,
};

const SEVERITY_COLORS: Record<string, string> = {
  info: "text-blue-400 bg-blue-500/10",
  warning: "text-yellow-400 bg-yellow-500/10",
  critical: "text-red-400 bg-red-500/10",
};

const CATEGORIES = ["", "agent", "workflow", "approval", "portal", "settings", "export", "mcp"];

export function AuditDashboard() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [page, setPage] = useState(0);
  const limit = 30;

  const fetchEvents = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (severity) params.set("severity", severity);
    params.set("limit", String(limit));
    params.set("offset", String(page * limit));

    fetch(`/api/audit?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setEvents(data.events || []);
        setTotal(data.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [category, severity, page]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const exportAudit = (format: "json" | "csv") => {
    const params = new URLSearchParams({ format });
    if (category) params.set("category", category);
    window.open(`/api/audit/export?${params}`, "_blank");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Audit Trail</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Unveränderliches Protokoll aller Aktionen ({total} Events)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportAudit("csv")}
            className="text-xs h-8 border-border"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportAudit("json")}
            className="text-xs h-8 border-border"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            JSON
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(0); }}
            className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none"
          >
            <option value="">Alle Kategorien</option>
            {CATEGORIES.filter(Boolean).map((c) => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </div>
        <select
          value={severity}
          onChange={(e) => { setSeverity(e.target.value); setPage(0); }}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none"
        >
          <option value="">Alle Schweregrade</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      {/* Event List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/50 p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="mb-1 text-sm font-semibold text-foreground">Keine Events gefunden</h3>
          <p className="text-xs text-muted-foreground">Passe die Filter an oder erstelle erste Aktionen.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {events.map((event) => {
            const isExpanded = expandedId === event.id;
            return (
              <div
                key={event.id}
                className="rounded-lg border border-border/50 bg-card/30 overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : event.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/20"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                    {CATEGORY_ICONS[event.category] || <FileText className="h-3.5 w-3.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground">{event.action}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                          SEVERITY_COLORS[event.severity] || SEVERITY_COLORS.info
                        }`}
                      >
                        {event.severity}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      {event.resourceType && (
                        <span>{event.resourceType}: {event.resourceId?.slice(0, 8)}...</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(event.createdAt).toLocaleString("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {isExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </div>
                </button>

                {isExpanded && event.details && (
                  <div className="border-t border-border/50 px-3 py-2">
                    <pre className="max-h-40 overflow-y-auto rounded-lg bg-background p-2.5 text-[11px] text-muted-foreground font-mono">
                      {JSON.stringify(event.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {page * limit + 1}–{Math.min((page + 1) * limit, total)} von {total}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="text-xs h-7 border-border"
            >
              Zurück
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={(page + 1) * limit >= total}
              onClick={() => setPage((p) => p + 1)}
              className="text-xs h-7 border-border"
            >
              Weiter
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
