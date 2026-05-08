"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DepartmentDetailShell } from "@/components/departments/department-detail-shell";
import { WorkerConfigCard } from "@/components/departments/worker-config-card";
import type { DepartmentView } from "@/components/departments/types";

export default function DepartmentWorkersPage() {
  const params = useParams<{ id: string }>();
  const [department, setDepartment] = useState<DepartmentView | null>(null);

  useEffect(() => {
    fetch(`/api/departments/${params.id}`)
      .then((response) => response.json())
      .then(setDepartment);
  }, [params.id]);

  if (!department) return <div className="p-8 text-sm text-muted-foreground">Loading workers</div>;

  return (
    <DepartmentDetailShell department={department}>
      <div className="grid gap-4 md:grid-cols-2">
        {(department.workerAgents || []).map((worker) => (
          <WorkerConfigCard key={worker.id} worker={worker} />
        ))}
      </div>
    </DepartmentDetailShell>
  );
}
