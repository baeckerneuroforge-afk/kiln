"use client";

/**
 * Hero — agency-first positioning with a rich, animated visual side.
 *
 * Left column: pre-headline + headline + subhead + CTAs + trust row.
 * Right column (desktop): a stack of three "client browser frames"
 * that visualize the white-label / multi-tenant USP. Each frame
 * shows a different brand in a faux-Chrome window, offset behind the
 * primary one. Built in pure HTML/SVG so it stays crisp on any
 * viewport.
 *
 * Headline reveals word-by-word with a staggered fade. The trust
 * row staggers in last. The browser stack has a subtle breathing
 * Y-offset.
 */
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Shield,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { FloatingElement } from "./floating-element";
import { TerminalMockup, type TerminalLine } from "./terminal-mockup";

/**
 * Short terminal sequence shown as the hero's 4th visual element —
 * suggests developer-tier control without crowding the multi-tenant
 * browser story.
 */
const HERO_TERMINAL_LINES: TerminalLine[] = [
  { prompt: true, text: "kiln deploy --client acme-corp", delay: 200 },
  { prompt: false, text: "  ✓ Sub-org created: ai.acme-corp.com", delay: 1500 },
  { prompt: false, text: "  ✓ White-label applied", delay: 2400 },
  { prompt: false, text: "  ✓ Stripe customer linked", delay: 3300 },
  { prompt: false, text: "  ✓ Agent ready · €497/mo · production", delay: 4200 },
];

export function HeroSection() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const headlineWords = [
    { w: "Build", o: false },
    { w: "AI", o: false },
    { w: "Agents", o: false },
    { w: "Once.", o: false },
    { w: "\n", o: false },
    { w: "Deploy", o: true },
    { w: "Across", o: false },
    { w: "Every", o: false },
    { w: "Client.", o: false },
  ];

  return (
    <section
      aria-label="Hero"
      className="relative isolate overflow-hidden pt-32 pb-24 sm:pt-40 sm:pb-32 lg:min-h-[100vh] lg:pt-40 lg:pb-24"
    >
      {/* Warm aurora — soft orange tint at upper-right, no red bleed */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 70% 0%, rgba(254,215,170,0.55) 0%, rgba(249,115,22,0.08) 35%, transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-12 lg:items-center lg:gap-8">
        {/* ─── Copy column ─── */}
        <div className="lg:col-span-7">
          <p
            className={cn(
              "mb-5 inline-flex items-center gap-2 rounded-full border border-kiln-orange/40 bg-kiln-orange/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-kiln-orange transition-all duration-700",
              mounted ? "opacity-100" : "opacity-0 -translate-y-2",
            )}
          >
            <Sparkles className="h-3 w-3" />
            Phase B: Agency-First AI Infrastructure
          </p>
          <h1 className="font-serif text-4xl leading-[1.05] tracking-tight text-stone-900 sm:text-5xl lg:text-6xl xl:text-7xl">
            {headlineWords.map((tok, i) =>
              tok.w === "\n" ? (
                <br key={i} />
              ) : (
                <span
                  key={i}
                  className={cn(
                    "inline-block transition-all duration-500",
                    mounted ? "opacity-100" : "opacity-0 translate-y-3",
                    tok.o && "text-kiln-orange",
                  )}
                  style={{ transitionDelay: `${100 + i * 60}ms` }}
                >
                  {tok.w}
                  {i < headlineWords.length - 1 && tok.w !== "\n" ? " " : ""}
                </span>
              ),
            )}
          </h1>
          <p
            className={cn(
              "mt-6 max-w-xl text-base leading-relaxed text-stone-600 sm:text-lg transition-all duration-700 delay-700",
              mounted ? "opacity-100" : "opacity-0 translate-y-2",
            )}
          >
            KILN is the white-label AI agent platform built for agencies.
            Multi-tenant by design. Multi-channel by default. Bring your own
            keys. Stripe-Connect billing built in.
          </p>

          <div
            className={cn(
              "mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5 transition-all duration-700 delay-[900ms]",
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
            )}
          >
            <Link
              href="/sign-up"
              data-testid="hero-cta-primary"
              className="group relative inline-flex items-center justify-center gap-2 rounded-xl bg-kiln-orange px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-kiln-orange/30 transition-all hover:-translate-y-0.5 hover:bg-kiln-orange/95 hover:shadow-xl hover:shadow-kiln-orange/40"
            >
              <span className="relative">Start Free</span>
              <ArrowRight className="relative h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="mailto:andre@hephaistos-systems.de?subject=KILN%20Demo%20Request"
              data-testid="hero-cta-secondary"
              className="group inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 transition-colors hover:text-kiln-orange"
            >
              Or talk to the founder
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </div>

          <div
            className={cn(
              "mt-12 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-stone-500 transition-opacity duration-1000 delay-[1100ms]",
              mounted ? "opacity-100" : "opacity-0",
            )}
          >
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
            <span>50 free credits / month</span>
          </div>
        </div>

        {/* ─── Visual column — multi-tenant browser stack ─── */}
        <div className="hidden lg:col-span-5 lg:block">
          <BrowserStack />
        </div>
      </div>
    </section>
  );
}

function Dot() {
  return <span aria-hidden className="text-stone-300">·</span>;
}

/**
 * Browser-frame stack — three offset Chrome-style windows that
 * visualise the multi-tenant USP. Each frame shows a different
 * sub-org brand. The top frame breathes vertically; the back frames
 * stay still so the perspective doesn't get noisy.
 */
function BrowserStack() {
  return (
    <div className="relative h-[520px]" data-testid="hero-browser-stack">
      {/* Back-most frame — deep parallax for layered depth */}
      <FloatingElement intensity={20} className="absolute right-0 top-12 w-[88%]">
        <BrowserFrame
          brand={{ name: "Gamma Inc", color: "#22C55E" }}
          className="opacity-60 scale-[0.88] -rotate-2"
        />
      </FloatingElement>
      {/* Middle frame — medium parallax */}
      <FloatingElement intensity={14} className="absolute right-4 top-6 w-[92%]">
        <BrowserFrame
          brand={{ name: "Beta Studios", color: "#3B82F6" }}
          className="opacity-80 scale-[0.94] rotate-1"
        />
      </FloatingElement>
      {/* Front frame — primary, breathing animation + subtle parallax */}
      <FloatingElement intensity={8} className="absolute inset-0">
        <div className="animate-kiln-hero-float">
          <BrowserFrame
            brand={{ name: "Acme Corp", color: "#F97316" }}
            primary
          />
        </div>
      </FloatingElement>

      {/* Terminal as 4th visual — bottom-right corner, behind everything,
          slightly tilted, deeper parallax. Shows the developer-power
          angle without overwhelming the multi-tenant browser story. */}
      <FloatingElement
        intensity={24}
        className="absolute -bottom-4 -right-6 hidden w-[55%] -z-10 rotate-3 opacity-90 xl:block"
      >
        <TerminalMockup
          lines={HERO_TERMINAL_LINES}
          className="scale-[0.82]"
        />
      </FloatingElement>

      <style jsx>{`
        @keyframes kiln-hero-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        :global(.animate-kiln-hero-float) {
          animation: kiln-hero-float 6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          :global(.animate-kiln-hero-float) { animation: none; }
        }
      `}</style>
    </div>
  );
}

interface Brand {
  name: string;
  color: string;
}

function BrowserFrame({
  brand,
  primary,
  className,
}: {
  brand: Brand;
  primary?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-white shadow-2xl shadow-stone-900/10 overflow-hidden",
        primary
          ? "border-kiln-orange/30 ring-1 ring-kiln-orange/10"
          : "border-stone-200",
        className,
      )}
    >
      {/* Chrome — Mac-style */}
      <div className="flex items-center gap-2 border-b border-stone-200 bg-stone-50 px-3 py-2">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
        </div>
        <div className="ml-2 flex flex-1 items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[10px] font-mono text-stone-500 ring-1 ring-stone-200">
          <Shield className="h-2.5 w-2.5 text-emerald-600" />
          ai.{brand.name.toLowerCase().replace(/\s+/g, "-")}.com
        </div>
      </div>

      {/* App body */}
      <div className="grid grid-cols-[120px_1fr] min-h-[320px]">
        {/* Sidebar */}
        <div className="border-r border-stone-200 bg-stone-50 p-3">
          <div className="mb-3 flex items-center gap-1.5">
            <span
              aria-hidden
              className="flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold text-white"
              style={{ backgroundColor: brand.color }}
            >
              {brand.name[0]}
            </span>
            <span className="truncate text-[10px] font-semibold text-stone-900">
              {brand.name}
            </span>
          </div>
          <div className="space-y-1">
            {["Agents", "Workflows", "Knowledge", "Channels"].map((item, i) => (
              <div
                key={item}
                className={cn(
                  "rounded px-1.5 py-1 text-[9px]",
                  i === 0
                    ? "font-semibold"
                    : "text-stone-500",
                )}
                style={i === 0 ? {
                  background: `${brand.color}1F`,
                  color: brand.color,
                } : undefined}
              >
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Main canvas — mini workflow */}
        <div className="relative bg-white p-4">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
            Lead Qualification
          </div>
          <div className="flex flex-col gap-2">
            <MiniNode
              icon={<Zap className="h-3 w-3" />}
              label="Trigger: New Lead"
              color={brand.color}
            />
            <Connector />
            <MiniNode
              icon={<Bot className="h-3 w-3" />}
              label="Score Lead"
              color={brand.color}
            />
            <Connector />
            <div className="grid grid-cols-2 gap-2">
              <MiniNode
                icon={<CheckCircle2 className="h-3 w-3" />}
                label="If Hot → CRM"
                color={brand.color}
                muted
              />
              <MiniNode
                icon={<Workflow className="h-3 w-3" />}
                label="If Cold → Email"
                color={brand.color}
                muted
              />
            </div>
          </div>

          {/* Footer cost meter */}
          <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-[9px]">
            <span className="text-stone-500">Live cost</span>
            <span className="font-mono text-stone-900">$0.42 / hour</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniNode({
  icon,
  label,
  color,
  muted,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px]",
        muted ? "border-stone-200 bg-stone-50" : "border-stone-200 bg-white",
      )}
      style={
        muted
          ? undefined
          : {
              borderColor: `${color}55`,
              background: `${color}0F`,
            }
      }
    >
      <span
        aria-hidden
        className="flex h-4 w-4 items-center justify-center rounded"
        style={{ backgroundColor: `${color}25`, color: color }}
      >
        {icon}
      </span>
      <span className="text-stone-900">{label}</span>
    </div>
  );
}

function Connector() {
  return (
    <div className="ml-3.5 h-2 w-px bg-gradient-to-b from-stone-300 to-transparent" />
  );
}
