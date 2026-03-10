import { Zap, Lock } from "lucide-react";

export default function FlowsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="font-serif text-3xl text-foreground">Flow Engine</h1>
        <p className="mt-2 text-muted-foreground">
          Automatisiere Workflows mit AI-gestützten Automations.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-kiln-green/20 bg-card/50 py-16">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-kiln-green/10">
          <Zap className="h-8 w-8 text-kiln-green" />
        </div>
        <h2 className="mb-2 text-lg font-semibold text-foreground">
          Coming Soon
        </h2>
        <p className="mb-4 max-w-sm text-center text-sm text-muted-foreground">
          Die Flow Engine wird in Phase 3 freigeschaltet. Erstelle AI-Workflows
          per Drag & Drop.
        </p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" />
          Phase 3
        </div>
      </div>
    </div>
  );
}
