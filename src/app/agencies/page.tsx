/**
 * /agencies — stub deep-dive for the agency narrative. Lives off the
 * main landing nav so prospects who clicked "For Agencies" can read
 * the agency-specific pitch separately. Full content + walkthrough
 * comes in Phase B follow-up; for now this surfaces the same hero +
 * solution + features sub-set so the link doesn't 404.
 */
import { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Building2, Shield } from "lucide-react";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingFooter } from "@/components/landing/landing-footer";
import { StarField } from "@/components/landing/star-field";
import { SolutionSection } from "@/components/landing/solution-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { CookieBanner } from "@/components/cookie-banner";

export const metadata: Metadata = {
  title: "For Agencies — KILN",
  description:
    "Why AI consultancies pick KILN — white-label sub-orgs, BYOK, Stripe-Connect billing, multi-channel deployment.",
};

export default function AgenciesPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground antialiased">
      <StarField />
      <div className="relative z-10">
        <LandingNav />

        {/* Hero */}
        <section className="relative pt-32 pb-16 sm:pt-40 sm:pb-24">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(249,115,22,0.12) 0%, transparent 70%)",
            }}
          />
          <div className="mx-auto max-w-4xl px-6 text-center">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-kiln-orange/30 bg-kiln-orange/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-kiln-orange">
              <Building2 className="h-3 w-3" />
              For Agencies
            </p>
            <h1 className="font-serif text-4xl leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              The infrastructure for{" "}
              <span className="text-kiln-orange">AI agencies</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Stop rebuilding for every client. Build once, deploy across your
              client base, charge monthly. KILN is built for agencies that
              want to ship AI as a recurring service — not as a one-off
              project.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
              <Link
                href="/sign-up?plan=agency"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-kiln-orange px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-kiln-orange/20 transition-all hover:bg-kiln-orange/90 sm:w-auto"
              >
                Start Agency Trial
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="mailto:andre@hephaistos-systems.de?subject=KILN%20Agency%20Demo"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Talk to founder
                <ArrowUpRight className="h-3.5 w-3.5" />
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
                GDPR
              </span>
              <span aria-hidden className="text-muted-foreground/40">·</span>
              <span>EU-hosted</span>
            </div>
          </div>
        </section>

        {/* Reuse Solution + Features so this page reads as the agency
            walkthrough without re-implementing the same content twice */}
        <SolutionSection />
        <FeaturesSection />

        <LandingFooter />
        <CookieBanner />
      </div>
    </main>
  );
}
