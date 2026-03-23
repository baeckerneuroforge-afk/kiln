"use client";

import { useState, useEffect } from "react";
import { Building2, BarChart3, Settings2, Lock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MultiTenantDashboard } from "@/components/portal/multi-tenant-dashboard";
import { CrossClientAnalytics } from "@/components/portal/cross-client-analytics";
import { useUser } from "@clerk/nextjs";

const tabs = [
  { id: "overview", label: "Übersicht", icon: Building2 },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "operations", label: "Bulk Operationen", icon: Settings2 },
] as const;

type TabId = (typeof tabs)[number]["id"];

export default function ClientsDashboardPage() {
  const { user, isLoaded } = useUser();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [plan, setPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded || !user) return;
    // Plan vom User laden
    fetch("/api/stripe/plan")
      .then((res) => res.json())
      .then((data) => setPlan(data.plan || "FREE"))
      .catch(() => setPlan("FREE"))
      .finally(() => setLoading(false));
  }, [isLoaded, user]);

  if (!isLoaded || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-stone-500" />
      </div>
    );
  }

  // Feature Gate: Business+ only
  const hasAccess = plan === "AGENCY" || plan === "ENTERPRISE";

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 rounded-2xl bg-stone-800 flex items-center justify-center mb-4">
          <Lock className="w-8 h-8 text-stone-500" />
        </div>
        <h2 className="text-xl font-serif text-white mb-2">
          Multi-Tenant Dashboard
        </h2>
        <p className="text-stone-400 max-w-md mb-6">
          Verwalte alle deine Kunden, Agents und Analytics an einem Ort.
          Verfügbar ab dem Business-Plan.
        </p>
        <a
          href="/dashboard/settings"
          className="px-4 py-2 rounded-lg bg-kiln-orange hover:bg-kiln-orange/90 text-white text-sm font-medium transition-colors"
        >
          Plan upgraden
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-serif text-white">Kunden-Dashboard</h1>
        <p className="text-stone-400 mt-1">
          Verwalte alle deine Kunden und deren Agents
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-stone-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2",
              activeTab === tab.id
                ? "text-gray-400 border-kiln-orange"
                : "text-stone-500 border-transparent hover:text-stone-300"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && <MultiTenantDashboard />}
      {activeTab === "analytics" && <CrossClientAnalytics />}
      {activeTab === "operations" && (
        <div className="text-center py-12 text-stone-500">
          <Settings2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Bulk-Operationen werden bald verfügbar sein.</p>
          <p className="text-sm mt-1">
            Massenaktionen für Agents, Templates und Konfigurationen.
          </p>
        </div>
      )}
    </div>
  );
}
