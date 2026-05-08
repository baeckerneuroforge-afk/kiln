"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Play, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DepartmentDetailShell } from "@/components/departments/department-detail-shell";
import { RunLogStream } from "@/components/departments/run-log-stream";
import type { DepartmentView } from "@/components/departments/types";

export default function DepartmentOverviewPage() {
  const params = useParams<{ id: string }>();
  const [department, setDepartment] = useState<DepartmentView | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  async function load() {
    const response = await fetch(`/api/departments/${params.id}`);
    const data = await response.json();
    setDepartment(response.ok ? data : null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [params.id]);

  async function manualRun() {
    setRunning(true);
    await fetch(`/api/departments/${params.id}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticket: {
          from: "test@example.com",
          subject: "How do I reset password?",
        },
      }),
    });
    setRunning(false);
    await load();
  }

  async function activate() {
    await fetch(`/api/departments/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    await load();
  }

  if (loading) return <Loading />;
  if (!department) return <div className="p-8 text-sm text-muted-foreground">Department not found.</div>;

  return (
    <DepartmentDetailShell department={department}>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-card/70 p-5">
          <p className="text-sm text-muted-foreground">Workers</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{department.workerAgents?.length || 0}</p>
        </div>
        <div className="rounded-lg border border-border bg-card/70 p-5">
          <p className="text-sm text-muted-foreground">Tasks queued</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{department.totalTasks}</p>
        </div>
        <div className="rounded-lg border border-border bg-card/70 p-5">
          <p className="text-sm text-muted-foreground">Approval mode</p>
          <p className="mt-2 flex items-center gap-2 text-lg font-semibold text-foreground">
            <ShieldCheck className="h-5 w-5 text-orange-300" />
            {department.approvalMode}
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {department.status !== "ACTIVE" ? (
          <Button onClick={activate} className="bg-orange-500 text-white hover:bg-orange-600">
            Activate
          </Button>
        ) : null}
        <Button variant="outline" onClick={manualRun} disabled={running}>
          {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          Test Run
        </Button>
      </div>

      <section className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Recent run logs</h2>
        <RunLogStream logs={(department as { runLogs?: unknown[] }).runLogs || []} />
      </section>
    </DepartmentDetailShell>
  );
}

function Loading() {
  return (
    <div className="flex p-8 text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Loading department
    </div>
  );
}
