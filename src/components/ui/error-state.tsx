"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

export function ErrorState({
  message = "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
  onRetry,
  className,
  compact = false,
}: ErrorStateProps) {
  if (compact) {
    return (
      <div className={cn("flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2", className)}>
        <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
        <p className="text-xs text-red-300 flex-1">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-xs text-red-400 hover:text-red-300 font-medium flex items-center gap-1 shrink-0"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20 mb-4">
        <AlertTriangle className="h-6 w-6 text-red-400" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">Fehler aufgetreten</h3>
      <p className="text-xs text-muted-foreground max-w-sm mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 rounded-lg bg-muted border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted/70 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Erneut versuchen
        </button>
      )}
    </div>
  );
}
