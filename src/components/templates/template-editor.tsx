"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Send, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TemplateDeployModal } from "@/components/templates/template-deploy-modal";

type TemplateKind = "agents" | "workflows";

type TemplateRecord = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  version: number;
  isPublished: boolean;
  agentConfig?: unknown;
  workflowConfig?: unknown;
};

type InstanceRecord = {
  id: string;
  subOrgName: string;
  isCustomized: boolean;
};

export function TemplateEditor({ kind, id }: { kind: TemplateKind; id: string }) {
  const router = useRouter();
  const [template, setTemplate] = useState<TemplateRecord | null>(null);
  const [instances, setInstances] = useState<InstanceRecord[]>([]);
  const [configText, setConfigText] = useState("");
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deployModalOpen, setDeployModalOpen] = useState(false);

  async function load() {
    const [templateResponse, instancesResponse] = await Promise.all([
      fetch(`/api/templates/${kind}/${id}`),
      fetch(`/api/templates/${kind}/${id}/instances`),
    ]);
    if (!templateResponse.ok) {
      router.push(`/dashboard/templates/${kind}`);
      return;
    }
    const templatePayload = (await templateResponse.json()) as { template: TemplateRecord };
    const instancePayload = instancesResponse.ok
      ? ((await instancesResponse.json()) as { instances: InstanceRecord[] })
      : { instances: [] };
    setTemplate(templatePayload.template);
    setInstances(instancePayload.instances);
    const config = kind === "agents" ? templatePayload.template.agentConfig : templatePayload.template.workflowConfig;
    setConfigText(JSON.stringify(config ?? {}, null, 2));
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);

  async function save() {
    if (!template) return;
    setSaving(true);
    setMessage(null);
    try {
      const parsed = JSON.parse(configText) as Record<string, unknown>;
      const response = await fetch(`/api/templates/${kind}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: template.name,
          description: template.description,
          category: template.category,
          isPublished: template.isPublished,
          [kind === "agents" ? "agentConfig" : "workflowConfig"]: parsed,
        }),
      });
      if (!response.ok) throw new Error("Save failed");
      setMessage("Template gespeichert.");
      await load();
    } catch (error) {
      setMessage(error instanceof SyntaxError ? "Config JSON ist ungültig." : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function push() {
    const customized = instances.filter((instance) => instance.isCustomized).length;
    const targetCount = instances.length - customized;
    const confirmed = window.confirm(
      `${targetCount} Sub-Orgs werden aktualisiert. ${customized} angepasste Instanzen werden übersprungen. Fortfahren?`
    );
    if (!confirmed) return;
    setPushing(true);
    const response = await fetch(`/api/templates/${kind}/${id}/push`, { method: "POST" });
    if (response.ok) {
      const payload = (await response.json()) as { result: { updated: number; skippedCustomized: number } };
      setMessage(`${payload.result.updated} aktualisiert, ${payload.result.skippedCustomized} angepasst übersprungen.`);
      await load();
    } else {
      setMessage("Push fehlgeschlagen.");
    }
    setPushing(false);
  }

  if (!template) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading template
      </div>
    );
  }

  const customizedCount = instances.filter((instance) => instance.isCustomized).length;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-kiln-orange">
            {kind === "agents" ? "Agent Template" : "Workflow Template"} · v{template.version}
          </p>
          <input
            value={template.name}
            onChange={(event) => setTemplate({ ...template, name: event.target.value })}
            className="mt-1 w-full bg-transparent font-serif text-3xl font-normal text-foreground outline-none"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setDeployModalOpen(true)}
            data-testid="template-editor-open-deploy"
          >
            <Rocket className="mr-2 h-4 w-4" />
            Deploy auf Sub-Org(s)
          </Button>
          <Button variant="outline" onClick={push} disabled={pushing || instances.length === 0}>
            <Send className="mr-2 h-4 w-4" />
            Push Update
          </Button>
          <Button onClick={save} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          {message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <section className="space-y-3">
          <input
            value={template.description ?? ""}
            onChange={(event) => setTemplate({ ...template, description: event.target.value })}
            placeholder="Beschreibung"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-kiln-orange"
          />
          <textarea
            value={configText}
            onChange={(event) => setConfigText(event.target.value)}
            className="min-h-[520px] w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground outline-none focus:border-kiln-orange"
            spellCheck={false}
          />
        </section>

        <aside className="space-y-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">Push Preview</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Installed</dt>
                <dd className="text-foreground">{instances.length}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Will update</dt>
                <dd className="text-foreground">{instances.length - customizedCount}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Customized</dt>
                <dd className="text-foreground">{customizedCount}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">Instances</h2>
            <div className="mt-3 space-y-2">
              {instances.length === 0 ? (
                <p className="text-sm text-muted-foreground">Noch nicht installiert.</p>
              ) : (
                instances.map((instance) => (
                  <div key={instance.id} className="rounded-md bg-muted/30 px-3 py-2 text-sm">
                    <p className="truncate text-foreground">{instance.subOrgName}</p>
                    <p className="text-xs text-muted-foreground">
                      {instance.isCustomized ? "Customized, wird übersprungen" : "Sync-ready"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>

      <TemplateDeployModal
        open={deployModalOpen}
        onClose={() => {
          setDeployModalOpen(false);
          void load();
        }}
        templateId={id}
        templateKind={kind}
        templateName={template.name}
      />
    </div>
  );
}
