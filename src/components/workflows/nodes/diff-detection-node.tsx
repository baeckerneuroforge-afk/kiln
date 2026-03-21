"use client";

import { useState } from "react";
import { Eye, Plus, Trash2, Info } from "lucide-react";

interface ConfigProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function DiffDetectionConfig({ config, onChange }: ConfigProps) {
  const urls = (config.urls as string[]) || [];
  const sensitivity = String(config.sensitivity || "important_only");
  const continueIfNoChanges = config.continueIfNoChanges !== false;
  const [newUrl, setNewUrl] = useState("");

  const addUrl = () => {
    if (!newUrl.trim()) return;
    const updated = [...urls, newUrl.trim()];
    onChange({ ...config, urls: updated });
    setNewUrl("");
  };

  const removeUrl = (index: number) => {
    const updated = urls.filter((_, i) => i !== index);
    onChange({ ...config, urls: updated });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 text-blue-400">
        <Eye className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wider">Diff Detection</span>
      </div>

      {/* URL List */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400">Monitored URLs</label>
        {urls.map((url, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={url}
              onChange={(e) => {
                const updated = [...urls];
                updated[i] = e.target.value;
                onChange({ ...config, urls: updated });
              }}
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-xs text-zinc-200 focus:border-blue-500/50 focus:outline-none"
            />
            <button onClick={() => removeUrl(i)} className="p-1 text-zinc-600 hover:text-red-400">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addUrl()}
            placeholder="https://example.com"
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-xs text-zinc-400 placeholder:text-zinc-600 focus:border-blue-500/50 focus:outline-none"
          />
          <button onClick={addUrl} className="p-1 text-zinc-600 hover:text-blue-400">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Sensitivity */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400">Sensitivity</label>
        <select
          value={sensitivity}
          onChange={(e) => onChange({ ...config, sensitivity: e.target.value })}
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-xs text-zinc-200 focus:border-blue-500/50 focus:outline-none"
        >
          <option value="all_changes">All Changes</option>
          <option value="important_only">Important Only</option>
          <option value="price_changes_only">Price Changes Only</option>
        </select>
      </div>

      {/* Continue if no changes */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <label className="text-xs font-medium text-zinc-400">Continue if no changes</label>
          <p className="flex items-start gap-1 text-[10px] text-zinc-500">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            Skip downstream nodes when no changes detected
          </p>
        </div>
        <button
          onClick={() => onChange({ ...config, continueIfNoChanges: !continueIfNoChanges })}
          className={`h-5 w-9 rounded-full transition-colors ${continueIfNoChanges ? "bg-blue-500" : "bg-zinc-700"}`}
        >
          <div className={`h-4 w-4 rounded-full bg-white transition-transform ${continueIfNoChanges ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* URL count */}
      <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/30 p-2.5">
        <p className="text-[10px] text-zinc-500">
          {urls.length} URL{urls.length !== 1 ? "s" : ""} configured for monitoring
        </p>
      </div>
    </div>
  );
}
