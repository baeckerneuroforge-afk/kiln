import Link from "next/link";
import { ArrowRight, Bot, CheckCircle2, Clock } from "lucide-react";
import { DepartmentStatusBadge } from "./department-status-badge";
import type { DepartmentView } from "./types";

export function DepartmentCard({ department }: { department: DepartmentView }) {
  return (
    <Link
      href={`/dashboard/departments/${department.id}`}
      className="group block rounded-lg border border-border bg-card/80 p-5 transition hover:border-orange-500/40 hover:shadow-[0_0_24px_rgba(249,115,22,0.08)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground">{department.name}</h3>
            <DepartmentStatusBadge status={department.status} />
          </div>
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
            {department.description || "Custom autonomous department"}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-orange-300" />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Bot className="h-3.5 w-3.5" />
          {department.workerAgents?.length || 0} workers
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {department.totalTasks} tasks
        </span>
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {department.totalApprovals} approvals
        </span>
      </div>
    </Link>
  );
}
