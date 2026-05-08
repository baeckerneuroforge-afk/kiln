"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { TemplateCard, type TemplateCardData } from "@/components/onboarding/template-card";
import { WizardShell } from "@/components/onboarding/wizard-shell";
import { Button } from "@/components/ui/button";
import type { OnboardingIndustry, WizardTemplateSelection } from "@/lib/onboarding/types";

interface WizardStatus {
  basics?: { industry?: OnboardingIndustry };
  selectedTemplates?: WizardTemplateSelection[];
}

interface TemplateResponse {
  departmentTemplates: {
    id: string;
    name: string;
    description: string;
    workers: unknown[];
    premium?: boolean;
    seasonal?: boolean;
  }[];
}

export default function TemplatePage({ params }: { params: { wizardId: string } }) {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateCardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const status = (await (await fetch(`/api/onboarding/wizard/${params.wizardId}/status`)).json()) as WizardStatus;
      const industry = status.basics?.industry || "custom";
      const detail = (await (await fetch(`/api/onboarding/templates/${industry}`)).json()) as TemplateResponse;
      const selected = new Map((status.selectedTemplates ?? []).map((item) => [item.templateId, item.selected]));
      setTemplates(
        detail.departmentTemplates.map((template) => ({
          id: template.id,
          name: template.name,
          description: template.description,
          workerCount: template.workers.length,
          selected: selected.get(template.id) ?? true,
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
