"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CostByCustomer } from "@/lib/operations/types";
import { formatCompactNumber, formatEuro } from "@/components/operations/stats-row";

export function CostByCustomerChart({ data }: { data: CostByCustomer[] }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Cost by Customer</h2>
        <p className="text-sm text-muted-foreground">Top 10 customers by token cost in the selected period.</p>
      </div>
      {data.length === 0 ? (
        <div className="rounded-md border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No token spend in this period.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 8, right: 20, top: 8, bottom: 8 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="customerName" type="category" width={150} tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                  formatter={(value) => [formatEuro(Number(value)), "Cost"]}
                />
                <Bar dataKey="costEur" radius={[0, 4, 4, 0]}>
                  {data.map((item) => (
                    <Cell key={item.subOrgId} fill={item.trend === "up" ? "#f97316" : "#22c55e"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {data.map((item) => (
              <div key={item.subOrgId} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{item.customerName}</p>
                  <p className="text-xs text-muted-foreground">{formatCompactNumber(item.tokens)} tokens · {formatEuro(item.costEur)}</p>
                </div>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {item.trend === "up" ? <TrendingUp className="h-3.5 w-3.5 text-amber-400" /> : <TrendingDown className="h-3.5 w-3.5 text-emerald-400" />}
                  {item.trendPercent}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
