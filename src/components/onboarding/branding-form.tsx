"use client";

import type { WizardBrandingConfig } from "@/lib/onboarding/types";

export function BrandingForm({
  value,
  onChange,
}: {
  value: WizardBrandingConfig;
  onChange: (value: WizardBrandingConfig) => void;
}) {
  function update(key: keyof WizardBrandingConfig, next: string) {
    onChange({ ...value, [key]: next });
  }
  return (
    <div className="grid gap-4 rounded-lg border border-border bg-card p-5 md:grid-cols-2">
      <label className="space-y-1 text-sm">
        <span className="font-medium text-foreground">Brand color</span>
        <div className="flex gap-2">
          <input type="color" value={value.brandColor || "#F97316"} onChange={(event) => update("brandColor", event.target.value)} className="h-10 w-14 rounded-md border border-border bg-background" />
          <input value={value.brandColor || "#F97316"} onChange={(event) => update("brandColor", event.target.value)} className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-foreground outline-none focus:border-kiln-orange" />
        </div>
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium text-foreground">Logo URL</span>
        <input value={value.logoUrl || ""} onChange={(event) => update("logoUrl", event.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground outline-none focus:border-kiln-orange" />
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium text-foreground">Custom subdomain</span>
        <input value={value.customSubdomain || ""} onChange={(event) => update("customSubdomain", event.target.value)} placeholder="kunde-x.agency.de" className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground outline-none focus:border-kiln-orange" />
      </label>
      <label className="space-y-1 text-sm md:col-span-2">
        <span className="font-medium text-foreground">Email signature</span>
        <textarea value={value.emailSignature || ""} onChange={(event) => update("emailSignature", event.target.value)} rows={5} className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-kiln-orange" />
      </label>
    </div>
  );
}
