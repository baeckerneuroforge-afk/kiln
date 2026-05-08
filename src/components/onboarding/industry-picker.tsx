"use client";

import { Building2, Car, Dumbbell, Sparkles, Stethoscope, Utensils, Wrench } from "lucide-react";
import type { OnboardingIndustry } from "@/lib/onboarding/types";
import { cn } from "@/lib/utils";

const options: { value: OnboardingIndustry; label: string; description: string; icon: React.ReactNode }[] = [
  { value: "dental", label: "Dental", description: "Praxis, Recall, after-hours voice", icon: <Stethoscope className="h-4 w-4" /> },
  { value: "kfz", label: "KFZ", description: "Werkstatt, Kostenvoranschlag, Reifen", icon: <Car className="h-4 w-4" /> },
  { value: "shk", label: "SHK", description: "Notfall, Termine, Voice", icon: <Wrench className="h-4 w-4" /> },
  { value: "restaurant", label: "Restaurant", description: "Reservierung, Catering", icon: <Utensils className="h-4 w-4" /> },
  { value: "property", label: "Property", description: "Mieter, Schäden, Fotos", icon: <Building2 className="h-4 w-4" /> },
  { value: "fitness", label: "Fitness", description: "Probetraining, Mitgliedschaft", icon: <Dumbbell className="h-4 w-4" /> },
  { value: "custom", label: "Custom", description: "Start empty", icon: <Sparkles className="h-4 w-4" /> },
];

export function IndustryPicker({ value, onChange }: { value: OnboardingIndustry; onChange: (value: OnboardingIndustry) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-lg border p-4 text-left transition-colors hover:border-kiln-orange/50",
            value === option.value ? "border-kiln-orange bg-kiln-orange/10" : "border-border bg-card"
          )}
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-kiln-orange">{option.icon}</span>
            {option.label}
          </span>
          <span className="mt-2 block text-sm text-muted-foreground">{option.description}</span>
        </button>
      ))}
    </div>
  );
}
