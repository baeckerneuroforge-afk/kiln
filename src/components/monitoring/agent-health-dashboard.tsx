"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, XCircle, Clock, Loader2,
  ChevronDown, ChevronUp, Bell, BellOff, Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface AgentHealth {
  agentId: string;
  agentName: string;
  uptime: number;
  avgResponseTime: number;
  totalRuns: number;
  failureRate: number;
  errorBreakdown: Record<string, number>;
  status: "healthy" | "warning" | "critical" | "inactive";
  lastError?: { type: string; message: string; at: string };
}

interface Alert {
  id: string;
  agentId: string;
  alertType: string;
  severity: string;
  message: string;
  acknowledged: boolean;
  createdAt: string;
}

interface SystemHealth {
  totalAgents: number;
  healthyAgents: number;
  warningAgents: number;
  criticalAgents: number;
  inactiveAgents: number;
  overallUptime: number;
  agents: AgentHealth[];
  alerts: Alert[];
}

const STATUS_CONFIG = {
  healthy: { color: "#22C55E", bg: "bg-green-500/10", icon: CheckCircle2, label: "Gesund" },
  warning: { color: "#EAB308", bg: "bg-yellow-500/10", icon: AlertTriangle, label: "Warnung" },
  critical: { color: "#EF4444", bg: "bg-red-500/10", icon: XCircle, label: "Kritisch" },
  inactive: { color: "#71717A", bg: "bg-zinc-500/10", icon: Minus, label: "Inaktiv" },
};

export function AgentHealthDashboard() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const fetchHealth = useCallback(() => {
    fetch("/api/monitoring/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const acknowledgeAll = async () => {
    await fetch("/api/monitoring/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acknowledgeAll: true }),
    });
    fetchHealth();
  };

  const acknowledgeAlert = async (alertId: string) => {
    await fetch("/api/monitoring/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertId }),
    });
    fetchHealth();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
      </div>
    );
  }

  if (!health) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <Activity className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
        <p className="text-xs text-zinc-500">Keine Health-Daten verfügbar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* System Overview */}
      <div className="grid gap-4 sm:grid-cols-5">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:col-span-2">
          <div className="mb-1 text-[11px] text-zinc-500">Gesamte Uptime</div>
          <div className="text-3xl font-bold text-zinc-100">
            {health.overallUptime}%
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${health.overallUptime}%`,
                backgroundColor: health.overallUptime >= 95 ? "#22C55E" : health.overallUptime >= 80 ? "#EAB308" : "#EF4444",
              }}
            />
          </div>
        </div>

        {(["healthy", "warning", "critical", "inactive"] as const).map((status) => {
          const config = STATUS_CONFIG[status];
          const count = health[`${status}Agents` as keyof SystemHealth] as number;
          const Icon = config.icon;

          return (
            <div key={status} className={`rounded-xl border border-zinc-800 ${config.bg} p-4`}>
              <div className="mb-1 flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" style={{ color: config.color }} />
                <span className="text-[11px] text-zinc-500">{config.label}</span>
              </div>
              <div className="text-2xl font-bold" style={{ color: config.color }}>
                {count}
              </div>
            </div>
          );
        })}
      </div>

      {/* Alerts */}
      {health.alerts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-orange-400" />
              <h3 className="text-sm font-semibold text-zinc-100">
                Aktive Alerts ({health.alerts.length})
              </h3>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={acknowledgeAll}
              className="text-xs h-7 border-zinc-700"
            >
              <BellOff className="mr-1.5 h-3 w-3" />
              Alle bestätigen
            </Button>
          </div>
          {health.alerts.slice(0, 5).map((alert) => (
            <div
              key={alert.id}
              className={`flex items-start gap-3 rounded-lg border p-3 ${
                alert.severity === "critical"
                  ? "border-red-500/30 bg-red-500/5"
                  : "border-yellow-500/30 bg-yellow-500/5"
              }`}
            >
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0"
                style={{ color: alert.severity === "critical" ? "#EF4444" : "#EAB308" }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-zinc-200">{alert.message}</p>
                <span className="text-[10px] text-zinc-600">
                  {new Date(alert.createdAt).toLocaleString("de-DE")}
                </span>
              </div>
              <button
                onClick={() => acknowledgeAlert(alert.id)}
                className="shrink-0 rounded px-2 py-1 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              >
                OK
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Agent Table */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-zinc-100">Agent Health</h3>
        <div className="space-y-1">
          {health.agents
            .sort((a, b) => {
              const order = { critical: 0, warning: 1, healthy: 2, inactive: 3 };
              return (order[a.status] ?? 9) - (order[b.status] ?? 9);
            })
            .map((agent) => {
              const config = STATUS_CONFIG[agent.status];
              const Icon = config.icon;
              const isExpanded = expandedAgent === agent.agentId;

              return (
                <div
                  key={agent.agentId}
                  className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedAgent(isExpanded ? null : agent.agentId)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-zinc-800/20"
                  >
                    <Icon className="h-4 w-4 shrink-0" style={{ color: config.color }} />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-zinc-200">{agent.agentName}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 text-[11px]">
                      <span className="text-zinc-500">
                        <span style={{ color: config.color }}>{agent.uptime}%</span> uptime
                      </span>
                      <span className="text-zinc-600">{agent.avgResponseTime}ms avg</span>
                      <span className="text-zinc-600">{agent.totalRuns} runs</span>
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5 text-zinc-600" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-zinc-600" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-zinc-800/50 px-3 py-3 space-y-3">
                      {/* Error Breakdown */}
                      {Object.keys(agent.errorBreakdown).length > 0 && (
                        <div>
                          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                            Fehler-Verteilung
                          </span>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {Object.entries(agent.errorBreakdown).map(([type, count]) => (
                              <span
                                key={type}
                                className="rounded bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400"
                              >
                                {type}: {count}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Last Error */}
                      {agent.lastError && (
                        <div>
                          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                            Letzter Fehler
                          </span>
                          <div className="mt-1 flex items-center gap-2 text-[11px]">
                            <Clock className="h-3 w-3 text-zinc-600" />
                            <span className="text-zinc-500">
                              {new Date(agent.lastError.at).toLocaleString("de-DE")}
                            </span>
                            <span className="text-red-400">{agent.lastError.type}</span>
                          </div>
                          {agent.lastError.message && (
                            <p className="mt-1 text-[11px] text-zinc-500 line-clamp-2">
                              {agent.lastError.message}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Stats */}
                      <div className="flex gap-4 text-[10px] text-zinc-600">
                        <span>Fehlerrate: {agent.failureRate}%</span>
                        <span>Ø Antwortzeit: {agent.avgResponseTime}ms</span>
                        <span>Runs: {agent.totalRuns}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
