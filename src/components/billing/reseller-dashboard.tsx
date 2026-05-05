"use client";

import { useState, useEffect } from "react";
import {
  DollarSign, TrendingUp, Users, CreditCard, Loader2, Trash2, Edit2,
} from "lucide-react";

interface Client {
  id: string;
  portalId: string;
  clientName: string;
  portalName: string;
  monthlyPrice: number;
  platformFee: number;
  status: string;
  currentPeriodEnd: string;
  canceledAt: string | null;
}

interface Dashboard {
  accountStatus: string;
  platformFeePercent: number;
  totalRevenue: number;
  totalFeesPaid: number;
  mrr: number;
  mrrFees: number;
  netMrr: number;
  activeClients: number;
  totalClients: number;
  clients: Client[];
}

export function ResellerDashboard() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newPrice, setNewPrice] = useState("");

  useEffect(() => {
    fetch("/api/reseller")
      .then((r) => r.json())
      .then((data) => setDashboard(data.dashboard))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const cancelClient = async (clientId: string) => {
    await fetch(`/api/reseller/clients/${clientId}`, { method: "DELETE" });
    setDashboard((prev) =>
      prev
        ? {
            ...prev,
            clients: prev.clients.map((c) =>
              c.id === clientId ? { ...c, status: "canceled" } : c,
            ),
          }
        : null,
    );
  };

  const updatePrice = async (clientId: string) => {
    const cents = parseInt(newPrice) * 100;
    if (!cents) return;
    await fetch(`/api/reseller/clients/${clientId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthlyPrice: cents }),
    });
    setEditingId(null);
    // Reload
    const res = await fetch("/api/reseller");
    const data = await res.json();
    setDashboard(data.dashboard);
  };

  const formatEur = (cents: number) =>
    `€${(cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 })}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="rounded-xl border border-border bg-card/50 p-8 text-center">
        <CreditCard className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Kein Reseller-Account</h3>
        <p className="mt-1 text-xs text-muted-foreground">Richte zuerst Stripe Connect ein.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Revenue Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Monatlicher Umsatz (MRR)"
          value={formatEur(dashboard.mrr)}
          color="#22C55E"
        />
        <StatCard
          icon={<CreditCard className="h-4 w-4" />}
          label="KILN Platform Fee"
          value={formatEur(dashboard.mrrFees)}
          color="#EF4444"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Netto-Umsatz"
          value={formatEur(dashboard.netMrr)}
          color="#F97316"
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Aktive Kunden"
          value={String(dashboard.activeClients)}
          color="#3B82F6"
        />
      </div>

      {/* Client Table */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Kunden-Subscriptions</h3>
        {dashboard.clients.length === 0 ? (
          <div className="rounded-xl border border-border bg-card/50 p-6 text-center">
            <p className="text-xs text-muted-foreground">Noch keine Kunden mit Subscription.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Kunde</th>
                  <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Preis</th>
                  <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                  <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Nächste Zahlung</th>
                  <th className="pb-2 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.clients.map((client) => (
                  <tr key={client.id} className="border-b border-border/50">
                    <td className="py-2.5">
                      <span className="text-sm text-foreground">{client.clientName}</span>
                      <p className="text-[10px] text-muted-foreground">{client.portalName}</p>
                    </td>
                    <td className="py-2.5">
                      {editingId === client.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={newPrice}
                            onChange={(e) => setNewPrice(e.target.value)}
                            className="w-20 rounded border border-border bg-background px-2 py-1 text-xs text-foreground outline-none"
                            placeholder="€"
                          />
                          <button
                            onClick={() => updatePrice(client.id)}
                            className="rounded bg-orange-600 px-2 py-1 text-[10px] text-white"
                          >
                            OK
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm text-foreground">{formatEur(client.monthlyPrice)}/mo</span>
                      )}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          client.status === "active"
                            ? "bg-green-500/10 text-green-400"
                            : client.status === "past_due"
                              ? "bg-yellow-500/10 text-yellow-400"
                              : "bg-red-500/10 text-red-400"
                        }`}
                      >
                        {client.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground">
                      {new Date(client.currentPeriodEnd).toLocaleDateString("de-DE")}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditingId(client.id);
                            setNewPrice(String(Math.round(client.monthlyPrice / 100)));
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Preis ändern"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                        {client.status !== "canceled" && (
                          <button
                            onClick={() => cancelClient(client.id)}
                            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                            title="Kündigen"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span style={{ color }}>{icon}</span>
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold" style={{ color }}>
        {value}
      </p>
    </div>
  );
}
