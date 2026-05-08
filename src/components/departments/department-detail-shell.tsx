"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DepartmentStatusBadge } from "./department-status-badge";
import { DepartmentTabs } from "./department-tabs";
import type { DepartmentView } from "./types";

export function DepartmentDetailShell({
  department,
  children,
}: {
  department: DepartmentView;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <Link
        href="/dashboard/departments"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Departments
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">{department.name}</h1>
            <DepartmentStatusBadge status={department.status} />
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {department.description || "Autonomous department"}
          </p>
        </div>
      </div>
      <DepartmentTabs departmentId={department.id} />
      {children}
    </div>
  );
}
