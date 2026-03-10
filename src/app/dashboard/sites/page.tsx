import { Globe, Lock } from "lucide-react";

export default function SitesPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="font-serif text-3xl text-foreground">Site Builder</h1>
        <p className="mt-2 text-muted-foreground">
          Generiere Websites und Landing Pages per Natural Language.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-kiln-blue/20 bg-card/50 py-16">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-kiln-blue/10">
          <Globe className="h-8 w-8 text-kiln-blue" />
        </div>
        <h2 className="mb-2 text-lg font-semibold text-foreground">
          Coming Soon
        </h2>
        <p className="mb-4 max-w-sm text-center text-sm text-muted-foreground">
          Der Site Builder wird in Phase 2 freigeschaltet. Beschreibe deine
          Website — KILN baut sie.
        </p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" />
          Phase 2
        </div>
      </div>
    </div>
  );
}
