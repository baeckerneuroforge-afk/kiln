"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StepProgress } from "@/components/onboarding/step-progress";

export function WizardShell({
  wizardId,
  step,
  title,
  description,
  children,
}: {
  wizardId: string;
  step: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <Link href="/dashboard/operations" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Operations
      </Link>
      <div className="rounded-lg border border-border bg-card p-5">
        <StepProgress currentStep={step} />
      </div>
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-kiln-orange">Customer Onboarding</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <p className="mt-2 font-mono text-xs text-muted-foreground">Wizard {wizardId}</p>
      </header>
      {children}
    </div>
  );
}
