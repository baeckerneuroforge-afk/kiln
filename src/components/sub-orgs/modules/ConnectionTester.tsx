"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, Loader2, PlayCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConnectionTesterProps {
  /** Called when the user clicks "Test". Should return ok + message. */
  onTest: () => Promise<{ ok: boolean; message?: string }>;
  disabled?: boolean;
}

/**
 * Inline button that triggers an API connection test and renders the
 * latest result (success / failure / message). Stateless beyond the
 * last test outcome — does not persist anything.
 */
export function ConnectionTester({ onTest, disabled }: ConnectionTesterProps) {
  const [state, setState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const handleTest = useCallback(async () => {
    setState("testing");
    setMessage(null);
    try {
      const result = await onTest();
      setState(result.ok ? "ok" : "fail");
      setMessage(result.message ?? null);
    } catch (err) {
      setState("fail");
      setMessage(err instanceof Error ? err.message : "Unbekannter Fehler");
    }
  }, [onTest]);

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={handleTest} disabled={disabled || state === "testing"}>
        {state === "testing" ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <PlayCircle className="mr-2 h-4 w-4" />
        )}
        Connection testen
      </Button>
      {state === "ok" ? (
        <span className="flex items-center gap-1 text-xs text-green-600">
          <CheckCircle2 className="h-4 w-4" /> {message ?? "Verbunden"}
        </span>
      ) : null}
      {state === "fail" ? (
        <span className={cn("flex items-center gap-1 text-xs text-destructive")}>
          <XCircle className="h-4 w-4" /> {message ?? "Verbindung fehlgeschlagen"}
        </span>
      ) : null}
    </div>
  );
}
