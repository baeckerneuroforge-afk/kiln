"use client";

/**
 * Final CTA — the page's last impression. Mirrors the hero's CTA
 * hierarchy (Start Free primary, founder mailto secondary) so the
 * page closes symmetrically.
 *
 * Stays DARK on purpose — the rest of the landing is light, so this
 * dark band creates a dramatic close-out and sets up a seamless
 * transition into the dark footer + dark auth pages + dark dashboard.
 *
 * Includes a terminal mockup that types out the agency-onboarding
 * flow live. It's the single piece of motion that anchors the section
 * visually and doubles as proof: "yes, this actually works as a CLI".
 */
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Shield } from "lucide-react";
import { TerminalMockup } from "./terminal-mockup";

export function FinalCtaSection() {
  return (
    <section
      aria-label="Final call to action"
      className="relative isolate overflow-hidden bg-stone-900 py-24 sm:py-32"
    >
      {/* Aurora — orange + ember glow on a near-black canvas */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 60% 60% at 50% 50%, rgba(249,115,22,0.18) 0%, rgba(220,38,38,0.06) 35%, transparent 70%)",
        }}
      />
      {/* Subtle dotted-grid backdrop in dark to echo the light DotGrid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      <div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-12 lg:items-center">
        {/* Copy column */}
        <div className="lg:col-span-7 text-center lg:text-left">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-kiln-orange/40 bg-kiln-orange/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-kiln-orange">
            Ready to Ship
          </p>
          <h2 className="font-serif text-3xl tracking-tight text-white sm:text-5xl lg:text-6xl">
            Build your AI agency.{" "}
            <span className="text-kiln-orange">Today.</span>
          </h2>
          <p className="mt-5 text-base text-stone-400 sm:text-lg">
            Free forever for testing. Start charging clients next week.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5 lg:justify-start">
            <Link
              href="/sign-up"
              className="group relative inline-flex items-center justify-center gap-2 rounded-xl bg-kiln-orange px-7 py-4 text-base font-semibold text-white shadow-2xl shadow-kiln-orange/40 transition-all hover:-translate-y-0.5 hover:bg-kiln-orange/95 hover:shadow-kiln-orange/60 kiln-final-cta-pulse"
            >
              <span className="relative">Start Free</span>
              <ArrowRight className="relative h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="mailto:andre@hephaistos-systems.de?subject=KILN%20Demo%20Request"
              className="group inline-flex items-center gap-1.5 text-sm font-medium text-stone-300 transition-colors hover:text-white"
            >
              Talk to founder
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-stone-400 lg:justify-start">
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
    </section>
  );
}

function Dot() {
  return <span aria-hidden className="text-stone-600">·</span>;
}
