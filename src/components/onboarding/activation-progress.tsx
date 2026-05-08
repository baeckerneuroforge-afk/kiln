"use client";

import { Loader2 } from "lucide-react";

export function ActivationProgress({
  open,
  label,
  done,
}: {
  open: boolean;
  label: string;
  done: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          {!done && <Loader2 className="h-5 w-5 animate-spin text-kiln-orange" />}
          <div>
            <h2 className="font-semibold text-foreground">{done ? "Customer activated" : "Activating customer"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{label}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
