import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DepartmentTemplatePicker } from "@/components/departments/department-template-picker";

export default function NewDepartmentPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href="/dashboard/departments"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Departments
      </Link>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Create Department</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Start from a focused template, then customize workers and operating memory.
        </p>
      </div>
      <DepartmentTemplatePicker />
    </div>
  );
}
