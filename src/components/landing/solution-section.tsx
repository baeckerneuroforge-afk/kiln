"use client";

/**
 * Solution — three-step horizontal flow (Build → Deploy → Charge)
 * with rich per-step mockup visuals. The whole section fades-up on
 * scroll via AnimatedSection; individual step cards stagger in
 * after the section is visible.
 *
 * Each step ships a small HTML/SVG mockup that visualises the
 * mechanic (workflow nodes, sub-org browser stack, Stripe revenue
 * counter) so the page reads as "we built this" rather than
 * "trust us, this works".
 */
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  Receipt,
  TrendingUp,
  Workflow,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedSection } from "./animated-section";
import { FloatingElement } from "./floating-element";

export function SolutionSection() {
  return (
    <AnimatedSection
      id="solution"
      aria-label="How it works"
      className="relative isolate bg-white py-20 sm:py-28"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 100%, rgba(254,215,170,0.4) 0%, transparent 70%)",
        }}
      />
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-kiln-orange">
            How It Works
          </p>
          <h2 className="mt-3 font-serif text-3xl tracking-tight text-stone-900 sm:text-4xl lg:text-5xl">
            Build once. Deploy for every client. Charge recurring.
          </h2>
        </div>

        <div className="mx-auto mt-14 grid max-w-6xl gap-6 lg:grid-cols-3 lg:gap-5">
          <StepCard
            number="01"
            icon={Workflow}
            title="Build agents in your master workspace"
            body="Visual editor. 18+ node types. Multi-agent orchestration. Self-learning RAG. Multi-channel from day one."
            delay={0}
          >
            <BuildPreview />
          </StepCard>
          <StepCard
            number="02"
            icon={Building2}
            title="Spin up sub-orgs for each client"
            body="One click creates a dedicated workspace per client. Full data isolation. Their branding. Custom domain. They log in to “their” platform — not yours."
            delay={150}
          >
            <DeployPreview />
          </StepCard>
          <StepCard
            number="03"
            icon={Receipt}
            title="Charge them monthly via Stripe Connect"
            body="You set the price. Client pays you. API costs go through their BYOK keys. You keep 100% of the margin on KILN access."
            delay={300}
          >
            <ChargePreview />
          </StepCard>
        </div>

        {/* Result strip */}
        <div className="mx-auto mt-12 max-w-4xl rounded-2xl border-y border-kiln-orange/30 bg-kiln-orange/[0.06] p-6 text-center sm:p-8">
          <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-kiln-orange">
            <TrendingUp className="h-3 w-3" />
            Result
          </div>
          <p className="mt-3 font-serif text-xl text-stone-900 sm:text-2xl">
            One platform powers <CountUp end={50} suffix="+" /> AI deployments.{" "}
            <span className="text-kiln-orange">{50}+ recurring revenue streams.</span>{" "}
            Zero per-client maintenance.
          </p>
        </div>
      </div>
    </AnimatedSection>
  );
}

function StepCard({
  number,
  icon: Icon,
  title,
  body,
  delay,
  children,
}: {
  number: string;
  icon: typeof Workflow;
  title: string;
  body: string;
  delay: number;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 200 + delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "group relative flex flex-col rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition-all duration-700",
        "hover:-translate-y-1 hover:border-kiln-orange/40 hover:shadow-xl hover:shadow-kiln-orange/10",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
      )}
    >
      <div className="mb-4 flex items-center gap-3">
        <span className="font-serif text-3xl font-bold text-stone-200 transition-colors group-hover:text-stone-300">
          {number}
        </span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-kiln-orange/10">
          <Icon className="h-4 w-4 text-kiln-orange" />
        </span>
      </div>
      <h3 className="text-base font-semibold text-stone-900 sm:text-lg">
        {title}
      </h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-stone-600">
        {body}
      </p>
      <FloatingElement intensity={5} className="mt-5">
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
          {children}
        </div>
      </FloatingElement>
    </div>
  );
}

/* ── per-step previews ─────────────────────────────────────── */

function BuildPreview() {
  return (
    <div className="space-y-2 text-[10px]">
      <div className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2 py-1.5 shadow-sm">
        <Zap className="h-3 w-3 text-amber-600" />
        <span className="text-stone-900">Trigger: New Lead</span>
      </div>
      <Connector />
      <div className="flex items-center gap-1.5 rounded-md border border-kiln-orange/40 bg-white px-2 py-1.5 shadow-sm">
        <Bot className="h-3 w-3 text-kiln-orange" />
        <span className="text-stone-900">Score Lead</span>
      </div>
      <Connector />
      <div className="grid grid-cols-2 gap-1.5">
        <div className="flex items-center gap-1 rounded-md border border-blue-300 bg-white px-1.5 py-1 shadow-sm">
          <CheckCircle2 className="h-2.5 w-2.5 text-blue-600" />
          <span className="text-stone-900">Hot → CRM</span>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-violet-300 bg-white px-1.5 py-1 shadow-sm">
          <ArrowRight className="h-2.5 w-2.5 text-violet-600" />
          <span className="text-stone-900">Cold → Email</span>
        </div>
      </div>
    </div>
  );
}

function DeployPreview() {
  return (
    <div className="space-y-1.5">
      {[
        { name: "Acme Corp", color: "#F97316", domain: "ai.acme.com" },
        { name: "Beta Studios", color: "#3B82F6", domain: "ai.beta.io" },
        { name: "Gamma Inc", color: "#22C55E", domain: "ai.gamma.co" },
      ].map((b, i) => (
        <div
          key={b.name}
          className="flex items-center gap-2 rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-[10px] shadow-sm transition-transform"
          style={{ transform: `translateX(${i * 4}px)` }}
        >
          <span
            className="flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold text-white"
            style={{ backgroundColor: b.color }}
          >
            {b.name[0]}
          </span>
          <span className="font-medium text-stone-900">{b.name}</span>
          <span className="ml-auto font-mono text-stone-500">
            {b.domain}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChargePreview() {
  return (
    <div className="space-y-2 text-[10px]">
      <div className="rounded-md border border-emerald-300 bg-white p-2.5 shadow-sm">
        <div className="text-[9px] uppercase tracking-wider text-stone-500">
          Monthly recurring
        </div>
        <div className="mt-1 font-mono text-base font-bold text-emerald-600">
          €<CountUp end={497} />/mo
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-md border border-stone-200 bg-white p-1.5">
          <div className="text-[8px] uppercase text-stone-500">Margin</div>
          <div className="font-mono text-stone-900">95%</div>
        </div>
        <div className="rounded-md border border-stone-200 bg-white p-1.5">
          <div className="text-[8px] uppercase text-stone-500">Sub-orgs</div>
          <div className="font-mono text-stone-900">12 active</div>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-md bg-emerald-50 px-2 py-1">
        <span className="text-stone-600">Net this month</span>
        <span className="font-mono font-semibold text-emerald-600">
          €<CountUp end={5964} />
        </span>
      </div>
    </div>
  );
}

function Connector() {
  return (
    <div className="ml-3.5 h-2 w-px bg-gradient-to-b from-stone-300 to-transparent" />
  );
}

/**
 * Tiny count-up animation that runs once when the parent mounts.
 * Keeps math simple — fixed 1.2s duration. Respects reduced motion
 * by skipping the animation and rendering the final value directly.
 */
function CountUp({ end, suffix = "" }: { end: number; suffix?: string }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setValue(end);
      return;
    }
    const start = performance.now();
    const duration = 1200;
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(end * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [end]);
  return (
    <span>
      {value.toLocaleString()}
      {suffix}
    </span>
  );
}
