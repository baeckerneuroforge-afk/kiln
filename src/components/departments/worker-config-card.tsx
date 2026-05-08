import { Bot } from "lucide-react";
import type { DepartmentWorkerView } from "./types";

export function WorkerConfigCard({ worker }: { worker: DepartmentWorkerView }) {
  return (
    <div className="rounded-lg border border-border bg-card/70 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-orange-500/20 bg-orange-500/10">
          <Bot className="h-4 w-4 text-orange-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-foreground">{worker.role}</h3>
            <span className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
              priority {worker.priority}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{worker.description}</p>
          <div className="mt-3 rounded border border-border/70 bg-black/20 p-3">
            <p className="text-sm font-medium text-foreground">{worker.agent.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{worker.agent.llmModel}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
