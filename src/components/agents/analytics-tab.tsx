"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  MessageSquare,
  Users,
  CalendarCheck,
  Euro,
  Search,
  TrendingUp,
  Loader2,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AnalyticsData {
  kpi: {
    totalConversations: number;
    totalLeads: number;
    totalAppointments: number;
    estimatedValue: number;
  };
  chartData: { date: string; conversations: number; leads: number; appointments: number }[];
  topIntents: { intent: string; count: number }[];
  conversationLog: {
    id: string;
    sessionId: string;
    channel: string;
    leadScore: number | null;
    sentiment: number | null;
    actionsUsed: string[];
    visitorName: string | null;
    visitorEmail: string | null;
    messageCount: number;
    createdAt: string;
  }[];
  roi: {
    avgDealValue: number;
    estimatedValue: number;
    leadsValue: number;
    appointmentsValue: number;
  } | null;
  avgDealValue: number | null;
}

interface AnalyticsTabProps {
  agentId: string;
}

export function AnalyticsTab({ agentId }: AnalyticsTabProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [avgDealValue, setAvgDealValue] = useState("");
  const [savingDealValue, setSavingDealValue] = useState(false);

  const loadAnalytics = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/analytics`);
      if (res.ok) {
        const d = await res.json();
        setData(d);
        if (d.avgDealValue) setAvgDealValue(d.avgDealValue.toString());
      }
    } catch {
      // Stille Fehlerbehandlung
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  async function saveDealValue() {
    setSavingDealValue(true);
    try {
      await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avgDealValue: parseFloat(avgDealValue) || 0 }),
      });
      await loadAnalytics();
    } catch {
      // Stille Fehlerbehandlung
    } finally {
      setSavingDealValue(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">Analytics could not be loaded.</p>
      </div>
    );
  }

  const filteredLog = data.conversationLog.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (c.visitorEmail?.toLowerCase().includes(q)) ||
      (c.visitorName?.toLowerCase().includes(q)) ||
      c.sessionId.toLowerCase().includes(q) ||
      c.actionsUsed.some((a) => a.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          {
            label: "Conversations",
            value: data.kpi.totalConversations.toString(),
            icon: MessageSquare,
            color: "text-blue-500",
            bg: "bg-blue-500/10",
          },
          {
            label: "Leads",
            value: data.kpi.totalLeads.toString(),
            icon: Users,
            color: "text-kiln-orange",
            bg: "bg-kiln-orange/10",
          },
          {
            label: "Appointments",
            value: data.kpi.totalAppointments.toString(),
            icon: CalendarCheck,
            color: "text-kiln-green",
            bg: "bg-kiln-green/10",
          },
          {
            label: "Est. Value",
            value: `€${data.kpi.estimatedValue.toLocaleString("de-DE")}`,
            icon: Euro,
            color: "text-yellow-500",
            bg: "bg-yellow-500/10",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <div className={cn("rounded-lg p-2", stat.bg)}>
                <stat.icon className={cn("h-4 w-4", stat.color)} />
              </div>
            </div>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Conversations Chart — 30 Tage */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-foreground">
          Conversations — Last 30 Days
        </h3>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.chartData}>
              <defs>
                <linearGradient id="colorConv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#292524" />
              <XAxis
                dataKey="date"
                stroke="#78716C"
                fontSize={11}
                tickFormatter={(v) => {
                  const d = new Date(v);
                  return `${d.getDate()}.${d.getMonth() + 1}`;
                }}
                interval="preserveStartEnd"
              />
              <YAxis stroke="#78716C" fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1C1917",
                  border: "1px solid #292524",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#FAFAF9",
                }}
                labelFormatter={(v) => {
                  const d = new Date(v);
                  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
                }}
              />
              <Area
                type="monotone"
                dataKey="conversations"
                stroke="#3B82F6"
                strokeWidth={2}
                fill="url(#colorConv)"
                name="Conversations"
              />
              <Area
                type="monotone"
                dataKey="leads"
                stroke="#F97316"
                strokeWidth={2}
                fill="url(#colorLeads)"
                name="Leads"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row: Top Intents + ROI */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top-5 Intents */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">
            Top 5 Intents
          </h3>
          {data.topIntents.length > 0 ? (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topIntents} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#292524" horizontal={false} />
                  <XAxis type="number" stroke="#78716C" fontSize={11} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="intent"
                    stroke="#78716C"
                    fontSize={11}
                    width={100}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1C1917",
                      border: "1px solid #292524",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "#FAFAF9",
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="#F97316"
                    radius={[0, 4, 4, 0]}
                    name="Mentions"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Not enough data yet.
            </p>
          )}
        </div>

        {/* ROI Calculator */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-kiln-green" />
            <h3 className="text-sm font-semibold text-foreground">
              ROI Calculator
            </h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Average Deal Value (EUR)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={avgDealValue}
                  onChange={(e) => setAvgDealValue(e.target.value)}
                  placeholder="e.g. 500"
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={saveDealValue}
                  disabled={savingDealValue}
                >
                  {savingDealValue ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>

            {data.roi ? (
              <div className="space-y-3 rounded-lg bg-kiln-green/5 p-4 border border-kiln-green/20">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Leads ({data.kpi.totalLeads}) &times; 10% close rate</span>
                  <span className="font-medium text-foreground">€{data.roi.leadsValue.toLocaleString("de-DE")}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Appointments ({data.kpi.totalAppointments}) &times; 30% close rate</span>
                  <span className="font-medium text-foreground">€{data.roi.appointmentsValue.toLocaleString("de-DE")}</span>
                </div>
                <div className="border-t border-kiln-green/20 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">Estimated Value (30d)</span>
                    <span className="text-lg font-bold text-kiln-green">
                      €{data.roi.estimatedValue.toLocaleString("de-DE")}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                Set your average deal value to calculate ROI.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Conversation Log */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">
            Conversation Log
          </h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search email, name, action..."
              className="w-64 rounded-lg border border-border bg-background py-1.5 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {filteredLog.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 pr-4 text-xs font-medium text-muted-foreground">Date</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-muted-foreground">Visitor</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-muted-foreground">Messages</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-muted-foreground">Score</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-muted-foreground">Actions</th>
                  <th className="pb-2 text-xs font-medium text-muted-foreground">Channel</th>
                </tr>
              </thead>
              <tbody>
                {filteredLog.map((conv) => (
                  <tr key={conv.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                      {new Date(conv.createdAt).toLocaleDateString("de-DE", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-2.5 pr-4">
                      <div>
                        {conv.visitorName && (
                          <p className="text-xs font-medium text-foreground">{conv.visitorName}</p>
                        )}
                        {conv.visitorEmail ? (
                          <p className="text-xs text-muted-foreground">{conv.visitorEmail}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground/50">Anonymous</p>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-foreground">
                      {conv.messageCount}
                    </td>
                    <td className="py-2.5 pr-4">
                      {conv.leadScore ? (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            conv.leadScore >= 7
                              ? "bg-kiln-green/10 text-kiln-green"
                              : conv.leadScore >= 4
                              ? "bg-yellow-500/10 text-yellow-500"
                              : "bg-red-500/10 text-red-500"
                          )}
                        >
                          {conv.leadScore}/10
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {conv.actionsUsed.length > 0 ? (
                          conv.actionsUsed.map((a) => (
                            <span
                              key={a}
                              className="inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                            >
                              {a.replace(/_/g, " ").toLowerCase()}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground">
                      {conv.channel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {searchQuery ? "No conversations match your search." : "No conversations yet."}
          </p>
        )}
      </div>
    </div>
  );
}
