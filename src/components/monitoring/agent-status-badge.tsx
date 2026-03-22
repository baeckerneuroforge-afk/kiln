"use client";

import { useState, useEffect } from "react";

type HealthStatus = "healthy" | "warning" | "critical" | "inactive" | "loading";

const STATUS_COLORS: Record<HealthStatus, string> = {
  healthy: "bg-green-500",
  warning: "bg-yellow-500",
  critical: "bg-red-500",
  inactive: "bg-zinc-600",
  loading: "bg-zinc-700",
};

const STATUS_TOOLTIPS: Record<HealthStatus, string> = {
  healthy: "Gesund — keine Fehler",
  warning: "Warnung — erhöhte Fehlerrate",
  critical: "Kritisch — Agent fehlerhaft",
  inactive: "Inaktiv — keine kürzlichen Runs",
  loading: "Lade Status...",
};

/**
 * Kleiner farbiger Dot der den Health-Status eines Agents anzeigt.
 * Kann auf Agent-Karten im Dashboard eingebettet werden.
 */
export function AgentStatusBadge({ agentId }: { agentId: string }) {
  const [status, setStatus] = useState<HealthStatus>("loading");
  const [tooltip, setTooltip] = useState("");

  useEffect(() => {
    fetch(`/api/monitoring/health/${agentId}?days=7`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.health) {
          setStatus(data.health.status);
          const uptime = data.health.uptime;
          const errors = data.health.totalRuns - Math.round(data.health.totalRuns * uptime / 100);
          setTooltip(`${uptime}% uptime, ${errors} Fehler (7 Tage)`);
        } else {
          setStatus("inactive");
          setTooltip("Keine Health-Daten");
        }
      })
      .catch(() => {
        setStatus("inactive");
        setTooltip("Health-Check fehlgeschlagen");
      });
  }, [agentId]);

  return (
    <div className="group relative inline-flex">
      <div
        className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[status]} ${
          status === "critical" ? "animate-pulse" : ""
        }`}
      />
      {/* Tooltip */}
      <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {tooltip || STATUS_TOOLTIPS[status]}
      </div>
    </div>
  );
}
