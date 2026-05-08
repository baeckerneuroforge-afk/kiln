"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = ["Basics", "Template", "Knowledge", "Channels", "Branding", "Review"];

export function StepProgress({ currentStep }: { currentStep: number }) {
  return (
    <div className="grid gap-2 sm:grid-cols-6">
      {steps.map((step, index) => {
        const number = index + 1;
        const done = number < currentStep;
        const active = number === currentStep;
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                done && "border-emerald-500/40 bg-emerald-500/15 text-emerald-400",
                active && "border-kiln-orange bg-kiln-orange text-white",
                !done && !active && "border-border bg-card text-muted-foreground"
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : number}
            </div>
            <span className={cn("hidden text-xs font-medium sm:block", active ? "text-foreground" : "text-muted-foreground")}>{step}</span>
          </div>
        );
      })}
    </div>
  );
}
