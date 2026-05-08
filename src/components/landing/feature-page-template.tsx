/**
 * Shared template for /features/[slug] sub-pages.
 *
 * Each sub-page passes copy + an optional preview block; the
 * template provides the rest of the layout (hero, how-it-works,
 * use cases, technical bullets, final CTA) so the six sub-pages
 * stay visually consistent without duplicating layout code.
 *
 * Light theme — same warm cream + stone palette as the main landing.
 * The closing CTA mirrors the main landing's dark Final-CTA so the
 * page closes with the same "drop into the dashboard" feel.
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
import { DotGrid } from "@/components/landing/dot-grid";
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
    <main className="landing-light relative min-h-screen overflow-hidden bg-background text-foreground antialiased">
      <DotGrid />
      <div className="relative z-10">
        <LandingNav />

        {/* Hero */}
        <section className="relative pt-32 pb-16 sm:pt-40 sm:pb-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(ellipse 65% 50% at 50% 0%, rgba(254,215,170,0.5) 0%, transparent 70%)",
            }}
          />
          <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-kiln-orange/40 bg-kiln-orange/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-kiln-orange">
                <Icon className="h-3 w-3" />
                {prePill}
              </p>
              <h1 className="font-serif text-4xl leading-[1.05] tracking-tight text-stone-900 sm:text-5xl lg:text-6xl">
                {headline}
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-stone-600 sm:text-lg">
                {subhead}
              </p>
              <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5">
                <Link
                  href="/sign-up"
                  className="inline-flex items-center gap-2 rounded-xl bg-kiln-orange px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-kiln-orange/30 transition-all hover:-translate-y-0.5 hover:bg-kiln-orange/95 hover:shadow-xl hover:shadow-kiln-orange/40"
                >
                  Start Free
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="mailto:andre@hephaistos-systems.de?subject=KILN%20Demo%20Request"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 transition-colors hover:text-kiln-orange"
                >
                  Talk to founder
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
            {preview && (
              <div className="lg:col-span-5">
                <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl shadow-stone-900/5">
                  {preview}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* What it does */}
        <section className="border-t border-stone-200 bg-stone-50 py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-6">
            <h2 className="font-serif text-3xl tracking-tight text-stone-900 sm:text-4xl">
              What it does
            </h2>
            <div className="mt-6 space-y-5 text-base leading-relaxed text-stone-700">
              {whatBody}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-stone-200 bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-kiln-orange">
                How It Works
              </p>
              <h2 className="mt-3 font-serif text-3xl tracking-tight text-stone-900 sm:text-4xl">
                Three moving parts
              </h2>
            </div>
            <div className="mx-auto mt-12 grid max-w-5xl gap-5 lg:grid-cols-3">
              {howSteps.map((step, i) => (
                <div
                  key={step.title}
                  className="rounded-2xl border border-stone-200 bg-stone-50 p-6 transition-all hover:-translate-y-0.5 hover:border-kiln-orange/30 hover:bg-white hover:shadow-md hover:shadow-kiln-orange/10"
                >
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-kiln-orange/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-kiln-orange">
                    Step 0{i + 1}
                  </div>
                  <h3 className="text-base font-semibold text-stone-900">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Use cases */}
        <section className="border-t border-stone-200 bg-stone-50 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-500">
                Use Cases
              </p>
              <h2 className="mt-3 font-serif text-3xl tracking-tight text-stone-900 sm:text-4xl">
                What agencies actually build with this
              </h2>
            </div>
            <div className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-3">
              {useCases.map((u) => (
                <div
                  key={u.title}
                  className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-kiln-orange/40 hover:shadow-md hover:shadow-kiln-orange/10"
                >
                  <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-kiln-orange/10">
                    <Sparkles className="h-4 w-4 text-kiln-orange" />
                  </div>
                  <h3 className="text-sm font-semibold text-stone-900">
                    {u.title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-stone-600">
                    {u.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Technical details */}
        <section className="border-t border-stone-200 bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-6">
            <h2 className="font-serif text-3xl tracking-tight text-stone-900 sm:text-4xl">
              Technical details
            </h2>
            <ul className="mt-6 space-y-3">
              {techBullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-stone-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Final CTA — dark for visual finish, mirrors main landing */}
        <section className="relative isolate overflow-hidden bg-stone-900 py-20 sm:py-28">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(ellipse 50% 60% at 50% 50%, rgba(249,115,22,0.18) 0%, rgba(220,38,38,0.05) 35%, transparent 70%)",
            }}
          />
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="font-serif text-3xl tracking-tight text-white sm:text-4xl">
              Ready to build with this?
            </h2>
            <p className="mt-4 text-base text-stone-400">
              Free forever for testing. Start charging your first client by
              next week.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5">
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 rounded-xl bg-kiln-orange px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-kiln-orange/40 transition-all hover:-translate-y-0.5 hover:bg-kiln-orange/95 hover:shadow-xl"
              >
                Start Free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="mailto:andre@hephaistos-systems.de?subject=KILN%20Demo%20Request"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-300 transition-colors hover:text-white"
              >
                Talk to founder
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-stone-400">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden>🇪🇺</span>
                Built in Germany
              </span>
              <span aria-hidden className="text-stone-600">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Shield className="h-3 w-3" />
                GDPR
              </span>
              <span aria-hidden className="text-stone-600">·</span>
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
