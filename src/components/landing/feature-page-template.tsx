/**
 * Shared template for /features/[slug] sub-pages.
 *
 * Each sub-page passes copy + an optional preview block; the
 * template provides the rest of the layout (hero, how-it-works,
 * use cases, technical bullets, final CTA) so the six sub-pages
 * stay visually consistent without duplicating layout code.
 */
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Shield,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingFooter } from "@/components/landing/landing-footer";
import { StarField } from "@/components/landing/star-field";
import { CookieBanner } from "@/components/cookie-banner";

export interface FeaturePageProps {
  /** Pre-headline pill content (e.g. "FEATURE · MULTI-AGENT WORKFLOWS") */
  prePill: string;
  icon: LucideIcon;
  /** Big H1, ~6-12 words; one orange word in the middle works well */
  headline: React.ReactNode;
  /** 1-2 sentence elevator pitch */
  subhead: string;
  /** "What it does" body — 3-4 paragraphs */
  whatBody: React.ReactNode;
  /** Three "How it works" steps with one-liner descriptions */
  howSteps: { title: string; body: string }[];
  /** Three concrete use-case cards */
  useCases: { title: string; body: string }[];
  /** Bulleted technical details */
  techBullets: string[];
  /** Optional rich mockup rendered next to the hero */
  preview?: React.ReactNode;
}

export function FeaturePageTemplate({
  prePill,
  icon: Icon,
  headline,
  subhead,
  whatBody,
  howSteps,
  useCases,
  techBullets,
  preview,
}: FeaturePageProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground antialiased">
      <StarField />
      <div className="relative z-10">
        <LandingNav />

        {/* Hero */}
        <section className="relative pt-32 pb-16 sm:pt-40 sm:pb-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(ellipse 65% 50% at 50% 0%, rgba(249,115,22,0.10) 0%, transparent 70%)",
            }}
          />
          <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-kiln-orange/30 bg-kiln-orange/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-kiln-orange">
                <Icon className="h-3 w-3" />
                {prePill}
              </p>
              <h1 className="font-serif text-4xl leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                {headline}
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                {subhead}
              </p>
              <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5">
                <Link
                  href="/sign-up"
                  className="inline-flex items-center gap-2 rounded-xl bg-kiln-orange px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-kiln-orange/20 transition-all hover:bg-kiln-orange/90"
                >
                  Start Free
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="mailto:andre@hephaistos-systems.de?subject=KILN%20Demo%20Request"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Talk to founder
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
            {preview && (
              <div className="lg:col-span-5">
                <div className="rounded-2xl border border-border bg-card/40 p-5 shadow-2xl shadow-black/40">
                  {preview}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* What it does */}
        <section className="border-t border-border/40 bg-card/20 py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-6">
            <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
              What it does
            </h2>
            <div className="mt-6 space-y-5 text-base leading-relaxed text-muted-foreground">
              {whatBody}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-border/40 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-kiln-orange">
                How It Works
              </p>
              <h2 className="mt-3 font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
                Three moving parts
              </h2>
            </div>
            <div className="mx-auto mt-12 grid max-w-5xl gap-5 lg:grid-cols-3">
              {howSteps.map((step, i) => (
                <div
                  key={step.title}
                  className="rounded-2xl border border-border bg-card/40 p-6"
                >
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-kiln-orange/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-kiln-orange">
                    Step 0{i + 1}
                  </div>
                  <h3 className="text-base font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Use cases */}
        <section className="border-t border-border/40 bg-card/20 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Use Cases
              </p>
              <h2 className="mt-3 font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
                What agencies actually build with this
              </h2>
            </div>
            <div className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-3">
              {useCases.map((u) => (
                <div
                  key={u.title}
                  className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-foreground/20"
                >
                  <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-kiln-orange/10">
                    <Sparkles className="h-4 w-4 text-kiln-orange" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {u.title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {u.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Technical details */}
        <section className="border-t border-border/40 py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-6">
            <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
              Technical details
            </h2>
            <ul className="mt-6 space-y-3">
              {techBullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-kiln-green" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative isolate overflow-hidden border-y border-kiln-orange/20 bg-gradient-to-b from-card/40 to-background py-20 sm:py-28">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(ellipse 50% 60% at 50% 50%, rgba(249,115,22,0.10) 0%, transparent 70%)",
            }}
          />
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
              Ready to build with this?
            </h2>
            <p className="mt-4 text-base text-muted-foreground">
              Free forever for testing. Start charging your first client by
              next week.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5">
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 rounded-xl bg-kiln-orange px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-kiln-orange/20 transition-all hover:bg-kiln-orange/90"
              >
                Start Free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="mailto:andre@hephaistos-systems.de?subject=KILN%20Demo%20Request"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Talk to founder
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
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

        <LandingFooter />
        <CookieBanner />
      </div>
    </main>
  );
}
