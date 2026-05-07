"use client";

/**
 * Problem — three pain points specific to AI agencies. The cards use
 * muted backgrounds so the next section (Solution) reads as the
 * payoff visually.
 */
import { RotateCcw, TrendingDown, UserX } from "lucide-react";
import { AnimatedSection } from "./animated-section";

const PROBLEMS = [
  {
    icon: RotateCcw,
    title: "Building from scratch every time",
    body:
      "Every new client means rebuilding the same agent infrastructure. Workflows, integrations, knowledge bases — repeat for each project.",
  },
  {
    icon: TrendingDown,
    title: "No way to charge recurring",
    body:
      "You ship the agent, get paid once, and lose the client. No SaaS-style monthly revenue. No compound growth.",
  },
  {
    icon: UserX,
    title: "Can't scale beyond 5 clients",
    body:
      "Managing infrastructure across multiple clients without consolidation makes scaling impossible. Hidden cost: your time.",
  },
];

export function ProblemSection() {
  return (
    <AnimatedSection
      id="problem"
      aria-label="The problem"
      className="relative isolate border-y border-border/40 bg-card/30 py-20 sm:py-28"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 70% 40% at 50% 0%, rgba(220,38,38,0.04) 0%, transparent 70%)",
        }}
      />
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-red-400/80">
            The Agency Problem
          </p>
          <h2 className="mt-3 font-serif text-3xl tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            AI consultancies hit the same wall
          </h2>
        </div>
        <div className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-3">
          {PROBLEMS.map((p, idx) => (
            <div
              key={p.title}
              style={{ animationDelay: `${idx * 100}ms` }}
              className="kiln-problem-card group rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-red-500/40 hover:bg-card/80 hover:shadow-xl hover:shadow-red-500/5"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/10 transition-colors group-hover:bg-red-500/15">
                <p.icon className="h-5 w-5 text-red-400" />
              </div>
              <h3 className="text-base font-semibold text-foreground sm:text-lg">
                {p.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes kiln-problem-fade-in {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        :global(.kiln-problem-card) {
          animation: kiln-problem-fade-in 600ms ease-out both;
        }
        @media (prefers-reduced-motion: reduce) {
          :global(.kiln-problem-card) { animation: none !important; }
        }
      `}</style>
    </AnimatedSection>
  );
}
