"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Client-side button that POSTs to the existing checkout endpoint and
 * redirects to the Stripe-hosted checkout URL. Lives next to the
 * server-rendered onboarding page so the page itself can stay fully
 * server-component.
 */
export function OnboardingActivateButton({
  relationshipId,
  accent,
}: {
  relationshipId: string;
  accent: string;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function activate() {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/onboarding/${relationshipId}/checkout`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Checkout failed");
      if (typeof body.url !== "string") {
        throw new Error("Stripe did not return a checkout URL");
      }
      window.location.href = body.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setWorking(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={activate}
        disabled={working}
        style={{ backgroundColor: accent }}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {working && <Loader2 className="h-4 w-4 animate-spin" />}
        {working ? "Redirecting to Stripe…" : "Activate subscription →"}
      </button>
      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
