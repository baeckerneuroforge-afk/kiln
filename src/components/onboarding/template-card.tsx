"use client";

import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TemplateCardData {
  id: string;
  name: string;
  description: string;
  workerCount: number;
  selected: boolean;
  premium?: boolean;
  seasonal?: boolean;
}

export function TemplateCard({
  template,
  onToggle,
}: {
  template: TemplateCardData;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(template.id)}
      className={cn(
        "rounded-lg border p-4 text-left transition-colors hover:border-kiln-orange/50",
        template.selected ? "border-kiln-orange bg-kiln-orange/10" : "border-border bg-card"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">{template.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
        </div>
        <CheckCircle2 className={cn("h-5 w-5", template.selected ? "text-kiln-orange" : "text-muted-foreground/40")} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-full bg-muted px-2 py-1">{template.workerCount} workers</span>
        {template.premium && <span className="rounded-full bg-purple-500/15 px-2 py-1 text-purple-300">Premium</span>}
        {template.seasonal && <span className="rounded-full bg-amber-500/15 px-2 py-1 text-amber-300">Seasonal</span>}
      </div>
    </button>
  );
}
