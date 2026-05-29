"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Catch-all Error-Boundary für alle Dashboard-Routen, die keine eigene
 * error.tsx haben. Fängt Render-Fehler (auch in Client-Components) ab und
 * meldet sie an Sentry, statt einen weißen Bildschirm zu zeigen.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <AlertTriangle className="h-6 w-6 text-red-500" />
      </div>
      <h2 className="mb-2 text-lg font-semibold text-foreground">
        Etwas ist schiefgelaufen
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">
        {error.message ||
          "Beim Laden dieser Seite ist ein unerwarteter Fehler aufgetreten."}
      </p>
      <div className="flex gap-3">
        <Button onClick={reset} variant="outline" size="sm">
          Erneut versuchen
        </Button>
        <Button onClick={() => (window.location.href = "/dashboard")} size="sm">
          Zum Dashboard
        </Button>
      </div>
    </div>
  );
}
