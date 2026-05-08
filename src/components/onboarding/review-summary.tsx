"use client";

import type { WizardBasics, WizardChannelConfig, WizardTemplateSelection } from "@/lib/onboarding/types";

export function ReviewSummary({
  basics,
  templates,
  channels,
  kbCount,
  workerCount,
}: {
  basics: WizardBasics;
  templates: WizardTemplateSelection[];
  channels: WizardChannelConfig;
  kbCount: number;
  workerCount: number;
}) {
  const selectedTemplates = templates.filter((template) => template.selected);
  const enabledChannels = [
    channels.email?.enabled ? "Email" : null,
    channels.whatsapp?.enabled ? "WhatsApp" : null,
    channels.webchat?.enabled ? "Web Chat" : null,
    channels.voice?.enabled ? "Voice" : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="font-semibold text-foreground">Customer</h3>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Name</dt><dd className="text-foreground">{basics.customerName || "-"}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Industry</dt><dd className="text-foreground">{basics.industry}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Contact</dt><dd className="text-foreground">{basics.contactEmail || "-"}</dd></div>
        </dl>
      </section>
      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="font-semibold text-foreground">Activation</h3>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Departments</dt><dd className="text-foreground">{selectedTemplates.length}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Worker agents</dt><dd className="text-foreground">{workerCount}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">KB entries</dt><dd className="text-foreground">{kbCount}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Channels</dt><dd className="text-foreground">{enabledChannels.join(", ") || "-"}</dd></div>
        </dl>
      </section>
      <section className="rounded-lg border border-border bg-card p-4 md:col-span-2">
        <h3 className="font-semibold text-foreground">Departments to create</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedTemplates.map((template) => (
            <span key={template.templateId} className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground">{template.departmentName}</span>
          ))}
        </div>
      </section>
    </div>
  );
}
