"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DepartmentDetailShell } from "@/components/departments/department-detail-shell";
import { BacklogQueue } from "@/components/departments/backlog-queue";
import type { BacklogItemView, DepartmentView } from "@/components/departments/types";

export default function DepartmentBacklogPage() {
  const params = useParams<{ id: string }>();
  const [department, setDepartment] = useState<DepartmentView | null>(null);
  const [items, setItems] = useState<BacklogItemView[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/departments/${params.id}`).then((response) => response.json()),
      fetch(`/api/departments/${params.id}/backlog`).then((response) => response.json()),
    ]).then(([departmentData, itemsData]) => {
      setDepartment(departmentData);
      setItems(Array.isArray(itemsData) ? itemsData : []);
    });
  }, [params.id]);

  if (!department) return <div className="p-8 text-sm text-muted-foreground">Loading backlog</div>;

  return (
    <DepartmentDetailShell department={department}>
      <BacklogQueue items={items} />
    </DepartmentDetailShell>
  );
}
