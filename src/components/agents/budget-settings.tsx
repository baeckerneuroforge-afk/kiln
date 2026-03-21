"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Wallet,
  Loader2,
  Save,
  Check,
  TrendingDown,
  AlertTriangle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── Types ── */

type BudgetBehavior = "pause" | "downgrade" | "notify_continue";

interface BudgetData {
  config: {
    maxCreditsPerRun: number | null;
    maxCostPerRunCents: number | null;
    budgetExceededBehavior: string;
  };
  usage: {
    creditsUsed: number;
    monthlyCostCents: number;
    monthlyCallCount: number;
    byModel: Record<string, { calls: number; inputTokens: number; outputTokens: number; costCents: number; creditsUsed: number }>;
  };
  planCredits: {
    balance: number;
    total: number;
    percentUsed: number;
  };
}

interface BudgetSettingsProps {
  agentId: string;
}

function formatEuro(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

export function BudgetSettings({ agentId }: BudgetSettingsProps) {
  const [data, setData] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state — Credits
  const [maxCreditsPerRun, setMaxCreditsPerRun] = useState<string>("");
  const [behavior, setBehavior] = useState<BudgetBehavior>("notify_continue");

  const loadBudget = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/budget`);
      if (res.ok) {
        const d = await res.json();
        setData(d);
        setMaxCreditsPerRun(d.config.maxCreditsPerRun !== null ? String(d.config.maxCreditsPerRun) : "");
        setBehavior((d.config.budgetExceededBehavior || "notify_continue") as BudgetBehavior);
      }
    } catch {
      // Default beibehalten
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { loadBudget(); }, [loadBudget]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const maxCredits = maxCreditsPerRun.trim() ? parseInt(maxCreditsPerRun) : null;

      await fetch(`/api/agents/${agentId}/budget`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxCreditsPerRun: maxCredits,
          budgetExceededBehavior: behavior,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Error handling
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
      </div>
    );
  }

  const creditsUsed = data?.usage.creditsUsed || 0;
  const planBalance = data?.planCredits?.balance ?? 0;
  const planTotal = data?.planCredits?.total ?? 0;
  const planPercentUsed = data?.planCredits?.percentUsed ?? 0;

  const models = data?.usage.byModel ? Object.entries(data.usage.byModel) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-orange-400" />
          Budget Controls
        </h3>
        <p className="text-xs text-zinc-500 mt-1">
          Setze Credit-Limits pro Ausführung. Monatliches Limit = dein Plan.
        </p>
      </div>

      {/* Plan Credits Card */}
      {data && (
        <div className={cn(
          "rounded-xl border p-4",
          planPercentUsed > 80
            ? "border-red-500/30 bg-red-500/5"
            : planPercentUsed > 50
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-[#2a2a3a] bg-[#141418]"
        )}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Plan-Credits</p>
              <p className="mt-1 text-2xl font-semibold text-zinc-100">{planBalance} <span className="text-sm text-zinc-500">/ {planTotal}</span></p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {creditsUsed} Credits von diesem Agent genutzt
                {data.usage.monthlyCostCents > 0 && (
                  <span className="text-zinc-600"> · {formatEuro(data.usage.monthlyCostCents)} API-Kosten</span>
                )}
              </p>
            </div>
            {planTotal > 0 && (
              <div className="text-right">
                <p className={cn(
                  "text-lg font-semibold",
                  planPercentUsed > 80 ? "text-red-400" : planPercentUsed > 50 ? "text-amber-400" : "text-emerald-400"
                )}>
                  {Math.round(planPercentUsed)}%
                </p>
                <p className="text-[10px] text-zinc-600">verbraucht</p>
              </div>
            )}
          </div>

          {planTotal > 0 && (
            <div className="mt-3 h-2 rounded-full bg-zinc-800">
              <div
                className={cn(
                  "h-2 rounded-full transition-all",
                  planPercentUsed > 80 ? "bg-red-500" : planPercentUsed > 50 ? "bg-amber-500" : "bg-emerald-500"
                )}
                style={{ width: `${Math.min(100, planPercentUsed)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Budget Config */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
            Max Credits pro Ausführung
          </label>
          <input
            type="number"
            step="1"
            min="0"
            value={maxCreditsPerRun}
            onChange={(e) => setMaxCreditsPerRun(e.target.value)}
            placeholder="Unbegrenzt"
            className="w-full bg-[#141418] border border-[#2a2a3a] rounded-lg text-sm text-zinc-100 px-3 py-2.5 outline-none focus:border-orange-500/60 transition-colors placeholder:text-zinc-700"
          />
          <p className="text-[10px] text-zinc-600">
            Leer lassen = kein Limit pro Ausführung. 1 Credit ≈ 1 Haiku-Aufruf, 5 Credits ≈ 1 Opus-Aufruf.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">
            Bei Budget-Überschreitung
          </label>
          <div className="grid gap-2">
            {([
              { id: "pause" as const, label: "Pausieren", desc: "Execution wird gestoppt", icon: AlertTriangle, color: "red" },
              { id: "downgrade" as const, label: "Günstigeres Modell", desc: "Automatisch zum günstigsten Modell wechseln", icon: TrendingDown, color: "amber" },
              { id: "notify_continue" as const, label: "Warnen & Fortfahren", desc: "Budget-Warnung senden, aber weiter ausführen", icon: Info, color: "blue" },
            ]).map(({ id, label, desc, icon: Icon, color }) => (
              <button
                key={id}
                onClick={() => setBehavior(id)}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3 text-left transition-all",
                  behavior === id
                    ? `border-${color}-500/30 bg-${color}-500/5`
                    : "border-[#2a2a3a] bg-transparent hover:border-[#3a3a4a]"
                )}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0 mt-0.5 bg-[#1a1a24]">
                  <Icon className="h-3.5 w-3.5" style={{ color: behavior === id ? "#F97316" : "#71717a" }} />
                </div>
                <div>
                  <p className={cn("text-xs font-medium", behavior === id ? "text-zinc-100" : "text-zinc-400")}>{label}</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">{desc}</p>
                </div>
                <div className={cn(
                  "ml-auto h-4 w-4 rounded-full border-2 shrink-0 mt-1",
                  behavior === id ? "border-orange-500 bg-orange-500" : "border-zinc-700"
                )} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Model Breakdown */}
      {models.length > 0 && (
        <div className="rounded-xl border border-[#2a2a3a] p-4">
          <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide mb-3">
            Verbrauch nach Modell (30 Tage)
          </p>
          <div className="space-y-2">
            {models.sort(([, a], [, b]) => (b.creditsUsed || 0) - (a.creditsUsed || 0)).map(([model, stats]) => (
              <div key={model} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-orange-500 shrink-0" />
                  <span className="text-zinc-300 truncate max-w-[140px]">{model}</span>
                </div>
                <div className="flex items-center gap-4 text-zinc-500">
                  <span>{stats.calls} Aufrufe</span>
                  <span className="text-orange-400 font-medium">{stats.creditsUsed || 0} Cr</span>
                  <span className="text-zinc-600">{formatEuro(stats.costCents)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save */}
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="bg-orange-600 hover:bg-orange-500 text-white text-xs h-8"
        >
          {saving ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : saved ? (
            <Check className="mr-1.5 h-3.5 w-3.5" />
          ) : (
            <Save className="mr-1.5 h-3.5 w-3.5" />
          )}
          {saved ? "Gespeichert" : "Speichern"}
        </Button>
      </div>
    </div>
  );
}
