"use client";

import { useState } from "react";
import { Globe, Plus, Trash2, Info } from "lucide-react";

interface ConfigProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

const PRESETS = [
  { id: "custom", label: "Custom" },
  { id: "price_comparison", label: "Price Comparison" },
  { id: "content_monitoring", label: "Content Monitoring" },
  { id: "competitor_analysis", label: "Competitor Analysis" },
];

const MERGE_STRATEGIES = [
  { id: "compare_and_rank", label: "Compare & Rank" },
  { id: "aggregate", label: "Aggregate" },
  { id: "summarize", label: "Summarize (LLM)" },
];

const OUTPUT_FORMATS = [
  { id: "json", label: "JSON" },
  { id: "table", label: "Table" },
  { id: "csv", label: "CSV Export" },
  { id: "pdf", label: "PDF Report" },
];

export function MultiSiteConfig({ config, onChange }: ConfigProps) {
  const urls = (config.urls as string[]) || [];
  const preset = String(config.preset || "custom");
  const taskPerSite = String(config.taskPerSite || "");
  const mergeStrategy = String(config.mergeStrategy || "aggregate");
  const outputFormat = String(config.outputFormat || "json");
  const maxParallel = Number(config.maxParallel) || 3;
  const [newUrl, setNewUrl] = useState("");

  const addUrl = () => {
    if (!newUrl.trim()) return;
    onChange({ ...config, urls: [...urls, newUrl.trim()] });
    setNewUrl("");
  };

  const removeUrl = (index: number) => {
    onChange({ ...config, urls: urls.filter((_, i) => i !== index) });
  };

  const applyPreset = (presetId: string) => {
    const updates: Record<string, unknown> = { ...config, preset: presetId };
    switch (presetId) {
      case "price_comparison":
        updates.mergeStrategy = "compare_and_rank";
        updates.outputFormat = "table";
        updates.taskPerSite = "Find the price for [product]. Extract: name, price, currency, availability.";
        break;
      case "content_monitoring":
        updates.mergeStrategy = "aggregate";
        updates.outputFormat = "json";
        updates.taskPerSite = "Extract main content, headlines, key announcements.";
        break;
      case "competitor_analysis":
        updates.mergeStrategy = "summarize";
        updates.outputFormat = "table";
        updates.taskPerSite = "Analyze competitor: products, pricing, value props, contact info.";
        break;
    }
    onChange(updates);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 text-teal-400">
        <Globe className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wider">Multi-Site</span>
      </div>

      {/* Preset */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Preset</label>
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-medium transition-all ${
                preset === p.id
                  ? "border-teal-500/50 bg-teal-500/10 text-teal-300"
                  : "border-border bg-card/50 text-muted-foreground hover:border-border"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* URL List */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">URLs ({urls.length}/20)</label>
        {urls.map((url, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={url}
              onChange={(e) => {
                const updated = [...urls];
                updated[i] = e.target.value;
                onChange({ ...config, urls: updated });
              }}
              className="flex-1 rounded-lg border border-border bg-card/50 px-3 py-1.5 text-xs text-foreground focus:border-teal-500/50 focus:outline-none"
            />
            <button onClick={() => removeUrl(i)} className="p-1 text-muted-foreground hover:text-red-400">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addUrl()}
            placeholder="https://competitor.com"
            className="flex-1 rounded-lg border border-border bg-card/50 px-3 py-1.5 text-xs text-muted-foreground placeholder:text-muted-foreground focus:border-teal-500/50 focus:outline-none"
          />
          <button onClick={addUrl} className="p-1 text-muted-foreground hover:text-teal-400">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Task per site */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Task per Site</label>
        <textarea
          value={taskPerSite}
          onChange={(e) => onChange({ ...config, taskPerSite: e.target.value })}
          placeholder="What should the agent do on each site?"
          rows={3}
          className="w-full rounded-lg border border-border bg-card/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-teal-500/50 focus:outline-none resize-none"
        />
      </div>

      {/* Product name (for price comparison) */}
      {preset === "price_comparison" && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Product Name</label>
          <input
            value={String(config.productName || "")}
            onChange={(e) => onChange({ ...config, productName: e.target.value })}
            placeholder="e.g. Viessmann Vitocal 250-A"
            className="w-full rounded-lg border border-border bg-card/50 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-teal-500/50 focus:outline-none"
          />
        </div>
      )}

      {/* Merge Strategy */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Merge Strategy</label>
        <select
          value={mergeStrategy}
          onChange={(e) => onChange({ ...config, mergeStrategy: e.target.value })}
          className="w-full rounded-lg border border-border bg-card/50 px-3 py-1.5 text-xs text-foreground focus:border-teal-500/50 focus:outline-none"
        >
          {MERGE_STRATEGIES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Output Format */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Output Format</label>
        <select
          value={outputFormat}
          onChange={(e) => onChange({ ...config, outputFormat: e.target.value })}
          className="w-full rounded-lg border border-border bg-card/50 px-3 py-1.5 text-xs text-foreground focus:border-teal-500/50 focus:outline-none"
        >
          {OUTPUT_FORMATS.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* Max Parallel */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">Max Parallel</label>
          <span className="text-xs text-muted-foreground">{maxParallel}</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          value={maxParallel}
          onChange={(e) => onChange({ ...config, maxParallel: Number(e.target.value) })}
          className="w-full accent-teal-500"
        />
      </div>

      {/* Info */}
      <div className="rounded-lg border border-border/50 bg-card/30 p-2.5">
        <p className="flex items-start gap-1 text-[10px] text-muted-foreground">
          <Info className="h-3 w-3 mt-0.5 shrink-0" />
          {urls.length} sites, {mergeStrategy.replace("_", " ")}, {maxParallel} parallel
        </p>
      </div>
    </div>
  );
}
