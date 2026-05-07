"use client";

/**
 * FAQ — accordion list, all closed by default. Each row toggles
 * independently (no max-open constraint). Uses native <details>
 * for built-in keyboard accessibility and gracefully-degrading
 * behavior when JS is disabled.
 */
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AnimatedSection } from "./animated-section";

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "Is my client data secure?",
    a: (
      <>
        Yes. KILN is EU-hosted, GDPR compliant, with full data isolation
        between sub-orgs. Each client&apos;s data stays in their workspace —
        no cross-tenant leaks possible.
      </>
    ),
  },
  {
    q: "How does white-labeling work exactly?",
    a: (
      <>
        Each sub-org gets its own custom domain (e.g., ai.yourclient.com),
        branding (logo, colors), and login URL. Your client sees “their”
        platform. You manage everything from your master dashboard.
      </>
    ),
  },
  {
    q: "Can I bring my own API keys?",
    a: (
      <>
        Yes — BYOK is built in. Your clients can use their own Anthropic,
        OpenAI, Gemini, or Groq keys. They pay API costs directly to the
        provider. You charge them for KILN access. You keep 100% margin.
      </>
    ),
  },
  {
    q: "How is this different from GoHighLevel?",
    a: (
      <>
        GHL is a CRM with AI bolted on. KILN is AI-first. We focus on
        multi-agent workflows, MCP/A2A protocol support, and BYOK. We&apos;re
        built for AI consultancies, not marketing automation generalists.
        Plus: EU-hosted, GDPR-native.
      </>
    ),
  },
  {
    q: "How is this different from n8n?",
    a: (
      <>
        n8n is a general workflow tool. KILN is purpose-built for AI agents
        with native multi-agent orchestration, RAG, voice, and white-labeling.
        We&apos;re not better at workflows in general — we&apos;re 10× better
        at AI agent workflows specifically.
      </>
    ),
  },
  {
    q: "Can my clients log in directly to their workspace?",
    a: (
      <>
        Yes. Each sub-org has its own login URL (e.g., ai.client.com/login).
        Your client sees only their data. They never see KILN branding if you
        don&apos;t want them to.
      </>
    ),
  },
  {
    q: "What if I need help getting started?",
    a: (
      <>
        Two options: (1) Start free and figure it out yourself — full docs
        and YouTube tutorials. (2) Book a 30-min founder call and I&apos;ll
        walk you through your specific setup. (3){" "}
        <Link
          href="/services"
          className="text-kiln-orange underline-offset-2 hover:underline"
        >
          Done-for-you setup service
        </Link>{" "}
        available for agencies who want us to build the first 3 agents.
      </>
    ),
  },
  {
    q: "Does it work in German / for German clients?",
    a: (
      <>
        Yes. Agents support 95+ languages including all DACH variations. The
        KILN dashboard itself is currently English-only — German localization
        coming Q3 2026.
      </>
    ),
  },
  {
    q: "What happens if KILN shuts down?",
    a: (
      <>
        Fair question for a solo-founder startup. All workflows are
        exportable as JSON. All knowledge bases are downloadable. You own
        your data. Plus: open-sourcing KILN core is on the roadmap if
        Hephaistos Systems ever runs out.
      </>
    ),
  },
];

export function FaqSection() {
  return (
    <AnimatedSection
      id="faq"
      aria-label="Frequently asked questions"
      className="py-20 sm:py-28"
    >
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            FAQ
          </p>
          <h2 className="mt-3 font-serif text-3xl tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Questions agencies ask
          </h2>
          <p className="mt-4 text-sm text-muted-foreground">
            Don&apos;t see your question?{" "}
            <a
              href="mailto:andre@hephaistos-systems.de?subject=KILN%20Question"
              className="font-medium text-kiln-orange transition-colors hover:underline"
            >
              Ask the founder →
            </a>
          </p>
        </div>

        <div className="mt-12 space-y-2" data-testid="faq-accordion">
          {FAQS.map((item, i) => (
            <FaqItem key={i} idx={i} q={item.q} a={item.a} />
          ))}
        </div>
      </div>

      <style jsx>{`
        /* True grid-rows height animation. Closed = 0fr, open = 1fr —
           the inner div with overflow:hidden clips while the row
           interpolates. This works for any content height without
           JS measuring scrollHeight. */
        :global(.kiln-faq-grid) {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 280ms ease-out, opacity 220ms ease-out;
          opacity: 0;
        }
        :global(.kiln-faq-grid[data-open="true"]) {
          grid-template-rows: 1fr;
          opacity: 1;
        }
        :global(.kiln-faq-grid > .kiln-faq-grid-inner) {
          overflow: hidden;
        }
        @media (prefers-reduced-motion: reduce) {
          :global(.kiln-faq-grid) {
            transition: none;
          }
        }
      `}</style>
    </AnimatedSection>
  );
}

/**
 * Single FAQ item — React-controlled (not <details>) so the
 * grid-rows height animation has a stable open/closed state to
 * interpolate against.
 *
 * Click on the summary toggles open/close. Pressing Enter / Space
 * also toggles, matching native button semantics.
 */
function FaqItem({
  idx,
  q,
  a,
}: {
  idx: number;
  q: string;
  a: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = `faq-panel-${idx}`;

  return (
    <div
      data-testid={`faq-item-${idx}`}
      data-open={open}
      className={cn(
        "group rounded-xl border bg-card transition-[border-color,background-color,box-shadow] duration-200",
        open
          ? "border-l-2 border-l-kiln-orange border-kiln-orange/40 bg-kiln-orange/[0.03] shadow-md"
          : "border-border hover:border-foreground/20",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-6 py-5 text-left text-sm font-medium text-foreground"
      >
        <span>{q}</span>
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all duration-300",
            open
              ? "bg-kiln-orange/15 rotate-180"
              : "bg-muted/50",
          )}
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5",
              open ? "text-kiln-orange" : "text-muted-foreground",
            )}
          />
        </span>
      </button>
      <div
        id={id}
        role="region"
        data-open={open}
        className="kiln-faq-grid"
      >
        <div className="kiln-faq-grid-inner">
          <div className="px-6 pb-5 text-sm leading-relaxed text-muted-foreground">
            {a}
          </div>
        </div>
      </div>
    </div>
  );
}
