"use client";

import { cn } from "@/lib/utils";
import type { ModuleMode } from "./validation";

/**
 * Three-option radio for choosing the billing mode for a module.
 *  - pool          → KILN bills the agency, customer's keys not needed
 *  - byok_agency   → Agency's own provider keys, no platform charge
 *  - byok_customer → End-customer's provider keys, no platform charge
 *
 * Renders accessible radio inputs with click-friendly label cards.
 */

interface ModeOption {
  value: ModuleMode;
  label: string;
  description: string;
  costHint: string;
}

interface ModeRadioProps {
  value: ModuleMode;
  onChange: (next: ModuleMode) => void;
  poolPriceEur: number;
  disabled?: boolean;
  /** Stable id prefix so multiple cards on the same page don't share input names. */
  groupId: string;
}

export function ModeRadio({ value, onChange, poolPriceEur, disabled, groupId }: ModeRadioProps) {
  const options: ModeOption[] = [
    {
      value: "pool",
      label: "Pool (KILN-managed)",
      description: "KILN stellt die Provider-Keys, monatliche Pauschale auf der Agency-Rechnung.",
      costHint: `${poolPriceEur.toLocaleString("de-DE")} EUR/Monat`,
    },
    {
      value: "byok_agency",
      label: "BYOK Agency",
      description: "Agency nutzt eigene Provider-Keys, keine Modul-Pauschale.",
      costHint: "0 EUR — Sie zahlen Provider direkt",
    },
    {
      value: "byok_customer",
      label: "BYOK Customer",
      description: "End-Customer stellt eigene Keys (z.B. Praxis-Inhaber mit Anthropic-Account).",
      costHint: "0 EUR — Customer zahlt Provider direkt",
    },
  ];

  return (
    <fieldset
      className={cn("flex flex-col gap-2", disabled && "opacity-50 pointer-events-none")}
      aria-disabled={disabled}
    >
      <legend className="sr-only">Billing-Modus</legend>
      {options.map((option) => {
        const inputId = `${groupId}-mode-${option.value}`;
        const checked = value === option.value;
        return (
          <label
            key={option.value}
            htmlFor={inputId}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
              checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
            )}
          >
            <input
              type="radio"
              id={inputId}
              name={`${groupId}-mode`}
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
              disabled={disabled}
              className="mt-1 h-4 w-4 text-primary focus:ring-primary"
            />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.costHint}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
            </div>
          </label>
        );
      })}
    </fieldset>
  );
}
