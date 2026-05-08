import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function DepartmentStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-border text-xs",
        status === "ACTIVE" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
        status === "DRAFT" && "border-amber-500/40 bg-amber-500/10 text-amber-300",
        status === "PAUSED" && "border-slate-500/40 bg-slate-500/10 text-slate-300",
        status === "ARCHIVED" && "border-zinc-500/40 bg-zinc-500/10 text-zinc-400"
      )}
    >
      {status}
    </Badge>
  );
}
