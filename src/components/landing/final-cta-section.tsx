"use client";

/**
 * Final CTA — mirrors the hero's CTA hierarchy so the page reads
 * symmetrically (Free Trial primary, founder mailto secondary). The
 * trust row repeats the EU/GDPR claims one last time before the
 * footer.
 */
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Shield } from "lucide-react";

export function FinalCtaSection() {
  return (
    <section
      aria-label="Final call to action"
      className="relative isolate overflow-hidden border-y border-kiln-orange/20 bg-gradient-to-b from-card/40 to-background py-24 sm:py-32"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 50% 60% at 50% 50%, rgba(249,115,22,0.10) 0%, transparent 70%)",
        }}
      />
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-5xl">
          Ready to build your AI agency?
        </h2>
        <p className="mt-4 text-base text-muted-foreground sm:text-lg">
          Free forever for testing. Start charging your first client by next
          week.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
          <Link
            href="/sign-up"
            className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-kiln-orange px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-kiln-orange/20 transition-all hover:bg-kiln-orange/90 hover:shadow-kiln-orange/30 sm:w-auto"
          >
            Start Free
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href="mailto:andre@hephaistos-systems.de?subject=KILN%20Demo%20Request"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Talk to founder
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden>🇪🇺</span>
            Built in Germany
          </span>
          <span aria-hidden className="text-muted-foreground/40">·</span>
          <span className="inline-flex items-center gap-1.5">
            <Shield className="h-3 w-3" />
            GDPR compliant
          </span>
          <span aria-hidden className="text-muted-foreground/40">·</span>
          <span>EU-hosted</span>
          <span aria-hidden className="text-muted-foreground/40">·</span>
          <span>No credit card required</span>
        </div>
      </div>
    </section>
  );
}
