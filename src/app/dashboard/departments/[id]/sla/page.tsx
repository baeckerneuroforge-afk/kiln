"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface SlaPolicy {
  id: string;
  departmentId: string;
  name: string;
  description: string | null;
  appliesTo: string;
  conditionValue: string | null;
  firstResponseTargetMinutes: number;
  resolutionTargetMinutes: number | null;
  warningThresholdPercent: number;
  escalationChannel: string | null;
  escalationTargetUserId: string | null;
  isActive: boolean;
  priority: number;
}

const APPLIES_TO_OPTIONS = ["ALL", "BY_PRIORITY", "BY_CHANNEL", "BY_TAG"];

export default function DepartmentSlaPage() {
  const params = useParams<{ id: string }>();
  const departmentId = params?.id;
  const [policies, setPolicies] = useState<SlaPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!departmentId) return;
    setLoading(true);
    const res = await fetch(`/api/sla/policies?departmentId=${departmentId}`);
    if (res.ok) {
      const payload = await res.json();
      setPolicies(payload.policies ?? []);
    }
    setLoading(false);
  }, [departmentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = useCallback(
    async (formValues: Partial<SlaPolicy>) => {
      if (!departmentId) return;
      setCreating(true);
      const res = await fetch(`/api/sla/policies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ departmentId, ...formValues }),
      });
      setCreating(false);
      if (res.ok) await refresh();
    },
    [departmentId, refresh],
  );

  const handleUpdate = useCallback(
    async (id: string, patch: Partial<SlaPolicy>) => {
      await fetch(`/api/sla/policies/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      await refresh();
    },
    [refresh],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Policy wirklich loeschen?")) return;
      await fetch(`/api/sla/policies/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">SLA-Policies</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reaktionszeit-Regeln fuer dieses Department. Hoechste Prioritaet gewinnt bei Match.
        </p>
      </div>

      <NewPolicyForm onSubmit={handleCreate} disabled={creating} />

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : policies.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Noch keine SLA-Policies definiert.
        </div>
      ) : (
        <ul className="space-y-3">
          {policies.map((policy) => (
            <li key={policy.id} className="rounded-md border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-foreground">{policy.name}</h3>
                    <Badge variant={policy.isActive ? "default" : "outline"}>
                      {policy.isActive ? "active" : "inactive"}
                    </Badge>
                    <Badge variant="outline">Priority {policy.priority}</Badge>
                  </div>
                  {policy.description ? (
                    <p className="text-sm text-muted-foreground">{policy.description}</p>
                  ) : null}
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(policy.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                <Field label="Erste Antwort">{policy.firstResponseTargetMinutes} Min</Field>
                <Field label="Resolution">{policy.resolutionTargetMinutes ?? "—"} Min</Field>
                <Field label="Warning bei">{policy.warningThresholdPercent}%</Field>
                <Field label="Eskalation">{policy.escalationChannel ?? "—"}</Field>
                <Field label="appliesTo">{policy.appliesTo}</Field>
                {policy.conditionValue ? <Field label="condition">{policy.conditionValue}</Field> : null}
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleUpdate(policy.id, { isActive: !policy.isActive })}
                >
                  {policy.isActive ? "Deaktivieren" : "Aktivieren"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewPolicyForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (values: Partial<SlaPolicy>) => void | Promise<void>;
  disabled: boolean;
}) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState(60);
  const [appliesTo, setAppliesTo] = useState("ALL");
  const [conditionValue, setConditionValue] = useState("");
  const [escalationChannel, setEscalationChannel] = useState("BOTH");
  const [warning, setWarning] = useState(75);

  return (
    <form
      className="grid gap-3 rounded-md border border-border p-4 md:grid-cols-2"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!name.trim()) return;
        await onSubmit({
          name: name.trim(),
          firstResponseTargetMinutes: target,
          appliesTo,
          conditionValue: conditionValue.trim() || null,
          escalationChannel,
          warningThresholdPercent: warning,
        });
        setName("");
        setConditionValue("");
      }}
    >
      <div>
        <label className="text-xs uppercase text-muted-foreground">Name</label>
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Kritisch / Standard / Niedrig" />
      </div>
      <div>
        <label className="text-xs uppercase text-muted-foreground">Erste Antwort (Min)</label>
        <Input
          type="number"
          min={1}
          value={target}
          onChange={(event) => setTarget(Number.parseInt(event.target.value, 10) || 0)}
        />
      </div>
      <div>
        <label className="text-xs uppercase text-muted-foreground">applies-to</label>
        <select
          value={appliesTo}
          onChange={(event) => setAppliesTo(event.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {APPLIES_TO_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs uppercase text-muted-foreground">condition value</label>
        <Input value={conditionValue} onChange={(event) => setConditionValue(event.target.value)} placeholder="URGENT, EMAIL, …" />
      </div>
      <div>
        <label className="text-xs uppercase text-muted-foreground">Eskalation</label>
        <select
          value={escalationChannel}
          onChange={(event) => setEscalationChannel(event.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="BOTH">SLACK + EMAIL</option>
          <option value="SLACK">SLACK</option>
          <option value="EMAIL">EMAIL</option>
        </select>
      </div>
      <div>
        <label className="text-xs uppercase text-muted-foreground">Warning Schwelle (%)</label>
        <Input
          type="number"
          min={1}
          max={100}
          value={warning}
          onChange={(event) => setWarning(Number.parseInt(event.target.value, 10) || 0)}
        />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" disabled={disabled || !name.trim() || target <= 0}>
          <Plus className="mr-2 h-4 w-4" /> Policy anlegen
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}
