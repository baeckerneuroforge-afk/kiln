import type { RunLogView } from "./types";

export function RunLogStream({ logs }: { logs: RunLogView[] }) {
  if (logs.length === 0) {
    return <div className="rounded-lg border border-border bg-card/50 p-6 text-sm text-muted-foreground">No run logs yet.</div>;
  }

  return (
    <div className="space-y-3">
      {logs.map((log) => (
        <div key={log.id} className="rounded-lg border border-border bg-card/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="font-medium text-foreground">{log.invocationType}</span>
            <span className="text-xs text-muted-foreground">
              {log.durationMs}ms · {log.tokensUsed} tokens
            </span>
          </div>
          <pre className="mt-3 max-h-44 overflow-auto rounded border border-border/70 bg-black/20 p-3 text-xs text-slate-300">
            {JSON.stringify(log.managerDecision, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}
