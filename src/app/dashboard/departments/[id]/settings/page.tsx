"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DepartmentDetailShell } from "@/components/departments/department-detail-shell";
import type { DepartmentView } from "@/components/departments/types";

export default function DepartmentSettingsPage() {
  const params = useParams<{ id: string }>();
  const [department, setDepartment] = useState<DepartmentView | null>(null);

  async function load() {
    const response = await fetch(`/api/departments/${params.id}`);
    setDepartment(await response.json());
  }

  useEffect(() => {
    load();
  }, [params.id]);

  async function patch(data: Partial<DepartmentView>) {
    const response = await fetch(`/api/departments/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setDepartment(await response.json());
  }

  if (!department) return <div className="p-8 text-sm text-muted-foreground">Loading settings</div>;

  return (
    <DepartmentDetailShell department={department}>
      <div className="space-y-4 rounded-lg border border-border bg-card/70 p-5">
        <div className="grid gap-2">
          <label className="text-sm text-muted-foreground">Status</label>
          <div className="flex flex-wrap gap-2">
            {["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"].map((status) => (
              <Button
                key={status}
                variant={department.status === status ? "default" : "outline"}
                onClick={() => patch({ status: status as DepartmentView["status"] })}
              >
                {status}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          <label className="text-sm text-muted-foreground">Schedule cron</label>
          <Input
            defaultValue={department.scheduleCron || ""}
            placeholder="*/15 * * * *"
            onBlur={(event) => patch({ scheduleCron: event.target.value || null })}
          />
          <div className="flex items-center gap-3 pt-2">
            <Switch
              checked={department.scheduleEnabled}
              onCheckedChange={(checked) => patch({ scheduleEnabled: checked })}
            />
            <span className="text-sm text-muted-foreground">Schedule enabled</span>
          </div>
        </div>
        <div className="grid gap-2">
          <label className="text-sm text-muted-foreground">Webhook secret</label>
          <Input readOnly value={department.webhookSecret || ""} />
        </div>
      </div>

      <section className="mt-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Channels</h2>
        <div className="rounded-lg border border-border bg-card/70 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-medium text-foreground">Email</h3>
              <p className="text-sm text-muted-foreground">Resend inbound and outbound support email.</p>
            </div>
            <Switch
              checked={department.emailEnabled}
              onCheckedChange={(checked) => patch({ emailEnabled: checked })}
            />
          </div>
          {department.emailEnabled ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <ChannelInput label="Inbound address" value={department.emailInboundAddr} onSave={(value) => patch({ emailInboundAddr: value })} />
              <ChannelInput label="From address" value={department.emailFromAddr} onSave={(value) => patch({ emailFromAddr: value })} />
              <ChannelInput label="From name" value={department.emailFromName} onSave={(value) => patch({ emailFromName: value })} />
              <ChannelInput label="Reply-to address" value={department.emailReplyToAddr} onSave={(value) => patch({ emailReplyToAddr: value })} />
              <p className="md:col-span-2 text-xs text-muted-foreground">
                Webhook URL: https://kilnbase.com/api/webhooks/department-email/{department.id}
              </p>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-border bg-card/70 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-medium text-foreground">WhatsApp</h3>
              <p className="text-sm text-muted-foreground">Meta WhatsApp Business Cloud API.</p>
            </div>
            <Switch
              checked={department.whatsappEnabled}
              onCheckedChange={(checked) => patch({ whatsappEnabled: checked })}
            />
          </div>
          {department.whatsappEnabled ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <ChannelInput label="Phone Number ID" value={department.whatsappPhoneId} onSave={(value) => patch({ whatsappPhoneId: value })} />
              <ChannelInput label="Business Account ID" value={department.whatsappBusinessId} onSave={(value) => patch({ whatsappBusinessId: value })} />
              <p className="md:col-span-2 text-xs text-muted-foreground">
                Webhook URL: https://kilnbase.com/api/webhooks/department-whatsapp/{department.id}
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </DepartmentDetailShell>
  );
}

function ChannelInput({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string | null;
  onSave: (value: string | null) => void;
}) {
  return (
    <label className="grid gap-1 text-sm text-muted-foreground">
      {label}
      <Input defaultValue={value || ""} onBlur={(event) => onSave(event.target.value || null)} />
    </label>
  );
}
