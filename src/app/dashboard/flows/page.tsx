import { Zap, CalendarClock } from "lucide-react";

export default function FlowsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-center gap-3">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Flow Engine</h1>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          Coming Q4 2026
        </span>
      </div>
      <p className="-mt-6 mb-8 text-muted-foreground">
        Automate workflows with AI-powered automations.
      </p>

      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-kiln-green/20 bg-card/50 py-16">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <Zap className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="mb-2 text-lg font-semibold text-foreground">
          Coming Q4 2026
        </h2>
        <p className="mb-4 max-w-sm text-center text-sm text-muted-foreground">
          Connect CRM, email, calendar, and 100+ tools. Create AI workflows with a visual drag & drop builder.
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" />
          Expected October – December 2026
        </div>
      </div>
    </div>
  );
}
