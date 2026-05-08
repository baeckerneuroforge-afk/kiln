"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DepartmentDetailShell } from "@/components/departments/department-detail-shell";
import { MemoryViewer } from "@/components/departments/memory-viewer";
import type { DepartmentView } from "@/components/departments/types";

export default function DepartmentMemoryPage() {
  const params = useParams<{ id: string }>();
  const [department, setDepartment] = useState<DepartmentView | null>(null);
  const [memory, setMemory] = useState<unknown>({});

  useEffect(() => {
    Promise.all([
      fetch(`/api/departments/${params.id}`).then((response) => response.json()),
      fetch(`/api/departments/${params.id}/memory`).then((response) => response.json()),
    ]).then(([departmentData, memoryData]) => {
      setDepartment(departmentData);
      setMemory(memoryData);
    });
  }, [params.id]);

  if (!department) return <div className="p-8 text-sm text-muted-foreground">Loading memory</div>;

  return (
    <DepartmentDetailShell department={department}>
      <MemoryViewer memory={memory} />
    </DepartmentDetailShell>
  );
}
