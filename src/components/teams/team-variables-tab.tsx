"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock, Plus, Trash2, Variable } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type VariableType = "STRING" | "NUMBER" | "SECRET" | "JSON";

interface TeamVariable {
  id: string;
  name: string;
  value: string;
  type: VariableType;
  isSecret: boolean;
}

const emptyDraft: Omit<TeamVariable, "id"> = {
  name: "",
  value: "",
  type: "STRING",
  isSecret: false,
};

export function TeamVariablesTab({ teamId }: { teamId: string }) {
  const [variables, setVariables] = useState<TeamVariable[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const references = useMemo(
    () => variables.map((variable) => `{{ variable.${variable.name} }}`),
    [variables]
  );

  const fetchVariables = async () => {
    const res = await fetch(`/api/teams/${teamId}/variables`);
    if (!res.ok) return;
    const data = await res.json();
    setVariables(data.variables || []);
  };

  useEffect(() => {
    fetchVariables();
  }, [teamId]);

  const saveVariable = async () => {
    setSaving(true);
    setError(null);
    try {
      const type = draft.isSecret ? "SECRET" : draft.type;
      const res = await fetch(`/api/teams/${teamId}/variables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save variable.");
      setDraft(emptyDraft);
      await fetchVariables();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save variable.");
    } finally {
      setSaving(false);
    }
  };

  const deleteVariable = async (variable: TeamVariable) => {
    await fetch(`/api/teams/${teamId}/variables?variableId=${encodeURIComponent(variable.id)}`, {
      method: "DELETE",
    });
    await fetchVariables();
  };

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="max-w-5xl space-y-6">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Variable className="h-4 w-4 text-orange-500" />
            Workflow Variables
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Use references like <span className="font-mono text-foreground">{"{{ variable.name }}"}</span> in node text fields.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_160px_120px_auto]">
          <input
            value={draft.name}
            onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="variable_name"
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-orange-500/50"
          />
          <select
            value={draft.type}
            onChange={(e) => setDraft((prev) => ({ ...prev, type: e.target.value as VariableType, isSecret: e.target.value === "SECRET" }))}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none"
          >
            <option value="STRING">String</option>
            <option value="NUMBER">Number</option>
            <option value="JSON">JSON</option>
            <option value="SECRET">Secret</option>
          </select>
          <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={draft.isSecret}
              onChange={(e) => setDraft((prev) => ({ ...prev, isSecret: e.target.checked, type: e.target.checked ? "SECRET" : prev.type === "SECRET" ? "STRING" : prev.type }))}
              className="accent-orange-500"
            />
            Secret
          </label>
          <Button onClick={saveVariable} disabled={saving || !draft.name.trim()} className="bg-orange-600 text-white hover:bg-orange-500">
            <Plus className="h-4 w-4 mr-1.5" />
            Add
          </Button>
          <textarea
            value={draft.value}
            onChange={(e) => setDraft((prev) => ({ ...prev, value: e.target.value }))}
            placeholder={draft.type === "JSON" ? '{"key": "value"}' : "Value"}
            className="md:col-span-4 min-h-20 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-orange-500/50 font-mono"
          />
        </div>

        {error && <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-300">{error}</div>}

        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Reference</th>
                <th className="px-4 py-3 text-left">Value</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {variables.map((variable) => (
                <tr key={variable.id} className="bg-card/50">
                  <td className="px-4 py-3 font-mono text-foreground">{variable.name}</td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", variable.isSecret ? "bg-amber-500/15 text-amber-400" : "bg-muted text-muted-foreground")}>
                      {variable.isSecret && <Lock className="h-2.5 w-2.5" />}
                      {variable.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-orange-300">{`{{ variable.${variable.name} }}`}</td>
                  <td className="px-4 py-3 max-w-sm truncate font-mono text-xs text-muted-foreground">{variable.value}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => deleteVariable(variable)} className="text-muted-foreground hover:text-red-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {variables.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-muted-foreground" colSpan={5}>No variables defined.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {references.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {references.map((reference) => (
              <button
                key={reference}
                onClick={() => navigator.clipboard.writeText(reference)}
                className="rounded-md border border-border bg-card px-2 py-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
              >
                {reference}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
