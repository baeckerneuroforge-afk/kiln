"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChannelConfigCard } from "@/components/onboarding/channel-config-card";
import { WizardShell } from "@/components/onboarding/wizard-shell";
import { Button } from "@/components/ui/button";
import type { WizardChannelConfig } from "@/lib/onboarding/types";

export default function ChannelsPage({ params }: { params: { wizardId: string } }) {
  const router = useRouter();
  const [config, setConfig] = useState<WizardChannelConfig>({
    email: { enabled: true, setupDnsLater: true },
    whatsapp: { enabled: false },
    webchat: { enabled: true },
    voice: { enabled: false, afterHoursOnly: true },
  });

  function update(next: WizardChannelConfig) {
    setConfig(next);
  }

  async function save() {
    const response = await fetch(`/api/onboarding/wizard/${params.wizardId}/step/4`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (response.ok) router.push(`/dashboard/onboarding/${params.wizardId}/branding`);
  }

  return (
    <WizardShell wizardId={params.wizardId} step={4} title="Channel Setup" description="Enable the channels this customer should use from day one.">
      <div className="space-y-3">
        <ChannelConfigCard title="Email" description="Inbound and outbound email with DNS setup checklist." checked={config.email?.enabled ?? false} onChange={(enabled) => update({ ...config, email: { ...config.email, enabled } })}>
          <input value={config.email?.inboundAddress || ""} onChange={(event) => update({ ...config, email: { ...config.email, enabled: true, inboundAddress: event.target.value } })} placeholder="support@kunde.de" className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground outline-none focus:border-kiln-orange" />
          <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={config.email?.setupDnsLater ?? false} onChange={(event) => update({ ...config, email: { ...config.email, enabled: true, setupDnsLater: event.target.checked } })} /> I will set up DNS later</label>
        </ChannelConfigCard>
        <ChannelConfigCard title="WhatsApp Business" description="Prepared for Meta Business Manager setup after activation." checked={config.whatsapp?.enabled ?? false} onChange={(enabled) => update({ ...config, whatsapp: { enabled } })} />
        <ChannelConfigCard title="Web Chat Widget" description="Generate a customer-colored embed snippet after activation." checked={config.webchat?.enabled ?? false} onChange={(enabled) => update({ ...config, webchat: { ...config.webchat, enabled } })} />
        <ChannelConfigCard title="Voice Agent" description="Premium after-hours voice capture; Twilio provisioning follows later." checked={config.voice?.enabled ?? false} onChange={(enabled) => update({ ...config, voice: { ...config.voice, enabled } })} />
        <div className="flex justify-end">
          <Button onClick={save}>Continue</Button>
        </div>
      </div>
    </WizardShell>
  );
}
