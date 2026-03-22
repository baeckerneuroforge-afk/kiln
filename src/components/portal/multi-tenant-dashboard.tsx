"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Building2,
  Bot,
  TrendingUp,
  Heart,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Loader2,
  Search,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────

interface ClientSummary {
  id: string;
  name: string;
  email: string;
  agentCount: number;
  totalRuns: number;
  healthScore: number;
  revenue: number;
  lastActive: string;
  agents: Array<{
    id: string;
    name: string;
    status: string;
    conversations: number;
    healthScore: number;
  }>;
}

interface OverviewStats {
  totalClients: number;
  totalAgents: number;
  totalRuns: number;
  totalRevenue: number;
  healthDistribution: {
    healthy: number;
    degraded: number;
    critical: number;
  };
}

// ── Main Component ───────────────────────────────────────────

export function MultiTenantDashboard() {
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/overview");
      if (res.ok) {
        const data = await res.json();
        setOverview(data.overview);
        setClients(data.clients || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-stone-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard
            label="Kunden"
            value={overview.totalClients}
            icon={Building2}
            color="text-kiln-orange"
          />
          <StatCard
            label="Agents"
            value={overview.totalAgents}
            icon={Bot}
            color="text-kiln-blue"
          />
          <StatCard
            label="Ausführungen"
            value={overview.totalRuns}
            icon={Zap}
            color="text-kiln-green"
          />
          <StatCard
            label="Umsatz"
            value={`€${overview.totalRevenue.toLocaleString("de-DE")}`}
            icon={TrendingUp}
            color="text-kiln-orange"
          />
          <StatCard
            label="Gesundheit"
            value={`${overview.healthDistribution.healthy}/${overview.totalClients}`}
            icon={Heart}
            color="text-kiln-green"
            subtitle={
              overview.healthDistribution.critical > 0
                ? `${overview.healthDistribution.critical} kritisch`
                : undefined
            }
            subtitleColor="text-red-400"
          />
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Kunden suchen..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-stone-900 border border-stone-800 text-white placeholder:text-stone-600 focus:border-kiln-orange focus:outline-none text-sm"
        />
      </div>

      {/* Client Table */}
      <div className="rounded-lg border border-stone-800 overflow-hidden">
        <div className="bg-stone-900/50 px-4 py-3 flex items-center gap-4 text-xs text-stone-500 font-medium">
          <div className="flex-1">Kunde</div>
          <div className="w-20 text-center">Agents</div>
          <div className="w-24 text-center">Ausführungen</div>
          <div className="w-24 text-center">Gesundheit</div>
          <div className="w-24 text-right">Umsatz</div>
          <div className="w-32 text-right">Letzte Aktivität</div>
          <div className="w-20"></div>
        </div>

        {filteredClients.length === 0 ? (
          <div className="text-center py-12 text-stone-500">
            <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>Keine Kunden gefunden.</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-800/50">
            {filteredClients.map((client) => (
              <div key={client.id}>
                {/* Client Row */}
                <div className="px-4 py-3 flex items-center gap-4 hover:bg-stone-900/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{client.name}</div>
                    <div className="text-xs text-stone-500 truncate">{client.email}</div>
                  </div>
                  <div className="w-20 text-center text-sm text-stone-300">
                    {client.agentCount}
                  </div>
                  <div className="w-24 text-center text-sm text-stone-300">
                    {client.totalRuns.toLocaleString("de-DE")}
                  </div>
                  <div className="w-24 text-center">
                    <HealthBadge score={client.healthScore} />
                  </div>
                  <div className="w-24 text-right text-sm text-stone-300">
                    €{client.revenue.toLocaleString("de-DE")}
                  </div>
                  <div className="w-32 text-right text-xs text-stone-500">
                    {new Date(client.lastActive).toLocaleDateString("de-DE")}
                  </div>
                  <div className="w-20 flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-stone-400 hover:text-white p-1"
                      onClick={() =>
                        setExpandedId(expandedId === client.id ? null : client.id)
                      }
                    >
                      {expandedId === client.id ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-stone-400 hover:text-kiln-orange p-1"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Expanded: Client's Agents */}
                {expandedId === client.id && (
                  <div className="px-4 pb-4 pt-1">
                    <div className="ml-4 space-y-2">
                      {client.agents.map((agent) => (
                        <div
                          key={agent.id}
                          className="flex items-center justify-between px-3 py-2 rounded bg-stone-900/50 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <Bot className="w-3.5 h-3.5 text-stone-500" />
                            <span className="text-stone-300">{agent.name}</span>
                            <span
                              className={cn(
                                "text-xs px-1.5 py-0.5 rounded",
                                agent.status === "LIVE"
                                  ? "bg-kiln-green/10 text-kiln-green"
                                  : agent.status === "DRAFT"
                                    ? "bg-stone-700/50 text-stone-400"
                                    : "bg-yellow-500/10 text-yellow-400"
                              )}
                            >
                              {agent.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-xs text-stone-500">
                              {agent.conversations} Gespräche
                            </span>
                            <HealthBadge score={agent.healthScore} size="sm" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helper Components ────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  subtitle,
  subtitleColor,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  subtitle?: string;
  subtitleColor?: string;
}) {
  return (
    <div className="rounded-lg border border-stone-800 bg-stone-900/30 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("w-4 h-4", color)} />
        <span className="text-xs text-stone-500">{label}</span>
      </div>
      <div className="text-xl font-serif text-white">{value}</div>
      {subtitle && (
        <div className={cn("text-xs mt-1", subtitleColor || "text-stone-500")}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

function HealthBadge({
  score,
  size = "md",
}: {
  score: number;
  size?: "sm" | "md";
}) {
  const label = score >= 80 ? "Gut" : score >= 50 ? "Mittel" : "Kritisch";
  const color =
    score >= 80
      ? "bg-kiln-green/10 text-kiln-green"
      : score >= 50
        ? "bg-yellow-500/10 text-yellow-400"
        : "bg-red-500/10 text-red-400";

  return (
    <span
      className={cn(
        "px-1.5 py-0.5 rounded font-medium",
        color,
        size === "sm" ? "text-[10px]" : "text-xs"
      )}
    >
      {label} {score}%
    </span>
  );
}
