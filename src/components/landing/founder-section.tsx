"use client";

/**
 * Founder section — text-only, no stock photos. Pure founder voice
 * with three direct-contact CTAs (mailto + X + LinkedIn). The X /
 * LinkedIn URLs are placeholders pending account setup.
 */
import { ArrowUpRight, Mail } from "lucide-react";

const FOUNDER_EMAIL = "andre@hephaistos-systems.de";
const X_URL = "https://x.com/baeckerneuro";
const LI_URL = "https://www.linkedin.com/in/andrebaecker";

export function FounderSection() {
  return (
    <section
      id="founder"
      aria-label="Why KILN exists"
      className="py-20 sm:py-28"
    >
      <div className="mx-auto max-w-2xl px-6">
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Why KILN Exists
          </p>
          <h2 className="mt-3 font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
            Hi, I&apos;m André. I&apos;m building KILN.
          </h2>
        </div>

        <div className="mt-10 space-y-5 text-base leading-relaxed text-muted-foreground">
          <p>
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
            every email.
          </p>
        </div>

        <div className="mt-8 text-center font-serif text-2xl text-foreground">— André</div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <a
            href={`mailto:${FOUNDER_EMAIL}?subject=KILN%20Hello`}
            className="inline-flex items-center gap-2 rounded-xl border border-kiln-orange/40 bg-kiln-orange/10 px-4 py-2.5 text-sm font-medium text-kiln-orange transition-colors hover:bg-kiln-orange/15"
          >
            <Mail className="h-3.5 w-3.5" />
            Email me directly
          </a>
          <a
            href={X_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Follow on X
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
          <a
            href={LI_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Connect on LinkedIn
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
