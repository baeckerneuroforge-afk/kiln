"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Calculator,
  Coins,
  Zap,
  TrendingDown,
  SlidersHorizontal,
} from "lucide-react";
import {
  estimateCost,
  singleAgentEquivalentCost,
  projectMonthlyCost,
} from "@/lib/model-pricing";
import { getModelDef } from "@/lib/ai";
import { cn } from "@/lib/utils";

// Durchschnittliche Token-Annahmen pro Aufruf
const AVG_INPUT_TOKENS = 1500;
const AVG_OUTPUT_TOKENS = 800;

interface MemberInput {
  agentId?: string;
  model?: string;
  role?: string;
}

interface CostCalculatorProps {
  teamId?: string;
  members?: MemberInput[];
}

interface MemberCostRow {
  role: string;
  model: string;
  modelLabel: string;
  costPerExecution: number;
}

interface CostEstimateVsActualProps {
  estimatedCostPerExecution: number;
  actualCostPerExecution: number | null;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

// Sub-Komponente: Geschätzte vs. tatsächliche Kosten
export function CostEstimateVsActual({
  estimatedCostPerExecution,
  actualCostPerExecution,
}: CostEstimateVsActualProps) {
  const diff =
    actualCostPerExecution !== null
      ? ((actualCostPerExecution - estimatedCostPerExecution) /
          estimatedCostPerExecution) *
        100
      : null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="h-4 w-4 text-orange-500" />
        <span className="text-sm font-medium text-zinc-100">
          Kostenvergleich
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-zinc-500 mb-1">Geschätzt</p>
          <p className="text-lg font-semibold text-zinc-100">
            {formatCost(estimatedCostPerExecution)}
            <span className="text-xs text-zinc-500 ml-1">/Ausführung</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 mb-1">Tatsächlich</p>
          {actualCostPerExecution !== null ? (
            <>
              <p className="text-lg font-semibold text-zinc-100">
                {formatCost(actualCostPerExecution)}
                <span className="text-xs text-zinc-500 ml-1">/Ausführung</span>
              </p>
              {diff !== null && (
                <p
                  className={cn(
                    "text-xs mt-1",
                    diff <= 0 ? "text-green-500" : "text-red-400"
                  )}
                >
                  {diff <= 0 ? "↓" : "↑"} {Math.abs(diff).toFixed(1)}% vs.
                  Schätzung
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-zinc-500 italic">
              Noch keine Ausführungen
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function TeamCostCalculator({ teamId, members }: CostCalculatorProps) {
  const [teamMembers, setTeamMembers] = useState<MemberInput[]>(
    members ?? []
  );
  const [loading, setLoading] = useState(false);
  const [runsPerMonth, setRunsPerMonth] = useState(500);

  // Team-Config laden, falls teamId vorhanden und keine members übergeben
  const loadTeam = useCallback(async () => {
    if (!teamId || members) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/teams/${teamId}`);
      if (!res.ok) throw new Error("Team konnte nicht geladen werden");
      const data = await res.json();
      if (data.members && Array.isArray(data.members)) {
        setTeamMembers(data.members);
      }
    } catch {
      // Fehler still behandeln — leere Ansicht zeigen
    } finally {
      setLoading(false);
    }
  }, [teamId, members]);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  // Wenn members-Prop sich ändert, direkt übernehmen
  useEffect(() => {
    if (members) {
      setTeamMembers(members);
    }
  }, [members]);

  // Kosten pro Agent berechnen
  const memberCosts: MemberCostRow[] = teamMembers.map((m) => {
    const modelId = m.model ?? "claude-sonnet-4-6";
    const modelDef = getModelDef(modelId);
    const cost = estimateCost(modelId, AVG_INPUT_TOKENS, AVG_OUTPUT_TOKENS);
    return {
      role: m.role ?? "Agent",
      model: modelId,
      modelLabel: modelDef?.shortLabel ?? modelId,
      costPerExecution: cost,
    };
  });

  const teamCostPerExecution = memberCosts.reduce(
    (sum, m) => sum + m.costPerExecution,
    0
  );

  // Referenz: Ein einzelner Opus-Agent für die gleiche Gesamtmenge an Tokens
  const totalInputTokens = teamMembers.length * AVG_INPUT_TOKENS;
  const totalOutputTokens = teamMembers.length * AVG_OUTPUT_TOKENS;
  const opusCost = singleAgentEquivalentCost(totalInputTokens, totalOutputTokens);

  const savingsPercent =
    opusCost > 0 ? ((opusCost - teamCostPerExecution) / opusCost) * 100 : 0;

  const monthlyTeamCost = projectMonthlyCost(teamCostPerExecution, runsPerMonth);
  const monthlyOpusCost = projectMonthlyCost(opusCost, runsPerMonth);

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 flex items-center justify-center gap-2">
        <Calculator className="h-4 w-4 text-zinc-500 animate-pulse" />
        <span className="text-sm text-zinc-500">Kosten werden berechnet...</span>
      </div>
    );
  }

  if (teamMembers.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
        <Coins className="h-5 w-5 text-zinc-600 mx-auto mb-2" />
        <p className="text-sm text-zinc-500">
          Füge Team-Mitglieder hinzu, um eine Kostenschätzung zu sehen.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Vergleich: Team vs. Single Agent */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calculator className="h-4 w-4 text-orange-500" />
          <h3 className="text-sm font-semibold text-zinc-100">
            Kostenschätzung pro Ausführung
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Single Agent Opus */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="h-3.5 w-3.5 text-zinc-500" />
              <span className="text-xs text-zinc-500">
                Einzelner Agent (Opus)
              </span>
            </div>
            <p className="text-xl font-bold text-zinc-300">
              ~{formatCost(opusCost)}
              <span className="text-xs font-normal text-zinc-600 ml-1">
                /Ausführung
              </span>
            </p>
          </div>

          {/* Team */}
          <div className="rounded-lg border border-orange-900/30 bg-orange-950/10 p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Coins className="h-3.5 w-3.5 text-orange-500" />
              <span className="text-xs text-orange-400/80">Dein Workflow</span>
            </div>
            <p className="text-xl font-bold text-zinc-100">
              ~{formatCost(teamCostPerExecution)}
              <span className="text-xs font-normal text-zinc-500 ml-1">
                /Ausführung
              </span>
            </p>
          </div>
        </div>

        {/* Ersparnis */}
        {savingsPercent > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-green-950/20 border border-green-900/20 px-3 py-2">
            <TrendingDown className="h-4 w-4 text-green-500" />
            <span className="text-sm text-green-400">
              ~{savingsPercent.toFixed(0)}% günstiger als ein einzelner
              Opus-Agent
            </span>
          </div>
        )}
      </div>

      {/* Monatliche Projektion */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="flex items-center gap-2 mb-4">
          <SlidersHorizontal className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-zinc-100">
            Monatliche Projektion
          </h3>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500">Ausführungen / Monat</span>
            <span className="text-sm font-mono font-semibold text-zinc-100">
              {runsPerMonth.toLocaleString("de-DE")}
            </span>
          </div>
          <input
            type="range"
            min={50}
            max={5000}
            step={50}
            value={runsPerMonth}
            onChange={(e) => setRunsPerMonth(Number(e.target.value))}
            className={cn(
              "w-full h-1.5 rounded-full appearance-none cursor-pointer",
              "bg-zinc-800",
              "[&::-webkit-slider-thumb]:appearance-none",
              "[&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4",
              "[&::-webkit-slider-thumb]:rounded-full",
              "[&::-webkit-slider-thumb]:bg-orange-500",
              "[&::-webkit-slider-thumb]:shadow-md",
              "[&::-webkit-slider-thumb]:cursor-pointer",
              "[&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4",
              "[&::-moz-range-thumb]:rounded-full",
              "[&::-moz-range-thumb]:bg-orange-500",
              "[&::-moz-range-thumb]:border-0",
              "[&::-moz-range-thumb]:cursor-pointer"
            )}
          />
          <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
            <span>50</span>
            <span>5.000</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-zinc-950/50 border border-zinc-800 p-3">
            <p className="text-xs text-zinc-500 mb-1">Workflow / Monat</p>
            <p className="text-lg font-bold text-zinc-100">
              {formatCost(monthlyTeamCost)}
            </p>
          </div>
          <div className="rounded-lg bg-zinc-950/50 border border-zinc-800 p-3">
            <p className="text-xs text-zinc-500 mb-1">Opus-Referenz / Monat</p>
            <p className="text-lg font-bold text-zinc-400">
              {formatCost(monthlyOpusCost)}
            </p>
          </div>
        </div>
      </div>

      {/* Pro-Agent Breakdown Tabelle */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-4 w-4 text-orange-500" />
          <h3 className="text-sm font-semibold text-zinc-100">
            Kosten pro Agent
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left text-xs font-medium text-zinc-500 pb-2">
                  Rolle
                </th>
                <th className="text-left text-xs font-medium text-zinc-500 pb-2">
                  Modell
                </th>
                <th className="text-right text-xs font-medium text-zinc-500 pb-2">
                  Kosten / Aufruf
                </th>
              </tr>
            </thead>
            <tbody>
              {memberCosts.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-zinc-800/50 last:border-0"
                >
                  <td className="py-2 text-zinc-300">{row.role}</td>
                  <td className="py-2">
                    <span className="inline-flex items-center rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-300">
                      {row.modelLabel}
                    </span>
                  </td>
                  <td className="py-2 text-right font-mono text-zinc-100">
                    {formatCost(row.costPerExecution)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-700">
                <td
                  className="pt-2 text-xs font-semibold text-zinc-400"
                  colSpan={2}
                >
                  Gesamt pro Ausführung
                </td>
                <td className="pt-2 text-right font-mono font-semibold text-orange-400">
                  {formatCost(teamCostPerExecution)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="text-[11px] text-zinc-600 mt-3">
          Schätzung basiert auf ~{AVG_INPUT_TOKENS.toLocaleString("de-DE")}{" "}
          Input- und ~{AVG_OUTPUT_TOKENS.toLocaleString("de-DE")}{" "}
          Output-Tokens pro Agent.
        </p>
      </div>
    </div>
  );
}
