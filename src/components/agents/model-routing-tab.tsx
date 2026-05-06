"use client";

import { useEffect, useState, useCallback } from "react";
import { Cpu, Loader2, Save, Check, Zap, Wallet, Settings2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── Types ── */

type RoutingStrategy = "auto" | "cost_optimized" | "speed_optimized" | "manual";

type TaskTypeKey =
  | "code_generation"
  | "research"
  | "classification"
  | "creative_writing"
  | "data_extraction"
  | "conversation";

const TASK_TYPES: { key: TaskTypeKey; label: string; description: string }[] = [
  { key: "code_generation", label: "Reasoning / Code", description: "Komplexe Analysen, Code" },
  { key: "research", label: "Research", description: "Web-Recherche, Fakten" },
  { key: "classification", label: "Schnelle Antwort", description: "Klassifikation, Routing" },
  { key: "creative_writing", label: "Kreatives Schreiben", description: "Marketing, Content" },
  { key: "data_extraction", label: "Daten-Extraktion", description: "JSON, strukturierte Daten" },
  { key: "conversation", label: "Konversation", description: "Chat, Support" },
];

interface ModelOption {
  id: string;
  displayName: string;
  provider: string;
  tier: string;
  available: boolean;
}

const MODELS: ModelOption[] = [
  { id: "claude-opus-4-6", displayName: "Opus 4.6", provider: "anthropic", tier: "powerful", available: true },
  { id: "claude-sonnet-4-6", displayName: "Sonnet 4.6", provider: "anthropic", tier: "balanced", available: true },
  { id: "claude-haiku-4-5-20251001", displayName: "Haiku 4.5", provider: "anthropic", tier: "fast", available: true },
  { id: "gpt-4o", displayName: "GPT-4o", provider: "openai", tier: "balanced", available: false },
  { id: "gpt-4o-mini", displayName: "GPT-4o Mini", provider: "openai", tier: "fast", available: false },
  { id: "gemini-2.0-pro", displayName: "Gemini 2.0 Pro", provider: "google", tier: "balanced", available: false },
  { id: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash", provider: "google", tier: "fast", available: false },
  { id: "sonar-pro", displayName: "Sonar Pro", provider: "perplexity", tier: "balanced", available: false },
  { id: "llama-3.3-70b-versatile", displayName: "Llama 3.3 70B", provider: "groq", tier: "fast", available: false },
  { id: "mixtral-8x7b-32768", displayName: "Mixtral 8x7B", provider: "groq", tier: "fast", available: false },
];

interface ModelRoutingTabProps {
  agentId: string;
}

export function ModelRoutingTab({ agentId }: ModelRoutingTabProps) {
  const [strategy, setStrategy] = useState<RoutingStrategy>("auto");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [availableProviders, setAvailableProviders] = useState<Set<string>>(new Set(["anthropic"]));

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/model-routing`);
      if (res.ok) {
        const data = await res.json();
        setStrategy(data.strategy || "auto");
        setOverrides(data.overrides || {});
        setAvailableProviders(new Set(data.availableProviders || ["anthropic"]));
      }
    } catch {
      // Default beibehalten
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/agents/${agentId}/model-routing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy, overrides }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Error handling
    } finally {
      setSaving(false);
    }
  };

  const modelsWithAvailability = MODELS.map((m) => ({
    ...m,
    available: availableProviders.has(m.provider),
  }));

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
          <Cpu className="h-4 w-4 text-orange-400" />
          Model Routing
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Control which AI models handle different tasks.
        </p>
      </div>

      {/* Strategy Selection */}
      <div className="grid gap-2">
        {([
          { id: "auto" as const, label: "Auto (KILN decides)", icon: Settings2, desc: "Smart model selection based on task type and complexity", color: "orange" },
          { id: "cost_optimized" as const, label: "Cost-Optimized", icon: Wallet, desc: "Prefer cheaper models when quality is comparable", color: "green" },
          { id: "speed_optimized" as const, label: "Speed-Optimized", icon: Zap, desc: "Always use the fastest available model", color: "blue" },
          { id: "manual" as const, label: "Manual", icon: Settings2, desc: "Choose the model for each task type yourself", color: "purple" },
        ]).map(({ id, label, icon: Icon, desc, color }) => (
          <button
            key={id}
            onClick={() => setStrategy(id)}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all",
              strategy === id
                ? `border-${color}-500/30 bg-${color}-500/5`
                : "border-border bg-transparent hover:border-foreground/20"
            )}
            style={strategy === id ? { borderColor: `var(--${color}, #F97316)30`, backgroundColor: `var(--${color}, #F97316)08` } : undefined}
          >
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 mt-0.5"
              style={{ backgroundColor: strategy === id ? `var(--${color}, #F97316)15` : "#1a1a24" }}
            >
              <Icon className="h-4 w-4" style={{ color: strategy === id ? "#F97316" : "#71717a" }} />
            </div>
            <div>
              <p className={cn("text-xs font-medium", strategy === id ? "text-foreground" : "text-muted-foreground")}>{label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
            </div>
            <div className={cn(
              "ml-auto h-4 w-4 rounded-full border-2 shrink-0 mt-1",
              strategy === id ? "border-orange-500 bg-orange-500" : "border-border"
            )} />
          </button>
        ))}
      </div>

      {/* Manual Override Matrix */}
      {strategy === "manual" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground">
              Pick the preferred model for each task type.
              Green dot = API key configured.
            </p>
          </div>

          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Task type</th>
                    {modelsWithAvailability.map((m) => (
                      <th key={m.id} className="text-center px-2 py-2 text-muted-foreground font-medium whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <span className={cn("h-1.5 w-1.5 rounded-full", m.available ? "bg-green-500" : "bg-muted")} />
                          {m.displayName}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TASK_TYPES.map((tt) => (
                    <tr key={tt.key} className="border-b border-border last:border-0">
                      <td className="px-3 py-2.5">
                        <p className="text-foreground font-medium">{tt.label}</p>
                        <p className="text-[9px] text-muted-foreground">{tt.description}</p>
                      </td>
                      {modelsWithAvailability.map((m) => (
                        <td key={m.id} className="text-center px-2 py-2.5">
                          <button
                            onClick={() => setOverrides({ ...overrides, [tt.key]: m.id })}
                            disabled={!m.available}
                            className={cn(
                              "h-5 w-5 rounded-full border-2 mx-auto transition-all",
                              overrides[tt.key] === m.id
                                ? "border-orange-500 bg-orange-500"
                                : m.available
                                  ? "border-border hover:border-foreground/30"
                                  : "border-border opacity-30 cursor-not-allowed"
                            )}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
          {saved ? "Saved" : "Save"}
        </Button>
      </div>
    </div>
  );
}
