"use client";

import { useEffect, useState, useCallback } from "react";
import { TrendingUp, Save, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

/* ── Types ── */

interface ROIConfigProps {
  agentId: string;
}

type Frequency = "daily" | "weekly" | "monthly";

interface ROIData {
  manualTimeMinutes: number | null;
  hourlyRateCents: number | null;
  frequency: Frequency;
  taskDescription: string | null;
  monthlySavingsCents?: number;
  roiMultiple?: number;
}

const PRESETS = [
  { label: "Manuelle Web-Recherche", minutes: 120 },
  { label: "Dateneingabe", minutes: 60 },
  { label: "Report-Erstellung", minutes: 180 },
  { label: "Preisvergleich", minutes: 45 },
  { label: "Lead-Recherche", minutes: 120 },
  { label: "Kundensupport", minutes: 90 },
  { label: "Benutzerdefiniert", minutes: null },
] as const;

function formatEuro(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

export function ROIConfig({ agentId }: ROIConfigProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state
  const [preset, setPreset] = useState<string>("");
  const [manualTimeMinutes, setManualTimeMinutes] = useState<string>("");
  const [hourlyRate, setHourlyRate] = useState<string>("");
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [taskDescription, setTaskDescription] = useState<string>("");

  // ROI preview
  const [roiData, setRoiData] = useState<ROIData | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/roi`);
      if (res.ok) {
        const data: ROIData = await res.json();
        setRoiData(data);

        if (data.manualTimeMinutes !== null) {
          setManualTimeMinutes(String(data.manualTimeMinutes));

          // Versuche Preset zu matchen
          const matched = PRESETS.find((p) => p.minutes === data.manualTimeMinutes);
          setPreset(matched ? matched.label : "Benutzerdefiniert");
        }
        if (data.hourlyRateCents !== null) {
          setHourlyRate(String(data.hourlyRateCents / 100));
        }
        if (data.frequency) {
          setFrequency(data.frequency);
        }
        if (data.taskDescription) {
          setTaskDescription(data.taskDescription);
        }
      }
    } catch {
      // Default beibehalten
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handlePresetChange = (value: string) => {
    setPreset(value);
    const found = PRESETS.find((p) => p.label === value);
    if (found && found.minutes !== null) {
      setManualTimeMinutes(String(found.minutes));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/roi`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manualTimeMinutes: manualTimeMinutes.trim()
            ? parseInt(manualTimeMinutes)
            : null,
          hourlyRateCents: hourlyRate.trim()
            ? Math.round(parseFloat(hourlyRate) * 100)
            : null,
          frequency,
          taskDescription: taskDescription.trim() || null,
        }),
      });

      if (res.ok) {
        const data: ROIData = await res.json();
        setRoiData(data);
      }

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
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-orange-400" />
          ROI-Tracking
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Konfiguriere, welche manuelle Arbeit dieser Agent ersetzt.
        </p>
      </div>

      {/* Preset Dropdown */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          Was ersetzt dieser Agent?
        </label>
        <select
          value={preset}
          onChange={(e) => handlePresetChange(e.target.value)}
          className="w-full bg-card border border-border rounded-lg text-sm text-foreground px-3 py-2.5 outline-none focus:border-orange-500/60 transition-colors appearance-none cursor-pointer"
        >
          <option value="" className="bg-card text-muted-foreground">
            Preset auswählen...
          </option>
          {PRESETS.map((p) => (
            <option key={p.label} value={p.label} className="bg-card">
              {p.label}
              {p.minutes !== null ? ` (${p.minutes} Min.)` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Manual Time Input */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          Manuelle Dauer (Minuten)
        </label>
        <input
          type="number"
          min="1"
          step="1"
          value={manualTimeMinutes}
          onChange={(e) => setManualTimeMinutes(e.target.value)}
          placeholder="z.B. 120"
          className="w-full bg-card border border-border rounded-lg text-sm text-foreground px-3 py-2.5 outline-none focus:border-orange-500/60 transition-colors placeholder:text-muted-foreground"
        />
        <p className="text-[10px] text-muted-foreground">
          Wie lange dauert diese Aufgabe manuell pro Ausführung?
        </p>
      </div>

      {/* Hourly Rate Input */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          Stundensatz (€)
        </label>
        <input
          type="number"
          min="0"
          step="0.50"
          value={hourlyRate}
          onChange={(e) => setHourlyRate(e.target.value)}
          placeholder="z.B. 50.00"
          className="w-full bg-card border border-border rounded-lg text-sm text-foreground px-3 py-2.5 outline-none focus:border-orange-500/60 transition-colors placeholder:text-muted-foreground"
        />
        <p className="text-[10px] text-muted-foreground">
          Interner oder externer Stundensatz der manuellen Arbeit.
        </p>
      </div>

      {/* Frequency Select */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          Häufigkeit
        </label>
        <select
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as Frequency)}
          className="w-full bg-card border border-border rounded-lg text-sm text-foreground px-3 py-2.5 outline-none focus:border-orange-500/60 transition-colors appearance-none cursor-pointer"
        >
          <option value="daily" className="bg-card">Täglich</option>
          <option value="weekly" className="bg-card">Wöchentlich</option>
          <option value="monthly" className="bg-card">Monatlich</option>
        </select>
      </div>

      {/* Task Description */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          Beschreibung (optional)
        </label>
        <textarea
          value={taskDescription}
          onChange={(e) => setTaskDescription(e.target.value)}
          placeholder="z.B. Wöchentliche Marktanalyse für 3 Produktkategorien..."
          rows={3}
          className="w-full bg-card border border-border rounded-lg text-sm text-foreground px-3 py-2.5 outline-none focus:border-orange-500/60 transition-colors placeholder:text-muted-foreground resize-none"
        />
      </div>

      {/* ROI Preview */}
      {roiData &&
        roiData.monthlySavingsCents !== undefined &&
        roiData.roiMultiple !== undefined && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Geschätzte Ersparnis
            </p>
            <div className="flex items-baseline gap-3">
              <p className="text-xl font-semibold text-emerald-400">
                {formatEuro(roiData.monthlySavingsCents)}/Monat
              </p>
              <span className="text-sm font-medium text-orange-400">
                ROI: {roiData.roiMultiple.toFixed(1)}x
              </span>
            </div>
          </div>
        )}

      {/* Save Button */}
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
