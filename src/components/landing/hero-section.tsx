"use client";

/**
 * Hero — agency-first positioning. One orange word in the headline,
 * primary CTA to free trial, secondary text-link to a founder mailto.
 * Trust row uses muted tokens so the call to action carries the
 * visual weight.
 */
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Shield } from "lucide-react";

export function HeroSection() {
  return (
    <section
      className="relative isolate overflow-hidden pt-32 pb-24 sm:pt-40 sm:pb-32 lg:pt-44 lg:pb-40"
      aria-label="Hero"
    >
      {/* Subtle radial glow so the hero feels lit from above */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 60% 45% at 50% 0%, rgba(249,115,22,0.10) 0%, transparent 70%)",
        }}
      />

      <div className="mx-auto max-w-5xl px-6 text-center">
        <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.24em] text-kiln-orange">
          The Agency-First AI Platform
        </p>
        <h1 className="font-serif text-[40px] leading-[1.05] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
          Build AI Agents Once.
          <br />
          <span className="text-kiln-orange">Deploy</span> for Every Client.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
          KILN is the white-label, multi-tenant AI agent platform built for
          agencies. Manage all your clients from one dashboard. Charge them
          recurring. Brand it as your own.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
          <Link
            href="/sign-up"
            data-testid="hero-cta-primary"
            className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-kiln-orange px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-kiln-orange/20 transition-all hover:bg-kiln-orange/90 hover:shadow-kiln-orange/30 sm:w-auto"
          >
            Start Free
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href="mailto:andre@hephaistos-systems.de?subject=KILN%20Demo%20Request"
            data-testid="hero-cta-secondary"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Or talk to the founder
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
