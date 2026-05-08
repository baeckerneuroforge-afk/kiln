"use client";

import { CalendarDays } from "lucide-react";
import type { TimeRangeKey } from "@/lib/operations/types";
import { cn } from "@/lib/utils";

export function TimeRangeSelector({
  value,
  onChange,
}: {
  value: TimeRangeKey;
  onChange: (value: TimeRangeKey) => void;
}) {
  const options: { value: TimeRangeKey; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "week", label: "This Week" },
    { value: "month", label: "This Month" },
    { value: "custom", label: "Custom" },
  ];

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
      <CalendarDays className="ml-2 h-4 w-4 text-muted-foreground" />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === option.value
              ? "bg-kiln-orange text-white shadow-sm shadow-kiln-orange/20"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
