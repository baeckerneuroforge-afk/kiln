"use client";

import { Info, Layers, Target, Sparkles, GitFork, Merge } from "lucide-react";

interface ConfigProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

function FieldLabel({
  label,
  hint,
  required,
}: {
  label: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {hint && (
        <p className="flex items-start gap-1 text-[10px] text-muted-foreground">
          <Info className="h-3 w-3 mt-0.5 shrink-0" />
          {hint}
        </p>
      )}
    </div>
  );
}

function ConfigInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-card border border-border rounded-lg text-sm text-foreground px-3 py-2.5 outline-none focus:border-orange-500/60 transition-colors placeholder:text-muted-foreground"
    />
  );
}

function ConfigSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-card border border-border rounded-lg text-sm text-foreground px-3 py-2.5 outline-none focus:border-orange-500/60 transition-colors"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

function ConfigSlider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="flex-1 accent-orange-500"
      />
      <span className="text-xs font-mono text-foreground min-w-[3ch] text-right">
        {value}{label}
      </span>
    </div>
  );
}

/* ========== Goal Trigger ========== */

export function GoalTriggerConfig({ config, onChange }: ConfigProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2">
        <Target className="h-4 w-4 text-orange-400" />
        <p className="text-xs text-foreground">Plant und führt Schritte aus einem natürlichsprachlichen Ziel aus</p>
      </div>

      <div className="space-y-1.5">
        <FieldLabel label="Ziel" hint="Natürlichsprachliche Beschreibung. Unterstützt {{ expressions }}." />
        <textarea
          value={String(config.goal || "")}
          onChange={(e) => onChange({ ...config, goal: e.target.value })}
          placeholder="z.B. Recherchiere aktuelle Markttrends für E-Commerce und erstelle einen zusammenfassenden Report"
          rows={3}
          className="w-full bg-card border border-border rounded-lg text-sm text-foreground px-3 py-2.5 outline-none focus:border-orange-500/60 transition-colors placeholder:text-muted-foreground resize-none"
        />
      </div>

      <div className="space-y-1.5">
        <FieldLabel label="Max. Schritte" hint="Maximale Anzahl geplanter Schritte (1-10)" />
        <ConfigSlider
          value={Number(config.maxSteps) || 10}
          onChange={(v) => onChange({ ...config, maxSteps: v })}
          min={1}
          max={10}
        />
      </div>
    </div>
  );
}

/* ========== Spawn Helper ========== */

export function SpawnHelperConfig({ config, onChange }: ConfigProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3 py-2">
        <Sparkles className="h-4 w-4 text-purple-400" />
        <p className="text-xs text-foreground">Erstellt einen temporären Helper-Agent für eine Sub-Aufgabe</p>
      </div>

      <div className="space-y-1.5">
        <FieldLabel label="Aufgabe" hint="Was soll der Helper tun? Unterstützt {{ expressions }}." />
        <textarea
          value={String(config.task || "")}
          onChange={(e) => onChange({ ...config, task: e.target.value })}
          placeholder="z.B. Analysiere die Kundenbewertungen und extrahiere die Top-3 Probleme"
          rows={3}
          className="w-full bg-card border border-border rounded-lg text-sm text-foreground px-3 py-2.5 outline-none focus:border-orange-500/60 transition-colors placeholder:text-muted-foreground resize-none"
        />
      </div>

      <div className="space-y-1.5">
        <FieldLabel label="Helper-Typ" />
        <ConfigSelect
          value={String(config.helperType || "general")}
          onChange={(v) => onChange({ ...config, helperType: v })}
          options={[
            { value: "general", label: "General" },
            { value: "researcher", label: "Researcher" },
            { value: "analyst", label: "Analyst" },
            { value: "writer", label: "Writer" },
            { value: "coder", label: "Coder" },
          ]}
        />
      </div>

      <div className="space-y-1.5">
        <FieldLabel label="Modell" />
        <ConfigSelect
          value={String(config.model || "auto")}
          onChange={(v) => onChange({ ...config, model: v })}
          options={[
            { value: "auto", label: "Auto (Smart Routing)" },
            { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (schnell)" },
            { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (balanced)" },
            { value: "claude-opus-4-6", label: "Claude Opus 4.6 (max. Qualität)" },
          ]}
        />
      </div>
    </div>
  );
}

/* ========== Agent Swarm ========== */

export function AgentSwarmConfig({ config, onChange }: ConfigProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3 py-2">
        <Layers className="h-4 w-4 text-purple-400" />
        <p className="text-xs text-foreground">Zerlegt ein Ziel in parallele Sub-Tasks mit mehreren Agents</p>
      </div>

      <div className="space-y-1.5">
        <FieldLabel label="Ziel" hint="Was soll der Swarm erreichen? Wird automatisch in Sub-Tasks zerlegt." />
        <textarea
          value={String(config.goal || "")}
          onChange={(e) => onChange({ ...config, goal: e.target.value })}
          placeholder="z.B. Analysiere die Wettbewerber in 5 verschiedenen Märkten parallel und konsolidiere die Ergebnisse"
          rows={3}
          className="w-full bg-card border border-border rounded-lg text-sm text-foreground px-3 py-2.5 outline-none focus:border-orange-500/60 transition-colors placeholder:text-muted-foreground resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <FieldLabel label="Max. Agents" />
          <ConfigSlider
            value={Number(config.maxAgents) || 5}
            onChange={(v) => onChange({ ...config, maxAgents: v })}
            min={2}
            max={20}
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel label="Max. Parallel" />
          <ConfigSlider
            value={Number(config.maxParallel) || 3}
            onChange={(v) => onChange({ ...config, maxParallel: v })}
            min={2}
            max={10}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <FieldLabel label="Merge-Strategie" hint="Wie sollen die Ergebnisse zusammengeführt werden?" />
        <ConfigSelect
          value={String(config.mergeStrategy || "wait_all")}
          onChange={(v) => onChange({ ...config, mergeStrategy: v })}
          options={[
            { value: "wait_all", label: "Alle abwarten" },
            { value: "first_success", label: "Erstes Ergebnis" },
            { value: "majority_vote", label: "Mehrheitsentscheid" },
            { value: "custom_merge", label: "Custom Merge Prompt" },
          ]}
        />
      </div>

      {config.mergeStrategy === "custom_merge" && (
        <div className="space-y-1.5">
          <FieldLabel label="Merge-Prompt" hint="Anweisung wie die Ergebnisse konsolidiert werden sollen" />
          <textarea
            value={String(config.customMergePrompt || "")}
            onChange={(e) => onChange({ ...config, customMergePrompt: e.target.value })}
            placeholder="z.B. Fasse die Ergebnisse aller Agents in einem strukturierten Report zusammen..."
            rows={2}
            className="w-full bg-card border border-border rounded-lg text-sm text-foreground px-3 py-2.5 outline-none focus:border-orange-500/60 transition-colors placeholder:text-muted-foreground resize-none"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <FieldLabel label="Timeout pro Agent (Sekunden)" />
        <ConfigSlider
          value={Number(config.timeoutPerAgent) || 60}
          onChange={(v) => onChange({ ...config, timeoutPerAgent: v })}
          min={10}
          max={300}
          label="s"
        />
      </div>

      <div className="space-y-1.5">
        <FieldLabel label="Result Key" hint="Kontext-Variable für das Ergebnis" />
        <ConfigInput
          value={String(config.resultKey || "swarmResult")}
          onChange={(v) => onChange({ ...config, resultKey: v })}
          placeholder="swarmResult"
        />
      </div>
    </div>
  );
}

/* ========== Parallel Split ========== */

export function ParallelSplitConfig({ config, onChange }: ConfigProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
        <GitFork className="h-4 w-4 text-blue-400" />
        <p className="text-xs text-foreground">Startet mehrere Branches gleichzeitig (Fan-out)</p>
      </div>

      <div className="space-y-1.5">
        <FieldLabel label="Anzahl Branches" hint="Wie viele parallele Branches sollen gestartet werden?" />
        <ConfigSlider
          value={Number(config.branches) || 2}
          onChange={(v) => onChange({ ...config, branches: v })}
          min={2}
          max={10}
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-[10px] text-muted-foreground">
          Verbinde die ausgehenden Edges mit verschiedenen Nodes. Alle Branches starten gleichzeitig.
          Nutze einen &quot;Parallel Merge&quot;-Node um die Ergebnisse zusammenzuführen.
        </p>
      </div>
    </div>
  );
}

/* ========== Parallel Merge ========== */

export function ParallelMergeConfig({ config, onChange }: ConfigProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
        <Merge className="h-4 w-4 text-blue-400" />
        <p className="text-xs text-foreground">Wartet auf parallele Branches und merged Ergebnisse (Fan-in)</p>
      </div>

      <div className="space-y-1.5">
        <FieldLabel label="Merge-Strategie" />
        <ConfigSelect
          value={String(config.mergeStrategy || "wait_all")}
          onChange={(v) => onChange({ ...config, mergeStrategy: v })}
          options={[
            { value: "wait_all", label: "Alle abwarten" },
            { value: "first_completed", label: "Erster abgeschlossener Branch" },
            { value: "n_of_m", label: "N von M Branches" },
          ]}
        />
      </div>

      {config.mergeStrategy === "n_of_m" && (
        <div className="space-y-1.5">
          <FieldLabel label="Benötigte Branches" hint="0 = automatisch (Hälfte aller Branches)" />
          <ConfigInput
            value={String(config.nRequired || "0")}
            onChange={(v) => onChange({ ...config, nRequired: Number(v) || 0 })}
            placeholder="0"
            type="number"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <FieldLabel label="Result Key" />
        <ConfigInput
          value={String(config.resultKey || "parallelResult")}
          onChange={(v) => onChange({ ...config, resultKey: v })}
          placeholder="parallelResult"
        />
      </div>
    </div>
  );
}
