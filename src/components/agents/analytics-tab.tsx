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
  ChevronDown,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  X,
  Sparkles,
  Bot,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConvMessage {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: string;
}

interface ConversationEntry {
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
  messages: ConvMessage[];
}

interface AnalyticsData {
  kpi: {
    totalConversations: number;
    totalLeads: number;
    totalAppointments: number;
    estimatedValue: number;
  };
  chartData: { date: string; conversations: number; leads: number; appointments: number }[];
  topIntents: { intent: string; count: number }[];
  conversationLog: ConversationEntry[];
  roi: {
    avgDealValue: number;
    estimatedValue: number;
    leadsValue: number;
    appointmentsValue: number;
  } | null;
  avgDealValue: number | null;
  correctionsThisWeek: number;
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

  // Expandable rows
  const [expandedConvs, setExpandedConvs] = useState<Set<string>>(new Set());

  // Correction modal
  const [correctionModal, setCorrectionModal] = useState<{
    messageId: string;
    userMessage: string;
    wrongAnswer: string;
  } | null>(null);
  const [correctionText, setCorrectionText] = useState("");
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  // Thumbs feedback tracking (local only)
  const [feedbackGiven, setFeedbackGiven] = useState<Map<string, "up" | "down">>(new Map());

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

  function toggleConversation(id: string) {
    setExpandedConvs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleThumbsUp(messageId: string) {
    setFeedbackGiven((prev) => new Map(prev).set(messageId, "up"));
  }

  function handleThumbsDown(messageId: string, messages: ConvMessage[]) {
    // Finde die vorherige User-Nachricht
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    const assistantMsg = messages[msgIndex];
    let userMsg = "";
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === "USER") {
        userMsg = messages[i].content;
        break;
      }
    }

    setFeedbackGiven((prev) => new Map(prev).set(messageId, "down"));
    setCorrectionModal({
      messageId,
      userMessage: userMsg,
      wrongAnswer: assistantMsg?.content || "",
    });
    setCorrectionText("");
  }

  async function submitCorrection() {
    if (!correctionModal || !correctionText.trim()) return;
    setSubmittingCorrection(true);
    try {
      await fetch(`/api/agents/${agentId}/corrections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: correctionModal.userMessage,
          wrongAnswer: correctionModal.wrongAnswer,
          correctAnswer: correctionText.trim(),
          messageId: correctionModal.messageId,
        }),
      });
      setCorrectionModal(null);
      setCorrectionText("");
      // Reload um Corrections-Stat zu aktualisieren
      await loadAnalytics();
    } catch {
      // Stille Fehlerbehandlung
    } finally {
      setSubmittingCorrection(false);
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
      c.actionsUsed.some((a) => a.toLowerCase().includes(q)) ||
      c.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-5">
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
          {
            label: "Corrections (Week)",
            value: data.correctionsThisWeek.toString(),
            icon: Sparkles,
            color: "text-purple-500",
            bg: "bg-purple-500/10",
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

      {/* Conversation Log — expandable with messages + feedback */}
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
              placeholder="Search email, name, action, message..."
              className="w-72 rounded-lg border border-border bg-background py-1.5 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {filteredLog.length > 0 ? (
          <div className="space-y-0">
            {/* Table Header */}
            <div className="grid grid-cols-[24px_1fr_80px_60px_60px_1fr_60px] gap-2 border-b border-border pb-2 text-xs font-medium text-muted-foreground">
              <div />
              <div>Date</div>
              <div>Visitor</div>
              <div>Msgs</div>
              <div>Score</div>
              <div>Actions</div>
              <div>Channel</div>
            </div>

            {filteredLog.map((conv) => {
              const isExpanded = expandedConvs.has(conv.id);
              return (
                <div key={conv.id} className="border-b border-border/50 last:border-0">
                  {/* Row */}
                  <button
                    onClick={() => toggleConversation(conv.id)}
                    className="grid w-full grid-cols-[24px_1fr_80px_60px_60px_1fr_60px] gap-2 py-2.5 text-left transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-center">
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(conv.createdAt).toLocaleDateString("de-DE", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <div className="truncate">
                      {conv.visitorEmail ? (
                        <span className="text-xs text-muted-foreground">{conv.visitorEmail}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">Anonymous</span>
                      )}
                    </div>
                    <div className="text-xs text-foreground">{conv.messageCount}</div>
                    <div>
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
                    </div>
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
                    <div className="text-xs text-muted-foreground">{conv.channel}</div>
                  </button>

                  {/* Expanded Messages */}
                  {isExpanded && conv.messages.length > 0 && (
                    <div className="mb-3 ml-6 space-y-2 rounded-lg border border-border/50 bg-background p-3">
                      {conv.messages.map((msg) => (
                        <div key={msg.id} className="group flex items-start gap-2">
                          <div className={cn(
                            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                            msg.role === "USER" ? "bg-muted" : "bg-kiln-orange/10"
                          )}>
                            {msg.role === "USER" ? (
                              <User className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <Bot className="h-3 w-3 text-kiln-orange" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap break-words">
                              {msg.content.length > 500
                                ? msg.content.slice(0, 500) + "..."
                                : msg.content}
                            </p>
                          </div>

                          {/* Thumbs Up/Down — nur für Assistant-Nachrichten */}
                          {msg.role === "ASSISTANT" && (
                            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                              {feedbackGiven.get(msg.id) === "up" ? (
                                <span className="rounded p-1 text-kiln-green">
                                  <ThumbsUp className="h-3.5 w-3.5 fill-current" />
                                </span>
                              ) : feedbackGiven.get(msg.id) === "down" ? (
                                <span className="rounded p-1 text-red-500">
                                  <ThumbsDown className="h-3.5 w-3.5 fill-current" />
                                </span>
                              ) : (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleThumbsUp(msg.id);
                                    }}
                                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-kiln-green/10 hover:text-kiln-green"
                                    title="Good answer"
                                  >
                                    <ThumbsUp className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleThumbsDown(msg.id, conv.messages);
                                    }}
                                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                                    title="Bad answer — provide correction"
                                  >
                                    <ThumbsDown className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {searchQuery ? "No conversations match your search." : "No conversations yet."}
          </p>
        )}
      </div>

      {/* Correction Modal */}
      {correctionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                <h3 className="text-sm font-semibold text-foreground">Train Agent</h3>
              </div>
              <button
                onClick={() => setCorrectionModal(null)}
                className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* User Message */}
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                User asked:
              </label>
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-foreground">
                {correctionModal.userMessage || "(no user message found)"}
              </div>
            </div>

            {/* Wrong Answer */}
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Agent answered (wrong):
              </label>
              <div className="max-h-24 overflow-y-auto rounded-lg bg-red-500/5 border border-red-500/20 px-3 py-2 text-xs text-foreground">
                {correctionModal.wrongAnswer.length > 300
                  ? correctionModal.wrongAnswer.slice(0, 300) + "..."
                  : correctionModal.wrongAnswer}
              </div>
            </div>

            {/* Correct Answer */}
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Correct answer:
              </label>
              <textarea
                value={correctionText}
                onChange={(e) => setCorrectionText(e.target.value)}
                rows={4}
                placeholder="Type the correct answer the agent should give..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">
                Saved as FAQ in Knowledge Base. RAG picks it up automatically.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCorrectionModal(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={submitCorrection}
                  disabled={!correctionText.trim() || submittingCorrection}
                >
                  {submittingCorrection ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-3.5 w-3.5" />
                  )}
                  Save Correction
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
