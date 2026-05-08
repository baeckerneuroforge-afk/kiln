"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DepartmentDetailShell } from "@/components/departments/department-detail-shell";
import { ApprovalQueue } from "@/components/departments/approval-queue";
import type { BacklogItemView, DepartmentView } from "@/components/departments/types";

export default function DepartmentApprovalsPage() {
  const params = useParams<{ id: string }>();
  const [department, setDepartment] = useState<DepartmentView | null>(null);
  const [items, setItems] = useState<BacklogItemView[]>([]);

  async function load() {
    const [departmentResponse, backlogResponse] = await Promise.all([
      fetch(`/api/departments/${params.id}`),
      fetch(`/api/departments/${params.id}/backlog`),
    ]);
    const departmentData = await departmentResponse.json();
    const backlogData = await backlogResponse.json();
    setDepartment(departmentData);
    setItems(
      Array.isArray(backlogData)
        ? backlogData.filter((item: BacklogItemView) => item.status === "NEEDS_APPROVAL")
        : []
    );
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [params.id]);

  if (!department) return <div className="p-8 text-sm text-muted-foreground">Loading approvals</div>;

  return (
    <DepartmentDetailShell department={department}>
      <ApprovalQueue departmentId={department.id} items={items} onChanged={load} />
    </DepartmentDetailShell>
  );
}
