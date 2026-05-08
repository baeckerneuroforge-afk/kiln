import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DepartmentEmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/40 p-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-orange-500/20 bg-orange-500/10">
        <Building2 className="h-6 w-6 text-orange-300" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">No departments yet</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
        Create a customer support department with a manager loop, worker agents, shared memory, and approval-first drafts.
      </p>
      <Link
        href="/dashboard/departments/new"
        className={cn(buttonVariants(), "mt-6 bg-orange-500 text-white hover:bg-orange-600")}
      >
        <Plus className="mr-2 h-4 w-4" />
        Create Department
      </Link>
    </div>
  );
}
