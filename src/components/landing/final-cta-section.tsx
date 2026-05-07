"use client";

/**
 * Final CTA — the page's last impression. Mirrors the hero's CTA
 * hierarchy (Start Free primary, founder mailto secondary) so the
 * page closes symmetrically.
 *
 * Includes a terminal mockup that types out the agency-onboarding
 * flow live ("create sub-org → clone agent → set pricing"). It's
 * the single piece of motion that anchors the section visually and
 * doubles as proof: "yes, this actually works as a CLI".
 */
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Shield } from "lucide-react";
import { AnimatedSection } from "./animated-section";
import { TerminalMockup } from "./terminal-mockup";

export function FinalCtaSection() {
  return (
    <AnimatedSection
      aria-label="Final call to action"
      className="relative isolate overflow-hidden border-y border-kiln-orange/20 bg-gradient-to-b from-card/40 to-background py-24 sm:py-32"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 60% 60% at 50% 50%, rgba(249,115,22,0.18) 0%, rgba(220,38,38,0.05) 35%, transparent 70%)",
        }}
      />

      <div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-12 lg:items-center">
        {/* Copy column */}
        <div className="lg:col-span-7 text-center lg:text-left">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-kiln-orange/30 bg-kiln-orange/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-kiln-orange">
            Ready to Ship
          </p>
          <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Build your AI agency.{" "}
            <span className="text-kiln-orange">Today.</span>
          </h2>
          <p className="mt-5 text-base text-muted-foreground sm:text-lg">
            Free forever for testing. Start charging clients next week.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5 lg:justify-start">
            <Link
              href="/sign-up"
              className="group relative inline-flex items-center justify-center gap-2 rounded-xl bg-kiln-orange px-7 py-4 text-base font-semibold text-white shadow-xl shadow-kiln-orange/30 transition-all hover:bg-kiln-orange/90 hover:shadow-kiln-orange/50 kiln-final-cta-pulse"
            >
              <span className="relative">Start Free</span>
              <ArrowRight className="relative h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="mailto:andre@hephaistos-systems.de?subject=KILN%20Demo%20Request"
              className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Talk to founder
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground lg:justify-start">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden>🇪🇺</span>
              Built in Germany
            </span>
            <Dot />
            <span className="inline-flex items-center gap-1.5">
              <Shield className="h-3 w-3" />
              GDPR
            </span>
            <Dot />
            <span>EU-hosted</span>
            <Dot />
            <span>No credit card required</span>
          </div>
        </div>

        {/* Terminal column */}
        <div className="hidden lg:col-span-5 lg:block">
          <TerminalMockup />
        </div>
      </div>

      <style jsx>{`
        @keyframes kiln-cta-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(249,115,22,0.6), 0 12px 32px -8px rgba(249,115,22,0.4); }
          50% { box-shadow: 0 0 0 10px rgba(249,115,22,0), 0 12px 32px -8px rgba(249,115,22,0.5); }
        }
        :global(.kiln-final-cta-pulse) {
          animation: kiln-cta-pulse 3s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          :global(.kiln-final-cta-pulse) { animation: none; }
        }
      `}</style>
    </AnimatedSection>
  );
}

function Dot() {
  return <span aria-hidden className="text-muted-foreground/40">·</span>;
}
