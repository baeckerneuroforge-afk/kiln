"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Home,
  Bot,
  Sparkles,
  Bell,
  MoreHorizontal,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileNotifications } from "./mobile-notifications";
import { MobileQuickActions } from "./mobile-quick-actions";

// ── Types ────────────────────────────────────────────────────

interface AgentSummary {
  id: string;
  name: string;
  status: string;
  conversationCount: number;
}

interface DashboardStats {
  totalAgents: number;
  totalConversations: number;
  totalLeads: number;
  plan: string;
}

type TabId = "home" | "agents" | "chat" | "alerts" | "more";

const TABS: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "chat", label: "Chat", icon: Sparkles },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "more", label: "Mehr", icon: MoreHorizontal },
];

// ── Mobile Dashboard Shell ──────────────────────────────────

export function MobileDashboard({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [showMobileView, setShowMobileView] = useState(false);

  useEffect(() => {
    const check = () => setShowMobileView(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Don't render mobile shell on desktop
  if (!showMobileView) return <>{children}</>;

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      {/* Content Area */}
      <div className="flex-1 overflow-y-auto overscroll-contain pb-16">
        {activeTab === "home" && <MobileHomeTab />}
        {activeTab === "agents" && <MobileAgentsTab />}
        {activeTab === "chat" && <MobileChatRedirect />}
        {activeTab === "alerts" && <MobileNotifications />}
        {activeTab === "more" && <MobileMoreTab />}
      </div>

      {/* FAB */}
      <MobileQuickActions />

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur-md safe-bottom">
        <div className="flex items-center justify-around px-2 py-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg transition-colors min-w-[56px]",
                activeTab === tab.id
                  ? "text-kiln-orange"
                  : "text-muted-foreground active:text-foreground"
              )}
            >
              <tab.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{tab.label}</span>
              {tab.id === "alerts" && <AlertBadge />}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

// ── Alert Badge ─────────────────────────────────────────────

function AlertBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetch("/api/approvals")
      .then((r) => r.json())
      .then((data) => setCount((data.approvals || []).length))
      .catch(() => {});
  }, []);

  if (count === 0) return null;

  return (
    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-kiln-ember px-1 text-[9px] font-bold text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}

// ── Home Tab ────────────────────────────────────────────────

function MobileHomeTab() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const [agentsRes, planRes] = await Promise.all([
        fetch("/api/agents").then((r) => r.json()),
        fetch("/api/stripe/plan").then((r) => r.json()),
      ]);

      const agentList = agentsRes.agents || agentsRes || [];
      setAgents(Array.isArray(agentList) ? agentList.slice(0, 10) : []);
      setStats({
        totalAgents: Array.isArray(agentList) ? agentList.length : 0,
        totalConversations: Array.isArray(agentList)
          ? agentList.reduce((s: number, a: AgentSummary) => s + (a.conversationCount || 0), 0)
          : 0,
        totalLeads: 0,
        plan: planRes.plan || "FREE",
      });
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-stone-500" />
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="p-4 space-y-5">
      {/* Pull-to-refresh button */}
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-xl text-white">Dashboard</h1>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 rounded-lg text-muted-foreground hover:text-white transition-colors"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </button>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Agents" value={stats.totalAgents} color="text-kiln-orange" />
          <StatCard label="Gespräche" value={stats.totalConversations} color="text-kiln-blue" />
          <StatCard label="Plan" value={stats.plan} color="text-purple-400" />
          <StatCard label="Agents Live" value={agents.filter((a) => a.status === "LIVE").length} color="text-kiln-green" />
        </div>
      )}

      {/* Recent Agents */}
      <div>
        <h2 className="text-sm font-medium text-stone-400 mb-3">Deine Agents</h2>
        <div className="space-y-2">
          {agents.map((agent) => (
            <a
              key={agent.id}
              href={`/dashboard/agents/${agent.id}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 active:bg-muted transition-colors"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-kiln-orange/20 to-kiln-ember/20">
                <Bot className="h-5 w-5 text-kiln-orange" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{agent.name}</div>
                <div className="text-xs text-stone-500">{agent.conversationCount || 0} Gespräche</div>
              </div>
              <span
                className={cn(
                  "text-[10px] font-medium px-2 py-0.5 rounded-full",
                  agent.status === "LIVE"
                    ? "bg-kiln-green/10 text-kiln-green"
                    : agent.status === "DRAFT"
                      ? "bg-stone-700/50 text-stone-400"
                      : "bg-yellow-500/10 text-yellow-400"
                )}
              >
                {agent.status}
              </span>
            </a>
          ))}
          {agents.length === 0 && (
            <div className="text-center py-8 text-stone-500">
              <Bot className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Noch keine Agents erstellt.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-xs text-stone-500 mb-1">{label}</div>
      <div className={cn("text-lg font-serif", color)}>{value}</div>
    </div>
  );
}

// ── Agents Tab ──────────────────────────────────────────────

function MobileAgentsTab() {
  return (
    <div className="p-4">
      <h1 className="font-serif text-xl text-white mb-4">AI Agents</h1>
      <p className="text-sm text-stone-400 mb-4">
        Verwalte deine Agents. Tippe auf einen Agent für Details.
      </p>
      {/* Reuse home tab agent list with link to full agent page */}
      <MobileHomeTab />
    </div>
  );
}

// ── Chat Redirect ───────────────────────────────────────────

function MobileChatRedirect() {
  // The MetaAgentChat is already rendered as a floating component.
  // Trigger it to open programmatically.
  useEffect(() => {
    // Dispatch custom event to open meta-agent chat
    window.dispatchEvent(new CustomEvent("kiln:open-meta-agent"));
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <Sparkles className="h-10 w-10 text-kiln-orange mb-4" />
      <h2 className="font-serif text-lg text-white mb-2">KILN Assistant</h2>
      <p className="text-sm text-stone-400">
        Der Chat-Assistent öffnet sich automatisch. Falls nicht, tippe auf das
        Sparkles-Icon unten rechts.
      </p>
    </div>
  );
}

// ── More Tab ────────────────────────────────────────────────

function MobileMoreTab() {
  const links = [
    { href: "/dashboard/settings", label: "Einstellungen", icon: "⚙️" },
    { href: "/dashboard/knowledge", label: "Knowledge Graph", icon: "🧠" },
    { href: "/marketplace", label: "Marketplace", icon: "🏪" },
    { href: "/dashboard/integrations", label: "Integrationen", icon: "🔌" },
    { href: "/dashboard/operations", label: "Operations", icon: "📊" },
    { href: "/developers", label: "Developers", icon: "💻" },
  ];

  return (
    <div className="p-4">
      <h1 className="font-serif text-xl text-white mb-4">Mehr</h1>
      <div className="space-y-2">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 active:bg-muted transition-colors"
          >
            <span className="text-lg">{link.icon}</span>
            <span className="text-sm font-medium text-white">{link.label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
