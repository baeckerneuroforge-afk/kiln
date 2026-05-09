"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type TemplateKind = "agents" | "workflows";

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  version: number;
  isPublished: boolean;
  updatedAt: string;
};

type TemplateResponse = {
  templates: TemplateRow[];
};

export function TemplateListManager({ kind }: { kind: TemplateKind }) {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const title = kind === "agents" ? "Agent Templates" : "Workflow Templates";
  const emptyConfig = useMemo(
    () =>
      kind === "agents"
        ? {
            name: name || "Neues Agent Template",
            systemPrompt: "Du bist ein hilfreicher Assistent.",
            suggestedQuestions: [],
          }
        : {
            name: name || "Neues Workflow Template",
            goal: "Beschreibe hier das Workflow-Ziel.",
            config: { nodes: [], edges: [] },
          },
    [kind, name]
  );

  async function load() {
    setLoading(true);
    const response = await fetch(`/api/templates/${kind}`);
    if (response.ok) {
      const data = (await response.json()) as TemplateResponse;
      setTemplates(data.templates);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  async function createTemplate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const response = await fetch(`/api/templates/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmed,
        description: description.trim() || null,
        [kind === "agents" ? "agentConfig" : "workflowConfig"]: {
          ...emptyConfig,
          name: trimmed,
          description: description.trim() || null,
        },
      }),
    });
    if (response.ok) {
      setName("");
      setDescription("");
      await load();
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-normal text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Master-Snapshots, die beim Sub-Org-Onboarding als unabhängige Kopien installiert werden.
          </p>
        </div>
        <div className="flex rounded-md border border-border bg-card p-1 text-sm">
          <Link
            href="/dashboard/templates/agents"
            className={`rounded px-3 py-1.5 ${kind === "agents" ? "bg-kiln-orange text-white" : "text-muted-foreground hover:text-foreground"}`}
          >
            Agents
          </Link>
          <Link
            href="/dashboard/templates/workflows"
            className={`rounded px-3 py-1.5 ${kind === "workflows" ? "bg-kiln-orange text-white" : "text-muted-foreground hover:text-foreground"}`}
          >
            Workflows
          </Link>
          <Link
            href="/dashboard/templates/departments"
            className="rounded px-3 py-1.5 text-muted-foreground hover:text-foreground"
          >
            Departments
          </Link>
        </div>
      </div>

      <div className="mb-6 grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-[1fr_1fr_auto]">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={kind === "agents" ? "Agent Template Name" : "Workflow Template Name"}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-kiln-orange"
        />
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Beschreibung"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-kiln-orange"
        />
        <Button onClick={createTemplate} disabled={!name.trim()}>
          <Plus className="mr-2 h-4 w-4" />
          Create
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card/60">
        {loading ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading templates
          </div>
        ) : templates.length === 0 ? (
          <div className="p-8 text-sm text-muted-foreground">
            Noch keine Templates. Erstellen Sie ein Master-Template oder wandeln Sie einen bestehenden Agent/Workflow um.
          </div>
        ) : (
          templates.map((template) => (
            <Link
              key={template.id}
              href={`/dashboard/templates/${kind}/${template.id}`}
              className="grid gap-2 border-b border-border p-4 transition-colors hover:bg-muted/40 last:border-b-0 md:grid-cols-[1fr_auto]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-foreground">{template.name}</h2>
                  <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    v{template.version}
                  </span>
                  <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {template.isPublished ? "Published" : "Draft"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{template.description || "Keine Beschreibung"}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Updated {new Date(template.updatedAt).toLocaleString("de-DE")}
              </p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
