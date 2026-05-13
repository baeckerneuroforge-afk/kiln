"use client";

/**
 * Sprint 19.7.6 — common wrapper for the 3-step onboarding wizard.
 *
 * Renders the progress indicator + the "Next" / "Skip for now" /
 * "Finish" buttons; the step's actual content slots in as children.
 *
 * The shell owns the network calls so each step's page can stay a
 * pure server component returning JSX.
 */
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3;

export function OnboardingShell({
  subOrgId,
  step,
  title,
  description,
  children,
  nextHref,
  completeOnNext,
}: {
  subOrgId: string;
  step: Step;
  title: string;
  description: string;
  children: React.ReactNode;
  /** Where the Next button navigates after the API confirms the step. */
  nextHref: string;
  /** Step 3 calls completed=true instead of step=N. */
  completeOnNext?: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/sub-orgs/${subOrgId}/onboarding`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `Request failed (${res.status})`);
    }
  }

  async function handleNext() {
    setSubmitting(true);
    try {
      if (completeOnNext) {
        await send({ completed: true });
      } else {
        await send({ step });
      }
      router.push(nextHref);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Netzwerkfehler");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSkip() {
    setSkipping(true);
    try {
      await send({ skip: true });
      router.push(`/dashboard/sub-org/${subOrgId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Netzwerkfehler");
    } finally {
      setSkipping(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl py-10" data-testid={`onboarding-shell-step-${step}`}>
      <ProgressIndicator step={step} subOrgId={subOrgId} />

      <header className="mt-8 mb-6">
        <h1 className="font-serif text-3xl text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </header>

      <div className="rounded-xl border border-border bg-card/40 p-6">{children}</div>

      {error && (
        <p
          className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          data-testid="onboarding-shell-error"
        >
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleSkip}
          disabled={skipping || submitting}
          className={cn(buttonVariants({ variant: "ghost" }), "text-muted-foreground")}
          data-testid="onboarding-shell-skip"
        >
          {skipping && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          Später erinnern
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={submitting || skipping}
          className={cn(buttonVariants({ variant: "default" }))}
          data-testid="onboarding-shell-next"
        >
          {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {completeOnNext ? "Fertig" : "Weiter"}
        </button>
      </div>
    </div>
  );
}

function ProgressIndicator({ step, subOrgId }: { step: Step; subOrgId: string }) {
  const base = `/dashboard/sub-org/${subOrgId}/onboarding`;
  const steps = [
    { n: 1 as const, label: "Profil", href: `${base}/step-1` },
    { n: 2 as const, label: "Integrationen", href: `${base}/step-2` },
    { n: 3 as const, label: "Erster Test", href: `${base}/step-3` },
  ];

  return (
    <div
      className="flex items-center gap-2"
      role="progressbar"
      aria-valuenow={step}
      aria-valuemin={1}
      aria-valuemax={3}
      data-testid="onboarding-progress"
    >
      {steps.map((s, idx) => {
        const isComplete = step > s.n;
        const isActive = step === s.n;
        return (
          <div key={s.n} className="flex flex-1 items-center gap-2">
            <Link
              href={s.href}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                isComplete
                  ? "bg-kiln-orange/20 text-kiln-orange"
                  : isActive
                    ? "bg-kiln-orange text-white"
                    : "bg-muted text-muted-foreground",
              )}
              aria-label={`Schritt ${s.n}: ${s.label}`}
              data-testid={`onboarding-progress-step-${s.n}`}
            >
              {isComplete ? <Check className="h-3.5 w-3.5" /> : s.n}
            </Link>
            <span
              className={cn(
                "text-xs",
                isActive ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
            {idx < steps.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "h-px flex-1 transition-colors",
                  isComplete ? "bg-kiln-orange/40" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
