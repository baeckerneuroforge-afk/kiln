"use client";

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";

interface Props {
  data: { date: string; credits: number }[];
}

export function CreditUsageChart({ data }: Props) {
  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={formatted} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="creditGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#F97316" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 9, fill: "#71717a" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 9, fill: "#71717a" }}
          tickLine={false}
          axisLine={false}
          width={30}
        />
        <Tooltip
          contentStyle={{
            background: "#1c1917",
            border: "1px solid #27272a",
            borderRadius: 8,
            fontSize: 11,
            padding: "6px 10px",
          }}
          labelStyle={{ color: "#a1a1aa" }}
          itemStyle={{ color: "#F97316" }}
          formatter={(value) => [`${value} credits`, "Usage"]}
        />
        <Area
          type="monotone"
          dataKey="credits"
          stroke="#F97316"
          strokeWidth={1.5}
          fill="url(#creditGrad)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
