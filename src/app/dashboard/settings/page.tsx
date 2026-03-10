export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="font-serif text-3xl text-foreground">Einstellungen</h1>
        <p className="mt-2 text-muted-foreground">
          Verwalte dein Konto und deine Abonnements.
        </p>
      </div>

      <div className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Plan</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Free</p>
              <p className="text-sm text-muted-foreground">
                1 Agent, 100 Gespräche/Monat
              </p>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              Aktueller Plan
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
