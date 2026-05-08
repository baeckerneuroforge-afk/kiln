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
    </DepartmentDetailShell>
  );
}
