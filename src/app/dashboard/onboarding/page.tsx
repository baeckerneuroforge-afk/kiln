"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OnboardingStartPage() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startWizard() {
    setStarting(true);
    setError(null);
    try {
      const response = await fetch("/api/onboarding/wizard/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry: "dental" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not start wizard");
      router.push(`/dashboard/onboarding/${body.wizardId}/basics`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start wizard");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[640px] max-w-3xl flex-col items-center justify-center px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-kiln-orange/10 text-kiln-orange">
        <Building2 className="h-6 w-6" />
      </div>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight text-foreground">Add Customer</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Create a client workspace with industry departments, worker agents, knowledge base, channels, and branding in one guided flow.
      </p>
      {error && <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      <Button className="mt-6" onClick={startWizard} disabled={starting}>
        {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Start onboarding wizard
      </Button>
    </div>
  );
}
