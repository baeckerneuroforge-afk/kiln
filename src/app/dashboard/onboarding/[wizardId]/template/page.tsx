"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3, Database, Loader2, MessageCircle, Mic2, Network } from "lucide-react";
import { TemplateCard, type TemplateCardData } from "@/components/onboarding/template-card";
import { WizardShell } from "@/components/onboarding/wizard-shell";
import { Button } from "@/components/ui/button";
import type { IndustryTemplateMetadata, OnboardingIndustry, WizardTemplateSelection } from "@/lib/onboarding/types";

interface WizardStatus {
  basics?: { industry?: OnboardingIndustry };
  selectedTemplates?: WizardTemplateSelection[];
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

export default function TemplatePage({ params }: { params: { wizardId: string } }) {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateCardData[]>([]);
  const [detail, setDetail] = useState<TemplateResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const status = (await (await fetch(`/api/onboarding/wizard/${params.wizardId}/status`)).json()) as WizardStatus;
      const industry = status.basics?.industry || "custom";
      const detail = (await (await fetch(`/api/onboarding/templates/${industry}`)).json()) as TemplateResponse;
      setDetail(detail);
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
      body: JSON.stringify({ templates: payload }),
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
                  <h2 className="mt-1 text-lg font-semibold text-foreground">Dental v{detail.metadata.packVersion}</h2>
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
          <div className="flex justify-end">
            <Button onClick={save}>Continue</Button>
          </div>
        </div>
      )}
    </WizardShell>
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
