"use client";

/**
 * Founder section — text-only, no stock photos. Adds a dropcap on the
 * first paragraph for visual weight, a stats stripe with the founder
 * facts (solo / no funding / built in public / v1 shipped), a
 * cursive sign-off, and three contact CTAs with hover lifts. The
 * whole section animates in on scroll.
 *
 * Photo intentionally omitted (per spec). This is the founder voice
 * page, not a marketing portrait.
 */
import { ArrowUpRight, Mail, MapPin } from "lucide-react";
import { AnimatedSection } from "./animated-section";

const FOUNDER_EMAIL = "andre@hephaistos-systems.de";
const X_URL = "https://x.com/baeckerneuro";
const LI_URL = "https://www.linkedin.com/in/andrebaecker";

export function FounderSection() {
  return (
    <AnimatedSection
      id="founder"
      aria-label="Why KILN exists"
      className="relative isolate py-20 sm:py-28"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 50% 35% at 50% 50%, rgba(249,115,22,0.05) 0%, transparent 70%)",
        }}
      />

      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Why KILN Exists
          </p>
          <h2 className="mt-3 font-serif text-3xl tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Hi, I&apos;m André. I&apos;m building KILN.
          </h2>
        </div>

        {/* Stats stripe */}
        <div className="mx-auto mt-8 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Solo founder" },
            { label: "0 funding" },
            { label: "Built in public" },
            { label: "v1.0 shipped" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-border bg-card/50 px-3 py-2 text-center text-[11px] text-muted-foreground"
            >
              {s.label}
            </div>
          ))}
        </div>

        {/* Body with dropcap on the first paragraph */}
        <div className="mt-10 space-y-5 text-base leading-relaxed text-muted-foreground">
          <p className="first-letter:float-left first-letter:mr-3 first-letter:text-5xl first-letter:font-serif first-letter:font-bold first-letter:leading-[1] first-letter:text-kiln-orange">
            I&apos;m a 25-year-old founder from Germany. Solo. No co-founder,
            no funding round, no team of engineers. Just me, building
            infrastructure for agencies that want to ship AI.
          </p>
          <p>
            I started Hephaistos Systems after seeing the same pattern at
            every AI agency I talked to: brilliant builders losing money
            because they had no way to charge recurring. They&apos;d ship a
            custom agent for €5,000, take the money, and never see the
            client again.
          </p>
          <p>
            KILN solves that. Build once. Deploy across your client base.
            Charge monthly. Keep the relationship — and the revenue.
          </p>
          <p>
            I&apos;m building this in public. If you&apos;re an agency owner
            who wants to shape where this goes, talk to me directly. I read
            every email, every DM. No SDR will reply on my behalf — it&apos;s
            just me.
          </p>
        </div>

        {/* Cursive sign-off */}
        <div className="mt-10 text-center">
          <div className="font-serif text-2xl italic text-foreground">— André</div>
          <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            André Bäcker, Founder · Hephaistos Systems
            <span aria-hidden className="text-muted-foreground/40">·</span>
            <MapPin className="h-3 w-3" />
            Osnabrück, Germany
          </div>
        </div>

        {/* Contact CTAs */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <a
            href={`mailto:${FOUNDER_EMAIL}?subject=KILN%20Hello`}
            className="group inline-flex items-center gap-2 rounded-xl border border-kiln-orange/40 bg-kiln-orange/10 px-4 py-2.5 text-sm font-medium text-kiln-orange transition-all hover:-translate-y-0.5 hover:border-kiln-orange/60 hover:bg-kiln-orange/15 hover:shadow-lg hover:shadow-kiln-orange/10"
          >
            <Mail className="h-3.5 w-3.5" />
            Email me directly
          </a>
          <a
            href={X_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="group inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:text-foreground"
          >
            Follow on X
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
          <a
            href={LI_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="group inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:text-foreground"
          >
            Connect on LinkedIn
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </div>
      </div>
    </AnimatedSection>
  );
}
