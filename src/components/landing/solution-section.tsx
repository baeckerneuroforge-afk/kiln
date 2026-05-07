"use client";

/**
 * Solution — three-step horizontal flow (Build → Spin up → Charge)
 * with prominent step numbers and connecting accents. On mobile the
 * flow stacks vertically.
 */
import { ArrowRight } from "lucide-react";

const STEPS = [
  {
    n: "01",
    title: "Build agents in KILN",
    body:
      "Visual editor. Multi-agent workflows. Self-learning RAG. Multi-channel (Voice + WhatsApp + Email + Web). Build the agent your client needs in hours, not weeks.",
  },
  {
    n: "02",
    title: "Spin up sub-orgs for each client",
    body:
      "One click creates a dedicated workspace per client. Full data isolation. Their branding. Custom domain. They log in to “their” platform — not yours.",
  },
  {
    n: "03",
    title: "Charge them recurring",
    body:
      "Stripe-Connect billing built in. You set the price. Client pays you. Anthropic / OpenAI API costs covered by their BYOK. You keep the margin.",
  },
];

export function SolutionSection() {
  return (
    <section
      id="solution"
      aria-label="How it works"
      className="py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-kiln-orange">
            How It Works
          </p>
          <h2 className="mt-3 font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
            Build once. Deploy for every client. Charge recurring.
          </h2>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl gap-6 lg:grid-cols-3 lg:gap-4">
          {STEPS.map((step, idx) => (
            <div key={step.n} className="relative">
              <div className="rounded-2xl border border-border bg-card/40 p-6 h-full">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-kiln-orange/10 px-3 py-1 text-[10px] font-bold tracking-wider text-kiln-orange">
                  STEP {step.n}
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  aria-hidden
                  className="absolute -right-3 top-1/2 hidden -translate-y-1/2 lg:block"
                >
                  <ArrowRight className="h-5 w-5 text-muted-foreground/40" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
