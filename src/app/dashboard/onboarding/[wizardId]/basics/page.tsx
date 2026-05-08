"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { IndustryPicker } from "@/components/onboarding/industry-picker";
import { WizardShell } from "@/components/onboarding/wizard-shell";
import { Button } from "@/components/ui/button";
import type { OnboardingIndustry, WizardBasics } from "@/lib/onboarding/types";

export default function BasicsPage({ params }: { params: { wizardId: string } }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [basics, setBasics] = useState<WizardBasics>({
    customerName: "",
    industry: "dental",
  });

  function update(key: keyof WizardBasics, value: string) {
    setBasics((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (!basics.customerName.trim()) return;
    setSaving(true);
    const response = await fetch(`/api/onboarding/wizard/${params.wizardId}/step/1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(basics),
    });
    setSaving(false);
    if (response.ok) router.push(`/dashboard/onboarding/${params.wizardId}/template`);
  }

  return (
    <WizardShell wizardId={params.wizardId} step={1} title="Customer Basics" description="Capture the workspace, industry, owner contact, and optional domain details.">
      <div className="space-y-5 rounded-lg border border-border bg-card p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-foreground">Customer name</span>
            <input value={basics.customerName} onChange={(event) => update("customerName", event.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground outline-none focus:border-kiln-orange" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-foreground">Logo URL</span>
            <input value={basics.logoUrl || ""} onChange={(event) => update("logoUrl", event.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground outline-none focus:border-kiln-orange" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-foreground">Contact person</span>
            <input value={basics.contactName || ""} onChange={(event) => update("contactName", event.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground outline-none focus:border-kiln-orange" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-foreground">Contact email</span>
            <input type="email" value={basics.contactEmail || ""} onChange={(event) => update("contactEmail", event.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground outline-none focus:border-kiln-orange" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-foreground">Address</span>
            <input value={basics.address || ""} onChange={(event) => update("address", event.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground outline-none focus:border-kiln-orange" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-foreground">Custom domain</span>
            <input value={basics.customDomain || ""} onChange={(event) => update("customDomain", event.target.value)} placeholder="kunde-x.agency.de" className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground outline-none focus:border-kiln-orange" />
          </label>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Industry</h2>
          <IndustryPicker value={basics.industry} onChange={(value: OnboardingIndustry) => setBasics((prev) => ({ ...prev, industry: value }))} />
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || !basics.customerName.trim()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Continue
          </Button>
        </div>
      </div>
    </WizardShell>
  );
}
