"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Globe,
  Eye,
  Code,
  Search,
  Brain,
  ShieldCheck,
  FileText,
  Video,
  Users,
  GitCompare,
  Zap,
  FileCheck,
  Bot,
  Plug,
  Sparkles,
  Check,
  X,
  ChevronRight,
  Monitor,
  MousePointer2,
  Play,
  MessageSquare,
} from "lucide-react";

// ─── Star Field Background ─────────────────────────────────────────
function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let stars: { x: number; y: number; r: number; vx: number; vy: number; opacity: number; twinkleSpeed: number }[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    const createStars = () => {
      stars = [];
      const count = Math.floor((canvas.width * canvas.height) / 5000);
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          r: Math.random() * 1.2 + 0.2,
          vx: (Math.random() - 0.5) * 0.1,
          vy: (Math.random() - 0.5) * 0.08,
          opacity: Math.random() * 0.5 + 0.15,
          twinkleSpeed: Math.random() * 0.015 + 0.004,
        });
      }
    };
    createStars();

    let time = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      time += 1;
      for (const star of stars) {
        star.x += star.vx;
        star.y += star.vy;
        if (star.x < 0) star.x = canvas.width;
        if (star.x > canvas.width) star.x = 0;
        if (star.y < 0) star.y = canvas.height;
        if (star.y > canvas.height) star.y = 0;
        const twinkle = Math.sin(time * star.twinkleSpeed) * 0.3 + 0.7;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity * twinkle})`;
        ctx.fill();
      }
      animId = requestAnimationFrame(animate);
    };
    animId = requestAnimationFrame(animate);

    const onResize = () => { resize(); createStars(); };
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", onResize); };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" style={{ background: "transparent" }} />;
}

// ─── Scroll-triggered Fade In ───────────────────────────────────────
function FadeIn({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { rootMargin: "-60px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(40px)",
        transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

// ─── Browser Mockup with animated screenshots ──────────────────────
function BrowserMockup() {
  const [activeScreen, setActiveScreen] = useState(0);
  const screens = [
    { url: "amazon.de/dp/B0CX23V2ZK", label: "Price extraction", color: "#F97316" },
    { url: "linkedin.com/in/john-doe", label: "Lead research", color: "#3B82F6" },
    { url: "portal.supplier.de/invoices", label: "Data extraction", color: "#22C55E" },
    { url: "competitor.com/pricing", label: "Competitor monitoring", color: "#A855F7" },
  ];

  useEffect(() => {
    const timer = setInterval(() => setActiveScreen((s) => (s + 1) % screens.length), 3000);
    return () => clearInterval(timer);
  }, [screens.length]);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141211] shadow-2xl shadow-black/60">
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <div className="h-3 w-3 rounded-full bg-[#FF5F57]" />
        <div className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
        <div className="h-3 w-3 rounded-full bg-[#28C840]" />
        <div className="ml-4 flex h-7 flex-1 items-center justify-center rounded-lg bg-white/[0.04] px-3">
          <Globe className="mr-2 h-3 w-3 text-neutral-600" />
          <span className="text-[11px] text-neutral-500 transition-all duration-500">{screens[activeScreen].url}</span>
        </div>
      </div>
      {/* Screen content */}
      <div className="relative h-[280px] sm:h-[340px] lg:h-[400px] overflow-hidden bg-[#0A0A0A]">
        {screens.map((screen, i) => (
          <div
            key={screen.url}
            className="absolute inset-0 flex flex-col items-center justify-center p-8 transition-opacity duration-700"
            style={{ opacity: activeScreen === i ? 1 : 0 }}
          >
            {/* Simulated page content */}
            <div className="w-full max-w-md space-y-4">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-8 w-8 rounded-lg" style={{ backgroundColor: `${screen.color}20` }}>
                  <div className="flex h-full w-full items-center justify-center">
                    <Monitor className="h-4 w-4" style={{ color: screen.color }} />
                  </div>
                </div>
                <div>
                  <div className="h-3 w-32 rounded bg-white/10" />
                  <div className="mt-1.5 h-2 w-20 rounded bg-white/[0.06]" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-2.5 w-full rounded bg-white/[0.06]" />
                <div className="h-2.5 w-4/5 rounded bg-white/[0.06]" />
                <div className="h-2.5 w-3/5 rounded bg-white/[0.06]" />
              </div>
              <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <MousePointer2 className="h-3.5 w-3.5" style={{ color: screen.color }} />
                  <span className="text-[11px] font-medium" style={{ color: screen.color }}>Agent action</span>
                </div>
                <div className="h-2 w-48 rounded bg-white/[0.08]" />
                <div className="mt-2 h-2 w-36 rounded bg-white/[0.06]" />
              </div>
              {/* Animated cursor */}
              <div
                className="absolute animate-pulse"
                style={{
                  top: `${45 + i * 5}%`,
                  left: `${55 + i * 3}%`,
                  transition: "all 0.5s",
                }}
              >
                <MousePointer2 className="h-5 w-5 text-white drop-shadow-lg" style={{ filter: `drop-shadow(0 0 6px ${screen.color})` }} />
              </div>
            </div>
            {/* Status bar */}
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
              <span className="rounded-full px-3 py-1 text-[10px] font-medium" style={{ backgroundColor: `${screen.color}15`, color: screen.color }}>
                {screen.label}
              </span>
              <span className="text-[10px] text-neutral-600">Step 3 of 7</span>
            </div>
          </div>
        ))}
      </div>
      {/* Screen indicators */}
      <div className="flex items-center justify-center gap-2 border-t border-white/[0.06] py-3">
        {screens.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveScreen(i)}
            className="h-1.5 rounded-full transition-all duration-300"
            style={{
              width: activeScreen === i ? 24 : 6,
              backgroundColor: activeScreen === i ? "#F97316" : "rgba(255,255,255,0.15)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────
export default function ComputerUsePage() {
  const [scrolled, setScrolled] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const handleScroll = useCallback(() => {
    setScrolled(window.scrollY > 20);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const capabilities = [
    { icon: Globe, title: "Browse & Interact", desc: "Agent navigates any website, clicks, types, scrolls \u2014 like a real user.", color: "#F97316" },
    { icon: Eye, title: "See & Understand", desc: "Vision-powered: agent sees screenshots and understands the page visually.", color: "#EC4899" },
    { icon: Code, title: "Write & Execute Code", desc: "Built-in Python & JavaScript sandbox. Data processing, charts, file generation \u2014 all automated.", color: "#22C55E" },
    { icon: Search, title: "Deep Research", desc: "Opens 30+ sources, cross-references, delivers reports with citations.", color: "#3B82F6" },
    { icon: Brain, title: "Learn & Remember", desc: "Procedural Memory: agent learns workflows and improves over time.", color: "#A855F7" },
    { icon: ShieldCheck, title: "Verify & Self-Heal", desc: "Every step verified. Errors auto-corrected. No silent failures.", color: "#EF4444" },
    { icon: FileText, title: "Think Transparently", desc: "Full reasoning log: see exactly why the agent made each decision.", color: "#06B6D4" },
  ];

  const breakthroughFeatures = [
    { icon: Video, title: "Watch & Learn", desc: "Record yourself once. Your agent does it forever." },
    { icon: Users, title: "Agent Swarm", desc: "20 agents working in parallel. Minutes instead of hours." },
    { icon: GitCompare, title: "Diff Detection", desc: "Monitor websites and get alerts when anything changes." },
    { icon: Zap, title: "Multi-Site", desc: "Compare prices across 10 suppliers simultaneously." },
    { icon: FileCheck, title: "Proof of Work", desc: "Automatic PDF reports with screenshots proving every step." },
    { icon: Bot, title: "Agent builds Agents", desc: "Describe what you want. KILN builds the workflow." },
    { icon: Plug, title: "API Autodiscovery", desc: "No integration? Your agent reads the docs and builds one." },
    { icon: Sparkles, title: "Zero-Config", desc: "Set up Computer Use in one sentence. No technical skills needed." },
  ];

  const useCases = [
    {
      badge: "Agencies", color: "#F97316",
      title: "Automated client reporting with Proof of Work PDFs",
      bullets: [
        "Weekly competitor analysis delivered as branded PDF",
        "Social media monitoring across 20 platforms",
        "Automated screenshot documentation for client reviews",
      ],
    },
    {
      badge: "E-Commerce", color: "#3B82F6",
      title: "Real-time competitor price monitoring",
      bullets: [
        "Track prices across 10 competitor shops daily",
        "Alert when competitors change pricing or launch products",
        "Automated price comparison spreadsheets",
      ],
    },
    {
      badge: "Handwerk & KMU", color: "#22C55E",
      title: "Best supplier prices found automatically",
      bullets: [
        "Weekly supplier price checks across Grosshaendler",
        "Automated Ausschreibung responses",
        "Invoice data extraction from supplier portals",
      ],
    },
    {
      badge: "Consultants", color: "#A855F7",
      title: "Lead research on autopilot",
      bullets: [
        "Prospect research from LinkedIn, company websites, news",
        "Automated competitive landscape reports",
        "Meeting prep briefs from public company data",
      ],
    },
  ];

  const comparisonRows = [
    { feature: "Browser Control", kiln: true, chatbase: false, voiceflow: false, n8n: false, perplexity: true },
    { feature: "Visual Reasoning", kiln: true, chatbase: false, voiceflow: false, n8n: false, perplexity: true },
    { feature: "Code Execution", kiln: true, chatbase: false, voiceflow: false, n8n: true, perplexity: true },
    { feature: "Parallel Agents", kiln: true, chatbase: false, voiceflow: false, n8n: true, perplexity: true },
    { feature: "Self-Healing", kiln: true, chatbase: false, voiceflow: false, n8n: false, perplexity: true },
    { feature: "Workflow Editor", kiln: true, chatbase: false, voiceflow: true, n8n: true, perplexity: false },
    { feature: "Chat Agents", kiln: true, chatbase: true, voiceflow: true, n8n: false, perplexity: false },
    { feature: "Multi-Channel Deploy", kiln: true, chatbase: true, voiceflow: true, n8n: false, perplexity: false },
    { feature: "Knowledge Base", kiln: true, chatbase: true, voiceflow: true, n8n: false, perplexity: false },
    { feature: "Self-Learning RAG", kiln: true, chatbase: false, voiceflow: false, n8n: false, perplexity: false },
  ];

  const pricingTeaser = [
    {
      name: "Starter", price: "\u20AC39", period: "/mo",
      subtitle: "Agent Teams, Workflows & SDK",
      features: ["3 Agents", "500 AI credits/mo", "Agent Teams & Orchestration", "Workflow Editor + All Basic Nodes", "Reasoning Log", "Agent SDK & CLI Access"],
      note: "Computer Use starts at Pro",
      highlight: false,
    },
    {
      name: "Pro", price: "\u20AC99", period: "/mo",
      subtitle: "Computer Use Pro + Embeddable",
      features: ["10 Agents", "2,000 AI credits/mo", "Browser + Vision", "Code Sandbox", "Agent Swarm (5)", "100 Steps per Run", "Verification", "Diff Detection", "Proof of Work", "3 Scheduled Automations", "Embeddable Components", "Webhook V2"],
      highlight: true,
    },
    {
      name: "Business", price: "\u20AC249", period: "/mo",
      subtitle: "Computer Use Unlimited + MCP",
      features: ["Unlimited Agents", "5,000 AI credits/mo", "Everything in Pro", "Agent Swarm (20)", "Multi-Site Orchestration", "Watch & Learn", "Agent builds Agents", "API Autodiscovery", "Zero-Config Wizard", "Procedural Memory", "MCP Hybrid Model Routing", "Unlimited Schedules", "Sandbox API", "Custom Node SDK"],
      highlight: false,
    },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white antialiased selection:bg-[#F97316]/20 overflow-x-hidden">
      <StarField />

      {/* ── Nav ────────────────────────────────────────────────── */}
      <nav
        className={`fixed top-0 z-50 w-full transition-all duration-500 ${
          scrolled
            ? "border-b border-white/[0.06] bg-[#0A0A0A]/70 backdrop-blur-xl"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg font-serif text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}
            >
              K
            </div>
            <span className="font-serif text-xl tracking-tight">KILN</span>
          </Link>
          <div className="hidden items-center gap-8 text-[13px] text-neutral-400 sm:flex">
            <Link href="/#features" className="transition-colors hover:text-white">Features</Link>
            <Link href="/computer-use" className="text-white font-medium">Computer Use</Link>
            <Link href="/#pricing" className="transition-colors hover:text-white">Pricing</Link>
            <Link href="/marketplace" className="transition-colors hover:text-white">Marketplace</Link>
            <Link href="/developers" className="transition-colors hover:text-white">Developers</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-[13px] text-neutral-400 transition-colors hover:text-white">
              Login
            </Link>
            <Link
              href="/sign-up"
              className="rounded-lg px-4 py-2 text-[13px] font-medium text-white transition-all hover:scale-105"
              style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── SECTION 1: Hero ───────────────────────────────────── */}
      <section className="relative pt-40 pb-20 lg:pt-52 lg:pb-28">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(249,115,22,0.08) 0%, transparent 70%)" }}
        />

        <div className="relative z-10 mx-auto max-w-5xl px-6 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-sm text-neutral-300">
            <span className="h-2 w-2 rounded-full bg-[#22C55E] animate-pulse" />
            Computer Use
            <ChevronRight className="h-3.5 w-3.5 text-neutral-500" />
          </div>

          <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-7xl">
            <span className="bg-gradient-to-r from-[#F97316] via-[#FB923C] to-[#DC2626] bg-clip-text text-transparent">
              Your AI Agents Don&apos;t Just Chat.
            </span>
            <br />
            <span className="text-white mt-2 block">They Work.</span>
          </h1>

          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-neutral-400">
            KILN agents browse the web, fill out forms, write code, compare prices, and build reports &mdash; fully autonomous. No APIs needed. No manual work.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="group flex items-center gap-2 rounded-xl px-8 py-4 text-sm font-semibold text-white transition-all hover:scale-105 hover:shadow-lg hover:shadow-[#F97316]/20"
              style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}
            >
              Start Building
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <button
              onClick={() => {
                const el = document.getElementById("how-it-works");
                if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              className="flex items-center gap-2 rounded-xl border border-white/10 px-6 py-4 text-sm font-medium text-neutral-300 transition-all hover:bg-white/[0.06] hover:border-white/20"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10">
                <Play className="h-3 w-3 ml-0.5 text-white" />
              </span>
              Watch Demo
            </button>
          </div>

          <p className="mt-4 text-xs text-neutral-500">
            Free plan included &middot; No credit card required &middot; EU-hosted
          </p>

          {/* Browser mockup */}
          <div className="mx-auto mt-16 max-w-4xl">
            <BrowserMockup />
          </div>
        </div>
      </section>

      {/* ── SECTION 2: The Problem ────────────────────────────── */}
      <FadeIn className="py-20">
        <div className="mx-auto max-w-3xl px-6">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 sm:p-10" style={{ borderLeftColor: "#F97316", borderLeftWidth: 3 }}>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#F97316]">The Problem</p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Other platforms stop at chat.</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-neutral-400">
              Need competitor prices? You Google them yourself. Need a report? You build it in Sheets.
              Need form data? You copy-paste. KILN changes that. Your agents do the actual work &mdash; inside
              a real browser, with real results.
            </p>
          </div>
        </div>
      </FadeIn>

      {/* ── SECTION 3: Core Capabilities ──────────────────────── */}
      <section className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-7xl px-6">
          <FadeIn className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#F97316]">Capabilities</p>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">What your agents can do</h2>
          </FadeIn>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {capabilities.map((cap, i) => (
              <FadeIn key={cap.title} delay={i * 0.06}>
                <div className="group h-full rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all hover:border-white/[0.12] hover:bg-white/[0.03] hover:shadow-lg hover:shadow-black/20">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl" style={{ backgroundColor: `${cap.color}15` }}>
                    <cap.icon className="h-5 w-5" style={{ color: cap.color }} />
                  </div>
                  <h3 className="text-base font-bold">{cap.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-400">{cap.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 4: Breakthrough Features ──────────────────── */}
      <section className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-7xl px-6">
          <FadeIn className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#F97316]">Breakthrough</p>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Features that don&apos;t exist anywhere else</h2>
          </FadeIn>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {breakthroughFeatures.map((feat, i) => (
              <FadeIn key={feat.title} delay={i * 0.05}>
                <div className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all hover:border-[#F97316]/20 hover:bg-white/[0.03]">
                  <feat.icon className="mb-3 h-5 w-5 text-[#F97316]/70 transition-colors group-hover:text-[#F97316]" />
                  <h3 className="text-sm font-semibold">{feat.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">{feat.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 5: Use Cases ──────────────────────────────── */}
      <section className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-7xl px-6">
          <FadeIn className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#F97316]">Use Cases</p>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Real-world automation</h2>
          </FadeIn>

          <div className="grid gap-6 sm:grid-cols-2">
            {useCases.map((uc, i) => (
              <FadeIn key={uc.badge} delay={i * 0.1}>
                <div className="h-full rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 transition-all hover:border-white/[0.12]">
                  <span
                    className="mb-5 inline-block rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
                    style={{ backgroundColor: `${uc.color}15`, color: uc.color }}
                  >
                    {uc.badge}
                  </span>
                  <h3 className="text-lg font-bold">{uc.title}</h3>
                  <ul className="mt-4 space-y-2.5">
                    {uc.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2.5 text-sm text-neutral-400">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#22C55E]" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 6: How It Works ──────────────────────────── */}
      <section id="how-it-works" className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-5xl px-6">
          <FadeIn className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#F97316]">How It Works</p>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Three steps to automation</h2>
          </FadeIn>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Describe your task",
                desc: "Type what you need in plain language, or record yourself with Watch & Learn.",
                content: (
                  <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                    <div className="flex items-center gap-2 text-[11px] text-neutral-500 mb-3">
                      <MessageSquare className="h-3.5 w-3.5" />
                      Your prompt
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed italic">
                      &quot;Check competitor prices for Widget Pro on Amazon, eBay, and Otto every Monday at 9am. Send results as PDF to team@company.de&quot;
                    </p>
                  </div>
                ),
              },
              {
                step: "02",
                title: "KILN builds the workflow",
                desc: "AI designs the automation: trigger, browser steps, data extraction, output.",
                content: (
                  <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between gap-4">
                      {["Schedule", "Browse", "Extract", "Report"].map((node, ni) => (
                        <div key={node} className="flex items-center gap-1">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[9px] font-medium text-neutral-300">
                            {node.slice(0, 3)}
                          </div>
                          {ni < 3 && <div className="h-[1px] w-3 bg-white/10" />}
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-[10px] text-neutral-600">4 nodes, 3 connections</p>
                  </div>
                ),
              },
              {
                step: "03",
                title: "Your agent runs autonomously",
                desc: "Sit back. Your agent executes on schedule, handles errors, and delivers results.",
                content: (
                  <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                    <div className="space-y-2">
                      {[
                        { label: "amazon.de", status: "Completed", color: "#22C55E" },
                        { label: "ebay.de", status: "Completed", color: "#22C55E" },
                        { label: "otto.de", status: "Running...", color: "#F97316" },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center justify-between text-[11px]">
                          <span className="text-neutral-400">{item.label}</span>
                          <span style={{ color: item.color }}>{item.status}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#F97316] to-[#22C55E]" style={{ width: "66%" }} />
                    </div>
                  </div>
                ),
              },
            ].map((step, i) => (
              <FadeIn key={step.step} delay={i * 0.12}>
                <div className="h-full rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all hover:border-white/[0.12]">
                  <span className="text-3xl font-extrabold text-[#F97316]/20">{step.step}</span>
                  <h3 className="mt-2 text-base font-bold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-400">{step.desc}</p>
                  {step.content}
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 6b: MCP-Powered Hybrid Routing ──────────── */}
      <section className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-5xl px-6">
          <FadeIn className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#F97316]">Hybrid Intelligence</p>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">MCP-Powered Hybrid Routing</h2>
            <p className="mx-auto mt-6 max-w-2xl text-base text-neutral-400">
              Not every task needs a browser. KILN automatically routes each step to the fastest, cheapest execution path — MCP tool call, API request, or full browser session.
            </p>
          </FadeIn>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                step: "01",
                title: "Classify",
                desc: "Each step is analyzed: Can it be done via API? MCP tool? Or does it need browser control?",
              },
              {
                step: "02",
                title: "Route",
                desc: "API-capable tasks use direct HTTP calls. MCP tools handle structured operations. Only visual tasks launch browser sessions.",
              },
              {
                step: "03",
                title: "Execute",
                desc: "Results are unified regardless of execution path. You get the same output — faster and at lower cost.",
              },
            ].map((item, i) => (
              <FadeIn key={item.step} delay={i * 0.12}>
                <div className="h-full rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all hover:border-white/[0.12]">
                  <span className="text-3xl font-extrabold text-[#F97316]/20">{item.step}</span>
                  <h3 className="mt-2 text-base font-bold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-400">{item.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 7: Comparison Table ───────────────────────── */}
      <section className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-5xl px-6">
          <FadeIn className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#F97316]">Comparison</p>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">How KILN compares</h2>
          </FadeIn>

          <FadeIn>
            <div className="overflow-x-auto rounded-2xl border border-white/[0.06]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06]" style={{ backgroundColor: "rgba(249,115,22,0.06)" }}>
                    <th className="p-4 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">Feature</th>
                    <th className="p-4 text-center text-xs font-semibold uppercase tracking-wider text-[#F97316]">KILN</th>
                    <th className="p-4 text-center text-xs font-semibold uppercase tracking-wider text-neutral-400">Chatbase</th>
                    <th className="p-4 text-center text-xs font-semibold uppercase tracking-wider text-neutral-400 hidden sm:table-cell">Voiceflow</th>
                    <th className="p-4 text-center text-xs font-semibold uppercase tracking-wider text-neutral-400 hidden md:table-cell">n8n</th>
                    <th className="p-4 text-center text-xs font-semibold uppercase tracking-wider text-neutral-400 hidden lg:table-cell">Perplexity</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row.feature} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="p-4 text-sm text-neutral-300">{row.feature}</td>
                      <td className="p-4 text-center" style={{ backgroundColor: "rgba(249,115,22,0.03)" }}>
                        {row.kiln ? <Check className="mx-auto h-4 w-4 text-[#22C55E]" /> : <X className="mx-auto h-4 w-4 text-red-500/60" />}
                      </td>
                      <td className="p-4 text-center">
                        {row.chatbase ? <Check className="mx-auto h-4 w-4 text-[#22C55E]" /> : <X className="mx-auto h-4 w-4 text-red-500/60" />}
                      </td>
                      <td className="p-4 text-center hidden sm:table-cell">
                        {row.voiceflow ? <Check className="mx-auto h-4 w-4 text-[#22C55E]" /> : <X className="mx-auto h-4 w-4 text-red-500/60" />}
                      </td>
                      <td className="p-4 text-center hidden md:table-cell">
                        {row.n8n ? <Check className="mx-auto h-4 w-4 text-[#22C55E]" /> : <X className="mx-auto h-4 w-4 text-red-500/60" />}
                      </td>
                      <td className="p-4 text-center hidden lg:table-cell">
                        {row.perplexity ? <Check className="mx-auto h-4 w-4 text-[#22C55E]" /> : <X className="mx-auto h-4 w-4 text-red-500/60" />}
                      </td>
                    </tr>
                  ))}
                  {/* Price row */}
                  <tr className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-4 text-sm font-medium text-neutral-300">Price</td>
                    <td className="p-4 text-center text-xs font-medium text-[#F97316]" style={{ backgroundColor: "rgba(249,115,22,0.03)" }}>
                      Free &ndash; &euro;249/mo
                    </td>
                    <td className="p-4 text-center text-xs text-neutral-500">$0 &ndash; $500/mo</td>
                    <td className="p-4 text-center text-xs text-neutral-500 hidden sm:table-cell">$0 &ndash; $150+/editor/mo</td>
                    <td className="p-4 text-center text-xs text-neutral-500 hidden md:table-cell">Free &ndash; &euro;50/mo</td>
                    <td className="p-4 text-center text-xs text-neutral-500 hidden lg:table-cell">$200/mo</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── SECTION 8: Pricing Teaser ─────────────────────────── */}
      <section className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-4xl px-6">
          <FadeIn className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#F97316]">Pricing</p>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Start free, scale as you grow</h2>
          </FadeIn>

          <div className="grid gap-4 sm:grid-cols-3">
            {pricingTeaser.map((plan, i) => (
              <FadeIn key={plan.name} delay={i * 0.1}>
                <div
                  className={`relative h-full rounded-2xl border p-6 transition-all hover:shadow-lg hover:shadow-black/20 ${
                    plan.highlight
                      ? "border-[#F97316]/30 bg-[#F97316]/[0.04]"
                      : "border-white/[0.06] bg-white/[0.02]"
                  }`}
                >
                  {plan.highlight && (
                    <div
                      className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-white"
                      style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}
                    >
                      Most Popular
                    </div>
                  )}
                  <h3 className="text-base font-bold">{plan.name}</h3>
                  {"subtitle" in plan && plan.subtitle && (
                    <p className="mt-1 text-[11px] text-neutral-500">{plan.subtitle}</p>
                  )}
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold">{plan.price}</span>
                    <span className="text-xs text-neutral-500">{plan.period}</span>
                  </div>
                  <ul className="mt-6 space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-xs text-neutral-400">
                        <Check className="h-3.5 w-3.5 shrink-0 text-[#22C55E]" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {"note" in plan && plan.note && (
                    <p className="mt-4 rounded-lg bg-white/[0.04] px-3 py-2 text-[11px] text-neutral-500">{plan.note}</p>
                  )}
                </div>
              </FadeIn>
            ))}
          </div>

          <FadeIn className="mt-10 text-center">
            <Link href="/#pricing" className="inline-flex items-center gap-2 text-sm font-medium text-[#F97316] transition-colors hover:text-[#FB923C]">
              See full pricing
              <ArrowRight className="h-4 w-4" />
            </Link>
          </FadeIn>
        </div>
      </section>

      {/* ── SECTION 9: Final CTA ──────────────────────────────── */}
      <section className="border-t border-white/[0.06] py-28">
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse 50% 60% at 50% 50%, rgba(249,115,22,0.06) 0%, transparent 70%)" }}
          />
          <FadeIn>
            <h2 className="relative text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              Stop chatting.{" "}
              <span className="bg-gradient-to-r from-[#F97316] to-[#DC2626] bg-clip-text text-transparent">
                Start doing.
              </span>
            </h2>
            <p className="mt-6 text-lg text-neutral-400">
              Your first Computer Use agent is free.
            </p>
            <div className="mt-10">
              <Link
                href="/sign-up"
                className="group inline-flex items-center gap-2 rounded-xl px-10 py-5 text-base font-semibold text-white transition-all hover:scale-105 hover:shadow-xl hover:shadow-[#F97316]/20"
                style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}
              >
                Get Started Free
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
            <p className="mt-4 text-xs text-neutral-500">
              No credit card required &middot; EU-hosted &middot; GDPR compliant
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg font-serif text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}>K</div>
                <span className="font-serif text-lg">KILN</span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                The AI Agent Platform.<br />Built in Germany by Hephaistos Systems.
              </p>
            </div>
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">Product</h4>
              <ul className="space-y-2 text-xs text-neutral-500">
                <li><Link href="/#features" className="hover:text-neutral-300">Features</Link></li>
                <li><Link href="/computer-use" className="hover:text-neutral-300">Computer Use</Link></li>
                <li><Link href="/enterprise" className="hover:text-neutral-300">Enterprise</Link></li>
                <li><Link href="/#pricing" className="hover:text-neutral-300">Pricing</Link></li>
                <li><Link href="/marketplace" className="hover:text-neutral-300">Marketplace</Link></li>
                <li><Link href="/developers" className="hover:text-neutral-300">Developers</Link></li>
                <li><Link href="/services" className="hover:text-neutral-300">Services</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">Company</h4>
              <ul className="space-y-2 text-xs text-neutral-500">
                <li><a href="https://discord.gg/kiln" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-300">Community</a></li>
                <li><Link href="/changelog" className="hover:text-neutral-300">Changelog</Link></li>
                <li><a href="/impressum" className="hover:text-neutral-300">Impressum</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">Legal</h4>
              <ul className="space-y-2 text-xs text-neutral-500">
                <li><a href="/privacy" className="hover:text-neutral-300">Privacy</a></li>
                <li><a href="/terms" className="hover:text-neutral-300">Terms</a></li>
                <li><a href="/dpa" className="hover:text-neutral-300">DPA</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 border-t border-white/[0.06] pt-6">
            <p className="text-xs text-neutral-600">&copy; {new Date().getFullYear()} Hephaistos Systems</p>
          </div>
        </div>
      </footer>

      {/* ── Chat Widget ──────────────────────────────────────────── */}
      <div className="fixed bottom-5 right-5 z-[99999] flex flex-col items-end">
        {chatOpen && (
          <iframe
            src="/embed/kiln-sales-assistant"
            className="mb-3 rounded-2xl border-none shadow-2xl shadow-black/40"
            style={{ width: 400, height: 600 }}
            allow="clipboard-write"
          />
        )}
        <button
          onClick={() => setChatOpen(!chatOpen)}
          className="flex h-14 w-14 items-center justify-center rounded-full text-white transition-all hover:scale-110"
          style={{ background: "linear-gradient(135deg, #F97316, #DC2626)", boxShadow: "0 4px 20px rgba(249,115,22,0.3)" }}
        >
          {chatOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <MessageSquare className="h-6 w-6" />
          )}
        </button>
      </div>
    </div>
  );
}
