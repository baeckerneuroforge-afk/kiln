/**
 * KILN landing page — orchestrator.
 *
 * Each section lives in src/components/landing/ as its own file so
 * this stays a thin import + composition layer. The whole landing
 * surface runs in a `landing-light` theme scope — warm off-white bg,
 * stone-100 section variation, near-black headlines. Dashboard +
 * auth-pages stay dark, so the user transitions from "marketing
 * brochure" to "tool" the moment they sign in.
 */
import { Metadata } from "next";
import { CookieBanner } from "@/components/cookie-banner";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingFooter } from "@/components/landing/landing-footer";
import { DotGrid } from "@/components/landing/dot-grid";
import { HeroSection } from "@/components/landing/hero-section";
import { ProblemSection } from "@/components/landing/problem-section";
import { SolutionSection } from "@/components/landing/solution-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { FounderSection } from "@/components/landing/founder-section";
import { PricingSection } from "@/components/landing/pricing-section";
import { FaqSection } from "@/components/landing/faq-section";
import { FinalCtaSection } from "@/components/landing/final-cta-section";

export const metadata: Metadata = {
  title: "KILN — The Agency-First AI Platform",
  description:
    "White-label, multi-tenant AI agent platform built for agencies. Build agents once, deploy for every client, charge recurring. EU-hosted, GDPR compliant.",
  openGraph: {
    title: "KILN — The Agency-First AI Platform",
    description:
      "White-label, multi-tenant AI agent platform built for agencies.",
    type: "website",
  },
};

export default function LandingPage() {
  return (
    <main className="landing-light relative min-h-screen overflow-hidden bg-background text-foreground antialiased">
      <DotGrid />
      <div className="relative z-10">
        <LandingNav />
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <FeaturesSection />
        <FounderSection />
        <PricingSection />
        <FaqSection />
        <FinalCtaSection />
        <LandingFooter />
        <CookieBanner />
      </div>
    </main>
  );
}
