"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandingForm } from "@/components/onboarding/branding-form";
import { WizardShell } from "@/components/onboarding/wizard-shell";
import { Button } from "@/components/ui/button";
import type { WizardBrandingConfig } from "@/lib/onboarding/types";

export default function BrandingPage({ params }: { params: { wizardId: string } }) {
  const router = useRouter();
  const [branding, setBranding] = useState<WizardBrandingConfig>({ brandColor: "#F97316" });

  async function save() {
    const response = await fetch(`/api/onboarding/wizard/${params.wizardId}/step/5`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(branding),
    });
    if (response.ok) router.push(`/dashboard/onboarding/${params.wizardId}/review`);
  }

  return (
    <WizardShell wizardId={params.wizardId} step={5} title="White-Label Branding" description="Apply the customer's visual identity to portal, widget, emails, and subdomain.">
      <div className="space-y-4">
        <BrandingForm value={branding} onChange={setBranding} />
        <div className="flex justify-end">
          <Button onClick={save}>Continue</Button>
        </div>
      </div>
    </WizardShell>
  );
}
