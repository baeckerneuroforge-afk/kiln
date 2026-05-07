"use client";

/**
 * Problem — three pain points specific to AI agencies. The cards use
 * muted backgrounds so the next section (Solution) reads as the
 * payoff visually.
 */
import { RotateCcw, TrendingDown, UserX } from "lucide-react";

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
    <section
      id="problem"
      aria-label="The problem"
      className="border-y border-border/40 bg-card/30 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            The Agency Problem
          </p>
          <h2 className="mt-3 font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
            AI consultancies hit the same wall
          </h2>
        </div>
        <div className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-3">
          {PROBLEMS.map((p) => (
            <div
              key={p.title}
              className="group rounded-2xl border border-border bg-card p-6 transition-colors hover:border-foreground/20"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
                <p.icon className="h-5 w-5 text-red-400" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                {p.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
