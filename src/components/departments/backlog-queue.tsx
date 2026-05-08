import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import type { BacklogItemView } from "./types";

const statusIcon = {
  PENDING: Clock,
  CLAIMED: Loader2,
  RUNNING: Loader2,
  NEEDS_APPROVAL: AlertCircle,
  DONE: CheckCircle2,
  FAILED: AlertCircle,
} as const;

export function BacklogQueue({ items }: { items: BacklogItemView[] }) {
  if (items.length === 0) {
    return <div className="rounded-lg border border-border bg-card/50 p-6 text-sm text-muted-foreground">No backlog items.</div>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const Icon = statusIcon[item.status as keyof typeof statusIcon] || Clock;
        return (
          <div key={item.id} className="rounded-lg border border-border bg-card/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Icon className="h-4 w-4 text-orange-300" />
                {item.triggerType}
              </div>
              <span className="rounded border border-border px-2 py-1 text-xs text-muted-foreground">
                {item.status}
              </span>
            </div>
            <pre className="mt-3 max-h-40 overflow-auto rounded border border-border/70 bg-black/20 p-3 text-xs text-slate-300">
              {JSON.stringify(item.triggerPayload, null, 2)}
            </pre>
            {item.error ? <p className="mt-3 text-xs text-red-300">{item.error}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
