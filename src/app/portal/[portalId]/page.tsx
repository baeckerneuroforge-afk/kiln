"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Bot, TrendingUp, Users, DollarSign, ExternalLink } from "lucide-react";

interface PortalData {
  portal: {
    id: string;
    name: string;
    clientName?: string;
    branding?: { logo?: string; primaryColor?: string; companyName?: string };
  };
  agents: {
    id: string;
    name: string;
    slug: string;
    description?: string;
    status: string;
    analytics: { date: string; totalConversations: number; totalLeads: number; estimatedValue: number }[];
  }[];
  analytics: { date: string; conversations: number; leads: number; value: number }[] | null;
}

export default function PortalPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const portalId = params.portalId as string;
  const token = searchParams.get("token") || "";

  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portal/${portalId}`, {
      headers: { "x-portal-token": token },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject("Zugang nicht autorisiert")))
      .then(setData)
      .catch((e) => setError(typeof e === "string" ? e : "Fehler beim Laden"));
  }, [portalId, token]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0C0A09]">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
            <span className="text-2xl">🔒</span>
          </div>
          <h1 className="mb-2 text-xl font-semibold text-zinc-100">Zugriff verweigert</h1>
          <p className="text-sm text-zinc-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0C0A09]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  const branding = data.portal.branding;
  const accentColor = branding?.primaryColor || "#F97316";
  const companyName = branding?.companyName || "KILN";

  // Totals aus Analytics
  const totalConversations = data.analytics?.reduce((s, a) => s + a.conversations, 0) || 0;
  const totalLeads = data.analytics?.reduce((s, a) => s + a.leads, 0) || 0;
  const totalValue = data.analytics?.reduce((s, a) => s + a.value, 0) || 0;

  return (
    <div className="min-h-screen bg-[#0C0A09] text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {branding?.logo ? (
              <img src={branding.logo} alt="" className="h-8 w-8 rounded-lg object-cover" />
            ) : (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}99)` }}
              >
                <span className="font-serif text-sm font-bold text-white">
                  {companyName.charAt(0)}
                </span>
              </div>
            )}
            <span className="font-serif text-lg">{companyName}</span>
          </div>
          <div className="text-xs text-zinc-500">
            {data.portal.clientName || "Client Portal"}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="mb-1 text-2xl font-bold">{data.portal.name}</h1>
        <p className="mb-8 text-sm text-zinc-500">Übersicht über Ihre AI Agents</p>

        {/* Stats Cards */}
        {data.analytics && (
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <StatCard
              icon={<Users className="h-4 w-4" />}
              label="Gespräche (30 Tage)"
              value={totalConversations.toLocaleString("de-DE")}
              color={accentColor}
            />
            <StatCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Leads"
              value={totalLeads.toLocaleString("de-DE")}
              color="#22C55E"
            />
            <StatCard
              icon={<DollarSign className="h-4 w-4" />}
              label="Geschätzter Wert"
              value={`€${totalValue.toLocaleString("de-DE", { minimumFractionDigits: 0 })}`}
              color="#3B82F6"
            />
          </div>
        )}

        {/* Agents */}
        <h2 className="mb-4 text-lg font-semibold">Agents</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {data.agents.map((agent) => {
            const last7Conversations = agent.analytics.reduce((s, a) => s + a.totalConversations, 0);
            const last7Leads = agent.analytics.reduce((s, a) => s + a.totalLeads, 0);

            return (
              <div
                key={agent.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition-colors hover:border-zinc-700"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${accentColor}15` }}
                    >
                      <Bot className="h-4 w-4" style={{ color: accentColor }} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">{agent.name}</h3>
                      <span
                        className={`text-[10px] font-medium uppercase tracking-wider ${
                          agent.status === "LIVE" ? "text-green-400" : "text-zinc-600"
                        }`}
                      >
                        {agent.status}
                      </span>
                    </div>
                  </div>
                  <a
                    href={`/portal/${portalId}/agents/${agent.id}?token=${token}`}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
                {agent.description && (
                  <p className="mb-3 text-xs text-zinc-500 line-clamp-2">{agent.description}</p>
                )}
                <div className="flex gap-4 text-[11px] text-zinc-500">
                  <span>{last7Conversations} Gespräche (7d)</span>
                  <span>{last7Leads} Leads (7d)</span>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <footer className="border-t border-zinc-800 px-6 py-4 text-center text-[11px] text-zinc-600">
        Powered by {companyName}
      </footer>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span style={{ color }}>{icon}</span>
        <span className="text-[11px] text-zinc-500">{label}</span>
      </div>
      <p className="text-xl font-bold" style={{ color }}>
        {value}
      </p>
    </div>
  );
}
