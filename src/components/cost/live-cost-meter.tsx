"use client";

import { useState } from "react";
import { Coins, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ── */

export interface CostMeterEntry {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costDollars: number;
  creditsUsed: number;
}

interface LiveCostMeterProps {
  totalCreditsUsed: number;
  totalCostDollars: number;
  breakdown: CostMeterEntry[];
  budgetCapCredits?: number | null;
  className?: string;
}

function formatCredits(credits: number): string {
  return `${credits} Credits`;
}

function formatCost(dollars: number): string {
  if (dollars < 0.01) return `€${(dollars * 100).toFixed(2)}c`;
  return `€${dollars.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return String(tokens);
}

function shortModelName(id: string): string {
  const map: Record<string, string> = {
    "claude-opus-4-20250514": "Opus 4",
    "claude-sonnet-4-20250514": "Sonnet 4",
    "claude-haiku-4-5-20251001": "Haiku 4.5",
    "gpt-4o": "GPT-4o",
    "gpt-4o-mini": "GPT-4o mini",
    "sonar-pro": "Sonar Pro",
    "gemini-2.5-pro": "Gemini 2.5",
  };
  return map[id] || id;
}

export function LiveCostMeter({ totalCreditsUsed, totalCostDollars, breakdown, budgetCapCredits, className }: LiveCostMeterProps) {
  const [expanded, setExpanded] = useState(false);

  const percentUsed = budgetCapCredits && budgetCapCredits > 0
    ? (totalCreditsUsed / budgetCapCredits) * 100
    : null;

  const colorClass =
    percentUsed === null
      ? "text-zinc-400"
      : percentUsed > 80
        ? "text-red-400"
        : percentUsed > 50
          ? "text-amber-400"
          : "text-emerald-400";

  const borderClass =
    percentUsed === null
      ? "border-[#2a2a3a]"
      : percentUsed > 80
        ? "border-red-500/30"
        : percentUsed > 50
          ? "border-amber-500/30"
          : "border-emerald-500/30";

  return (
    <div className={cn("rounded-xl border bg-[#141418]", borderClass, className)}>
      {/* Compact View */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-2 w-full text-left"
      >
        <Coins className={cn("h-3.5 w-3.5 shrink-0", colorClass)} />
        {/* Credits als primäre Anzeige */}
        <span className={cn("text-xs font-medium tabular-nums", colorClass)}>
          {formatCredits(totalCreditsUsed)}
        </span>
        {budgetCapCredits && (
          <span className="text-[10px] text-zinc-600">
            / {budgetCapCredits}
          </span>
        )}
        {/* € als sekundäre Anzeige */}
        <span className="text-[10px] text-zinc-600 ml-1">
          ({formatCost(totalCostDollars)})
        </span>
        {percentUsed !== null && (
          <div className="flex-1 mx-2 h-1.5 rounded-full bg-zinc-800 min-w-[40px]">
            <div
              className={cn(
                "h-1.5 rounded-full transition-all",
                percentUsed > 80 ? "bg-red-500" : percentUsed > 50 ? "bg-amber-500" : "bg-emerald-500"
              )}
              style={{ width: `${Math.min(100, percentUsed)}%` }}
            />
          </div>
        )}
        {expanded ? (
          <ChevronUp className="h-3 w-3 text-zinc-600 shrink-0" />
        ) : (
          <ChevronDown className="h-3 w-3 text-zinc-600 shrink-0" />
        )}
      </button>

      {/* Expanded Breakdown */}
      {expanded && breakdown.length > 0 && (
        <div className="border-t border-[#2a2a3a] px-3 py-2 space-y-1.5">
          {breakdown.map((item) => (
            <div key={item.model} className="flex items-center justify-between text-[10px]">
              <span className="text-zinc-400">{shortModelName(item.model)}</span>
              <div className="flex items-center gap-3 text-zinc-500">
                <span>{item.calls}x</span>
                <span>{formatTokens(item.inputTokens + item.outputTokens)}</span>
                <span className="text-orange-400 font-medium">{item.creditsUsed} Cr</span>
                <span className="text-zinc-600">{formatCost(item.costDollars)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
