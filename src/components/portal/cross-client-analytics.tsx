"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart3,
  Download,
  Calendar,
  Filter,
  Loader2,
  TrendingUp,
  Activity,
  DollarSign,
  Heart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────

interface ClientAnalytics {
  clientId: string;
  clientName: string;
  revenue: number;
  agentCount: number;
  runs: number;
  avgHealthScore: number;
  costCents: number;
  conversations: number;
}

interface AnalyticsData {
  clients: ClientAnalytics[];
  totals: {
    revenue: number;
    runs: number;
    conversations: number;
    costCents: number;
    avgHealthScore: number;
  };
}

// ── Main Component ───────────────────────────────────────────

export function CrossClientAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState("30d");
  const [selectedClients, setSelectedClients] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/portal/analytics?range=${dateRange}${selectedClients.length > 0 ? `&clients=${selectedClients.join(",")}` : ""}`
      );
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedClients]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExportCSV = () => {
    if (!data) return;

    const headers = ["Kunde", "Umsatz", "Agents", "Ausführungen", "Gespräche", "Kosten", "Gesundheit"];
    const rows = data.clients.map((c) => [
      c.clientName,
      c.revenue,
      c.agentCount,
      c.runs,
      c.conversations,
      (c.costCents / 100).toFixed(2),
      c.avgHealthScore,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kiln-analytics-${dateRange}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleClient = (clientId: string) => {
    setSelectedClients((prev) =>
      prev.includes(clientId)
        ? prev.filter((c) => c !== clientId)
        : [...prev, clientId]
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-stone-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-stone-500">
        Keine Daten verfügbar.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-stone-500" />
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="text-sm bg-stone-900 border border-stone-700 rounded-md px-3 py-1.5 text-white focus:outline-none focus:border-kiln-orange"
          >
            <option value="7d">Letzte 7 Tage</option>
            <option value="30d">Letzte 30 Tage</option>
            <option value="90d">Letzte 90 Tage</option>
            <option value="365d">Letztes Jahr</option>
          </select>

          {data.clients.length > 0 && (
            <div className="flex items-center gap-1 ml-2">
              <Filter className="w-4 h-4 text-stone-500" />
              {data.clients.slice(0, 5).map((c) => (
                <button
                  key={c.clientId}
                  onClick={() => toggleClient(c.clientId)}
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full border transition-colors",
                    selectedClients.includes(c.clientId)
                      ? "border-kiln-orange/50 bg-kiln-orange/10 text-kiln-orange"
                      : "border-stone-700 text-stone-500 hover:text-stone-300"
                  )}
                >
                  {c.clientName}
                </button>
              ))}
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleExportCSV}
          className="text-stone-400 hover:text-white"
        >
          <Download className="w-4 h-4 mr-1" />
          CSV Export
        </Button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <TotalCard
          label="Gesamtumsatz"
          value={`€${data.totals.revenue.toLocaleString("de-DE")}`}
          icon={TrendingUp}
          color="text-kiln-orange"
        />
        <TotalCard
          label="Ausführungen"
          value={data.totals.runs.toLocaleString("de-DE")}
          icon={Activity}
          color="text-kiln-blue"
        />
        <TotalCard
          label="Gespräche"
          value={data.totals.conversations.toLocaleString("de-DE")}
          icon={BarChart3}
          color="text-kiln-green"
        />
        <TotalCard
          label="Gesamtkosten"
          value={`€${(data.totals.costCents / 100).toFixed(2)}`}
          icon={DollarSign}
          color="text-yellow-400"
        />
        <TotalCard
          label="Ø Gesundheit"
          value={`${data.totals.avgHealthScore}%`}
          icon={Heart}
          color={data.totals.avgHealthScore >= 80 ? "text-kiln-green" : "text-yellow-400"}
        />
      </div>

      {/* Revenue per Client */}
      <div className="rounded-lg border border-stone-800 bg-stone-900/30 p-4">
        <h3 className="text-sm font-medium text-stone-400 mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Umsatz pro Kunde
        </h3>
        <div className="space-y-3">
          {data.clients
            .sort((a, b) => b.revenue - a.revenue)
            .map((client) => {
              const maxRevenue = Math.max(...data.clients.map((c) => c.revenue), 1);
              const width = Math.max((client.revenue / maxRevenue) * 100, 2);

              return (
                <div key={client.clientId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-stone-300">{client.clientName}</span>
                    <span className="text-white font-mono">
                      €{client.revenue.toLocaleString("de-DE")}
                    </span>
                  </div>
                  <div className="h-2 bg-stone-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-kiln-orange to-kiln-ember rounded-full transition-all duration-500"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Cost per Client */}
      <div className="rounded-lg border border-stone-800 bg-stone-900/30 p-4">
        <h3 className="text-sm font-medium text-stone-400 mb-4 flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          Kosten pro Kunde
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-stone-500 text-xs">
                <th className="text-left py-2">Kunde</th>
                <th className="text-right py-2">Agents</th>
                <th className="text-right py-2">Runs</th>
                <th className="text-right py-2">Kosten</th>
                <th className="text-right py-2">Marge</th>
                <th className="text-right py-2">Gesundheit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/50">
              {data.clients.map((client) => {
                const cost = client.costCents / 100;
                const margin = client.revenue > 0 ? ((client.revenue - cost) / client.revenue) * 100 : 0;

                return (
                  <tr key={client.clientId} className="text-stone-300">
                    <td className="py-2">{client.clientName}</td>
                    <td className="py-2 text-right">{client.agentCount}</td>
                    <td className="py-2 text-right">{client.runs}</td>
                    <td className="py-2 text-right font-mono">€{cost.toFixed(2)}</td>
                    <td className="py-2 text-right">
                      <span
                        className={cn(
                          "font-mono",
                          margin >= 70 ? "text-kiln-green" : margin >= 40 ? "text-yellow-400" : "text-red-400"
                        )}
                      >
                        {margin.toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <span
                        className={cn(
                          "text-xs px-1.5 py-0.5 rounded",
                          client.avgHealthScore >= 80
                            ? "bg-kiln-green/10 text-kiln-green"
                            : client.avgHealthScore >= 50
                              ? "bg-yellow-500/10 text-yellow-400"
                              : "bg-red-500/10 text-red-400"
                        )}
                      >
                        {client.avgHealthScore}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Helper ───────────────────────────────────────────────────

function TotalCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-stone-800 bg-stone-900/30 p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn("w-3.5 h-3.5", color)} />
        <span className="text-xs text-stone-500">{label}</span>
      </div>
      <div className="text-lg font-serif text-white">{value}</div>
    </div>
  );
}
