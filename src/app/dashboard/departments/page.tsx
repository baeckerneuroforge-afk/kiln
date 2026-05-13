"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { DepartmentCard } from "@/components/departments/department-card";
import { DepartmentEmptyState } from "@/components/departments/department-empty-state";
import type { DepartmentView } from "@/components/departments/types";

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<DepartmentView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/departments")
      .then((response) => response.json())
      .then((data) => setDepartments(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Departments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Autonomous teams with manager loops, worker agents, shared memory, and review gates.
          </p>
        </div>
        <Link
          href="/dashboard/departments/new"
          className={cn(buttonVariants(), "bg-orange-500 text-white hover:bg-orange-600")}
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Department
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading departments
        </div>
      ) : departments.length === 0 ? (
        <DepartmentEmptyState />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {departments.map((department) => (
            <DepartmentCard key={department.id} department={department} />
          ))}
        </div>
      )}
    </div>
  );
}
