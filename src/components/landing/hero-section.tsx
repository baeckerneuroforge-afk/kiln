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
      {/* Aurora glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(249,115,22,0.15) 0%, rgba(220,38,38,0.05) 35%, transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-12 lg:items-center lg:gap-8">
        {/* ─── Copy column ─── */}
        <div className="lg:col-span-7">
          <p
            className={cn(
              "mb-5 inline-flex items-center gap-2 rounded-full border border-kiln-orange/30 bg-kiln-orange/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-kiln-orange transition-all duration-700",
              mounted ? "opacity-100" : "opacity-0 -translate-y-2",
            )}
          >
            <Sparkles className="h-3 w-3" />
            Phase B: Agency-First AI Infrastructure
          </p>
          <h1 className="font-serif text-4xl leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl xl:text-7xl">
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
                  {i < headlineWords.length - 1 && tok.w !== "\n" ? " " : ""}
                </span>
              ),
            )}
          </h1>
          <p
            className={cn(
              "mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg transition-all duration-700 delay-700",
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
              className="group relative inline-flex items-center justify-center gap-2 rounded-xl bg-kiln-orange px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-kiln-orange/30 transition-all hover:bg-kiln-orange/90 hover:shadow-kiln-orange/50"
            >
              <span
                aria-hidden
                className="absolute inset-0 rounded-xl bg-kiln-orange/40 blur-xl transition-opacity group-hover:opacity-100"
                style={{ opacity: 0.4 }}
              />
              <span className="relative">Start Free</span>
              <ArrowRight className="relative h-4 w-4 transition-transform group-hover:translate-x-0.5" />
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

          <div
            className={cn(
              "mt-12 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground transition-opacity duration-1000 delay-[1100ms]",
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
  return <span aria-hidden className="text-muted-foreground/40">·</span>;
}

/**
 * Browser-frame stack — three offset Chrome-style windows that
 * visualise the multi-tenant USP. Each frame shows a different
 * sub-org brand. The top frame breathes vertically; the back frames
 * stay still so the perspective doesn't get noisy.
 */
function BrowserStack() {
  return (
    <div className="relative h-[480px]">
      {/* Back-most frame */}
      <BrowserFrame
        brand={{ name: "Gamma Inc", color: "#22C55E" }}
        className="absolute right-0 top-12 w-[88%] opacity-50 scale-[0.88] -rotate-2"
      />
      {/* Middle frame */}
      <BrowserFrame
        brand={{ name: "Beta Studios", color: "#3B82F6" }}
        className="absolute right-4 top-6 w-[92%] opacity-70 scale-[0.94] rotate-1"
      />
      {/* Front frame — primary, breathing animation */}
      <div className="absolute inset-0 animate-kiln-hero-float">
        <BrowserFrame
          brand={{ name: "Acme Corp", color: "#F97316" }}
          primary
        />
      </div>

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
        "rounded-xl border bg-card shadow-2xl shadow-black/40 overflow-hidden",
        primary
          ? "border-kiln-orange/30 shadow-kiln-orange/10"
          : "border-border",
        className,
      )}
    >
      {/* Chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-background/50 px-3 py-2">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
        </div>
        <div className="ml-2 flex flex-1 items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1 text-[10px] font-mono text-muted-foreground">
          <Shield className="h-2.5 w-2.5 text-green-400" />
          ai.{brand.name.toLowerCase().replace(/\s+/g, "-")}.com
        </div>
      </div>

      {/* App body */}
      <div className="grid grid-cols-[120px_1fr] min-h-[320px]">
        {/* Sidebar */}
        <div className="border-r border-border bg-card/40 p-3">
          <div className="mb-3 flex items-center gap-1.5">
            <span
              aria-hidden
              className="flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold text-white"
              style={{ backgroundColor: brand.color }}
            >
              {brand.name[0]}
            </span>
            <span className="truncate text-[10px] font-semibold text-foreground">
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
                    : "text-muted-foreground",
                )}
                style={i === 0 ? {
                  background: `${brand.color}15`,
                  color: brand.color,
                } : undefined}
              >
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Main canvas — mini workflow */}
        <div className="relative p-4">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
          <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between rounded-md border border-border bg-background/40 px-2.5 py-1.5 text-[9px]">
            <span className="text-muted-foreground">Live cost</span>
            <span className="font-mono text-foreground">$0.42 / hour</span>
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
        muted ? "border-border bg-card/60" : "border-border bg-card",
      )}
      style={
        muted
          ? undefined
          : {
              borderColor: `${color}40`,
              background: `${color}08`,
            }
      }
    >
      <span
        aria-hidden
        className="flex h-4 w-4 items-center justify-center rounded"
        style={{ backgroundColor: `${color}20`, color: color }}
      >
        {icon}
      </span>
      <span className="text-foreground">{label}</span>
    </div>
  );
}

function Connector() {
  return (
    <div className="ml-3.5 h-2 w-px bg-gradient-to-b from-border to-transparent" />
  );
}
