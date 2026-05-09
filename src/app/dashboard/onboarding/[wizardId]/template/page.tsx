"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Clock3, Database, Loader2, MessageCircle, Mic2, Network, Workflow } from "lucide-react";
import { TemplateCard, type TemplateCardData } from "@/components/onboarding/template-card";
import { WizardShell } from "@/components/onboarding/wizard-shell";
import { Button } from "@/components/ui/button";
import type { IndustryTemplateMetadata, OnboardingIndustry, WizardTemplateSelection } from "@/lib/onboarding/types";

interface WizardStatus {
  basics?: { industry?: OnboardingIndustry };
  selectedTemplates?: WizardTemplateSelection[];
  selectedAgentTemplates?: string[];
  selectedWorkflowTemplates?: string[];
}

interface TemplateResponse {
  departmentTemplates: {
    id: string;
    name: string;
    description: string;
    defaultSelected: boolean;
    workers: unknown[];
    premium?: boolean;
    seasonal?: boolean;
  }[];
  knowledgeBaseSeeds?: unknown[];
  metadata?: IndustryTemplateMetadata | null;
}

interface AgencyTemplateOption {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  version: number;
}

interface AgencyTemplateResponse {
  templates: AgencyTemplateOption[];
}

export default function TemplatePage({ params }: { params: { wizardId: string } }) {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateCardData[]>([]);
  const [agentTemplates, setAgentTemplates] = useState<AgencyTemplateOption[]>([]);
  const [workflowTemplates, setWorkflowTemplates] = useState<AgencyTemplateOption[]>([]);
  const [selectedAgentTemplates, setSelectedAgentTemplates] = useState<string[]>([]);
  const [selectedWorkflowTemplates, setSelectedWorkflowTemplates] = useState<string[]>([]);
  const [detail, setDetail] = useState<TemplateResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const status = (await (await fetch(`/api/onboarding/wizard/${params.wizardId}/status`)).json()) as WizardStatus;
      const industry = status.basics?.industry || "custom";
      const [detail, agents, workflows] = await Promise.all([
        fetch(`/api/onboarding/templates/${industry}`).then((response) => response.json() as Promise<TemplateResponse>),
        fetch("/api/templates/agents").then((response) => response.ok ? response.json() as Promise<AgencyTemplateResponse> : { templates: [] }),
        fetch("/api/templates/workflows").then((response) => response.ok ? response.json() as Promise<AgencyTemplateResponse> : { templates: [] }),
      ]);
      setDetail(detail);
      setAgentTemplates(agents.templates.filter((template) => template.version > 0));
      setWorkflowTemplates(workflows.templates.filter((template) => template.version > 0));
      setSelectedAgentTemplates(status.selectedAgentTemplates ?? []);
      setSelectedWorkflowTemplates(status.selectedWorkflowTemplates ?? []);
      const selected = new Map((status.selectedTemplates ?? []).map((item) => [item.templateId, item.selected]));
      setTemplates(
        detail.departmentTemplates.map((template) => ({
          id: template.id,
          name: template.name,
          description: template.description,
          workerCount: template.workers.length,
          selected: selected.get(template.id) ?? template.defaultSelected,
          premium: template.premium,
          seasonal: template.seasonal,
        }))
      );
      setLoading(false);
    }
    void load();
  }, [params.wizardId]);

  async function save() {
    const payload = templates.map((template) => ({ templateId: template.id, departmentName: template.name, selected: template.selected }));
    const response = await fetch(`/api/onboarding/wizard/${params.wizardId}/step/2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templates: payload,
        agentTemplates: selectedAgentTemplates,
        workflowTemplates: selectedWorkflowTemplates,
      }),
    });
    if (response.ok) router.push(`/dashboard/onboarding/${params.wizardId}/knowledge`);
  }

  return (
    <WizardShell wizardId={params.wizardId} step={2} title="Industry Template" description="Pick the departments that should be created for this customer.">
      {loading ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading templates</div>
      ) : (
        <div className="space-y-5">
          {detail && detail.metadata?.packVersion && (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-kiln-orange">Industry-Pack</p>
                  <h2 className="mt-1 text-lg font-semibold text-foreground">Pack v{detail.metadata.packVersion}</h2>
                </div>
                <div className="inline-flex items-center gap-2 rounded-md border border-kiln-orange/30 bg-kiln-orange/10 px-3 py-2 text-sm text-kiln-orange">
                  <Clock3 className="h-4 w-4" />
                  Statt {detail.metadata.estimatedManualSetupHours ?? 8}h Setup {"->"} {detail.metadata.setupTimeMinutes ?? 30} Min
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <PackStat icon={<Network className="h-4 w-4" />} label="Departments" value={detail.departmentTemplates.length} />
                <PackStat icon={<Database className="h-4 w-4" />} label="FAQs" value={detail.knowledgeBaseSeeds?.length ?? 0} />
                <PackStat icon={<MessageCircle className="h-4 w-4" />} label="WhatsApp-Templates" value={detail.metadata.whatsappTemplates?.length ?? 0} />
                <PackStat icon={<Mic2 className="h-4 w-4" />} label="Voice-Setup" value={detail.metadata.voiceScripts?.length ?? 0} />
              </div>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {templates.map((template) => (
              <TemplateCard key={template.id} template={template} onToggle={(id) => setTemplates((prev) => prev.map((item) => item.id === id ? { ...item, selected: !item.selected } : item))} />
            ))}
          </div>
          {(agentTemplates.length > 0 || workflowTemplates.length > 0) && (
            <div className="grid gap-4 md:grid-cols-2">
              <AgencyTemplatePicker
                title="Agent Templates"
                icon={<Bot className="h-4 w-4" />}
                templates={agentTemplates}
                selectedIds={selectedAgentTemplates}
                onToggle={(id) => setSelectedAgentTemplates((prev) => toggleId(prev, id))}
              />
              <AgencyTemplatePicker
                title="Workflow Templates"
                icon={<Workflow className="h-4 w-4" />}
                templates={workflowTemplates}
                selectedIds={selectedWorkflowTemplates}
                onToggle={(id) => setSelectedWorkflowTemplates((prev) => toggleId(prev, id))}
              />
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={save}>Continue</Button>
          </div>
        </div>
      )}
    </WizardShell>
  );
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

function AgencyTemplatePicker({
  title,
  icon,
  templates,
  selectedIds,
  onToggle,
}: {
  title: string;
  icon: React.ReactNode;
  templates: AgencyTemplateOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="text-muted-foreground">{icon}</div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine veröffentlichten Templates verfügbar.</p>
      ) : (
        <div className="space-y-2">
          {templates.map((template) => {
            const checked = selectedIds.includes(template.id);
            return (
              <label
                key={template.id}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/20 p-3 transition-colors hover:bg-muted/40"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(template.id)}
                  className="mt-1 h-4 w-4 rounded border-border"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {template.name} · v{template.version}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                    {template.description || template.category || "Agency Master-Template"}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PackStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex min-h-20 items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="text-muted-foreground">{icon}</div>
      <div>
        <div className="text-xl font-semibold text-foreground">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
