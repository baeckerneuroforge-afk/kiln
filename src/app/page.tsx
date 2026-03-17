"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { CookieBanner } from "@/components/cookie-banner";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Loader2,
  Bot,
  Globe,
  Zap,
  MessageSquare,
  FileText,
  Palette,
  BarChart3,
  Code2,
  Shield,
  Copy as CopyIcon,
  Terminal,
  Webhook,
  Brain,
  Timer,
  GitFork,
  Key,
  Wrench,
  FlaskConical,
  Users,
  Layers,
  Network,
  Coins,
  Send,
  Store,
} from "lucide-react";
import { DEMO_AGENT_SLUG } from "@/lib/demo-agent";

// ─── Scroll-triggered Fade ─────────────────────────────────────────
function useFadeUp() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return {
    ref,
    className: `transition-all duration-700 ${
      visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
    }`,
  };
}

function Section({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const fade = useFadeUp();
  return (
    <section
      id={id}
      ref={fade.ref}
      className={`${fade.className} ${className}`}
    >
      {children}
    </section>
  );
}

// ─── Landing Page ──────────────────────────────────────────────────
export default function LandingPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const calendlyUrl =
    process.env.NEXT_PUBLIC_CALENDLY_URL ||
    "https://calendly.com/kilnbase/enterprise";
  const [email, setEmail] = useState("");
  const [ctaEmail, setCtaEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<"hero" | "cta" | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [annual, setAnnual] = useState(false);
  const [creditTiers, setCreditTiers] = useState<Record<string, number>>({
    Starter: 0,
    Pro: 0,
    Business: 0,
  });
  const [chatOpen, setChatOpen] = useState(false);
  const [audienceTab, setAudienceTab] = useState<
    "business" | "agency" | "developer"
  >("business");
  const [mcpCopied, setMcpCopied] = useState(false);

  useEffect(() => {
    if (isLoaded && isSignedIn) router.replace("/dashboard");
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleWaitlist = useCallback(
    async (source: "hero" | "cta", value: string) => {
      if (!value.trim() || submitting) return;
      setSubmitting(true);
      try {
        const res = await fetch("/api/waitlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: value }),
        });
        if (res.ok) setSubmitted(source);
      } catch {
        /* silent */
      } finally {
        setSubmitting(false);
      }
    },
    [submitting]
  );

  if (!isLoaded || isSignedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0C0A09]">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0C0A09] text-[#FAFAF9] font-sans antialiased selection:bg-[#F97316]/20">
      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav
        className={`fixed top-0 z-50 w-full transition-all duration-300 ${
          scrolled
            ? "border-b border-white/5 bg-[#0C0A09]/80 backdrop-blur-xl"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg font-serif text-sm font-bold text-white"
              style={{
                background: "linear-gradient(135deg, #F97316, #DC2626)",
              }}
            >
              K
            </div>
            <span className="font-serif text-xl tracking-tight">KILN</span>
          </div>
          <div className="hidden items-center gap-8 text-[13px] text-neutral-400 sm:flex">
            <a
              href="#features"
              className="transition-colors hover:text-white"
            >
              Features
            </a>
            <a href="#pricing" className="transition-colors hover:text-white">
              Pricing
            </a>
            <Link
              href="/marketplace"
              className="transition-colors hover:text-white"
            >
              Marketplace
            </Link>
            <a
              href="#developers"
              className="transition-colors hover:text-white"
            >
              Developers
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="text-[13px] text-neutral-400 transition-colors hover:text-white"
            >
              Login
            </Link>
            <Link
              href="/sign-up"
              className="rounded-lg bg-white px-4 py-2 text-[13px] font-medium text-[#0C0A09] transition-opacity hover:opacity-90"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative pt-36 pb-24 lg:pt-48 lg:pb-32">
        {/* Subtle radial gradient */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(249,115,22,0.06) 0%, transparent 70%)",
          }}
        />

        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <p className="mb-6 text-sm text-neutral-400">
            The AI Agent Platform
          </p>

          <h1 className="font-serif text-5xl leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl">
            Build AI agents.
            <br />
            <span className="text-neutral-400">Ship in minutes.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-neutral-400">
            Create intelligent AI agents, build autonomous teams, connect any
            LLM, and manage everything from code or no-code. EU-hosted. GDPR
            compliant.
          </p>

          {/* CTA buttons */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/sign-up"
              className="flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-medium text-[#0C0A09] transition-opacity hover:opacity-90"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Link>

            {submitted === "hero" ? (
              <div className="flex items-center gap-2 rounded-lg border border-white/10 px-6 py-3 text-sm text-[#22C55E]">
                <Check className="h-4 w-4" />
                You&apos;re on the list!
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleWaitlist("hero", email);
                }}
                className="flex gap-2"
              >
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Join the waitlist"
                  required
                  className="w-48 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:border-white/20 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg border border-white/10 px-4 py-3 text-sm text-neutral-300 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Join"
                  )}
                </button>
              </form>
            )}
          </div>

          <p className="mt-4 text-xs text-neutral-500">
            Free plan included &middot; No credit card required &middot;
            EU-hosted
          </p>

          {/* Dashboard Mockup — clean browser frame */}
          <div className="mx-auto mt-16 max-w-4xl">
            <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-[#141211] shadow-2xl shadow-black/60">
              {/* Window chrome */}
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
                <div className="h-3 w-3 rounded-full bg-white/[0.08]" />
                <div className="h-3 w-3 rounded-full bg-white/[0.08]" />
                <div className="h-3 w-3 rounded-full bg-white/[0.08]" />
                <div className="ml-4 flex h-6 flex-1 items-center justify-center rounded-md bg-white/[0.04]">
                  <span className="text-[10px] text-neutral-600">
                    kiln-topaz.vercel.app/dashboard
                  </span>
                </div>
              </div>
              <div className="flex">
                {/* Sidebar */}
                <div className="hidden w-14 shrink-0 border-r border-white/[0.06] bg-[#0F0E0D] p-2 sm:flex sm:flex-col sm:items-center sm:gap-3 sm:pt-4">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg font-serif text-xs font-bold text-white"
                    style={{
                      background: "linear-gradient(135deg, #F97316, #DC2626)",
                    }}
                  >
                    K
                  </div>
                  <div className="mt-4 flex flex-col items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F97316]/10">
                      <Bot className="h-4 w-4 text-[#F97316]" />
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
                      <Globe className="h-4 w-4 text-neutral-500" />
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
                      <Zap className="h-4 w-4 text-neutral-500" />
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
                      <BarChart3 className="h-4 w-4 text-neutral-500" />
                    </div>
                  </div>
                </div>
                {/* Content */}
                <div className="flex-1 p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <div className="font-serif text-lg text-white">
                        AI Agent Studio
                      </div>
                      <div className="text-xs text-neutral-500">
                        3 Agents &middot; 231 Conversations this month
                      </div>
                    </div>
                    <div
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-white"
                      style={{
                        background:
                          "linear-gradient(135deg, #F97316, #DC2626)",
                      }}
                    >
                      + New Agent
                    </div>
                  </div>
                  <div className="mb-4 grid grid-cols-3 gap-3">
                    {[
                      {
                        label: "Total Chats",
                        value: "1,284",
                        change: "+18%",
                      },
                      {
                        label: "Leads Captured",
                        value: "89",
                        change: "+12%",
                      },
                      {
                        label: "Est. Revenue",
                        value: "€4,250",
                        change: "+24%",
                      },
                    ].map((s) => (
                      <div
                        key={s.label}
                        className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"
                      >
                        <div className="text-[10px] text-neutral-500">
                          {s.label}
                        </div>
                        <div className="mt-1 flex items-baseline gap-1.5">
                          <span className="text-sm font-semibold text-white">
                            {s.value}
                          </span>
                          <span className="text-[10px] text-[#22C55E]">
                            {s.change}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[
                      {
                        name: "Coaching Assistant",
                        status: "Live",
                        color: "#22C55E",
                        chats: 142,
                        leads: 34,
                      },
                      {
                        name: "Dental Practice Agent",
                        status: "Live",
                        color: "#22C55E",
                        chats: 89,
                        leads: 21,
                      },
                      {
                        name: "Support Agent",
                        status: "Draft",
                        color: "#A8A29E",
                        chats: 0,
                        leads: 0,
                      },
                    ].map((a) => (
                      <div
                        key={a.name}
                        className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#F97316]/10">
                            <Bot className="h-3.5 w-3.5 text-[#F97316]" />
                          </div>
                          <span
                            className="flex items-center gap-1 text-[10px]"
                            style={{ color: a.color }}
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: a.color }}
                            />
                            {a.status}
                          </span>
                        </div>
                        <div className="text-xs font-medium text-white">
                          {a.name}
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-[10px] text-neutral-500">
                          <span>{a.chats} chats</span>
                          <span>{a.leads} leads</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Try It Now — Live Demo ────────────────────────────── */}
      {DEMO_AGENT_SLUG && (
        <Section className="border-t border-white/[0.06] py-24" id="demo">
          <div className="mx-auto max-w-3xl px-6">
            <div className="mb-12 text-center">
              <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[#F97316]">
                Live Demo
              </p>
              <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">
                Try it now.
              </h2>
              <p className="mt-4 text-neutral-400">
                This is a real KILN agent. No sign-up required.
              </p>
            </div>
            <div className="overflow-hidden rounded-lg border border-white/[0.08]">
              <iframe
                src={`/embed/${DEMO_AGENT_SLUG}`}
                className="w-full border-0"
                style={{ height: "520px" }}
                allow="clipboard-write"
                title="KILN Demo Agent"
              />
            </div>
            <div className="mt-8 text-center">
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-medium text-[#0C0A09] transition-opacity hover:opacity-90"
              >
                Build your own agent in 2 minutes
                <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="mt-3 text-xs text-neutral-500">
                Free plan includes 50 AI credits — no credit card required.
              </p>
            </div>
          </div>
        </Section>
      )}

      {/* ── Platform ──────────────────────────────────────────── */}
      <Section className="border-t border-white/[0.06] py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[#F97316]">
              Platform
            </p>
            <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">
              Four Modules. One Platform.
            </h2>
            <p className="mt-4 text-neutral-400">
              Everything you need to build, deploy, and scale AI agents.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                icon: Bot,
                title: "AI Agent Studio",
                color: "#F97316",
                badge: "Live",
                desc: "Create agents with natural language. RAG knowledge base, smart actions, white-label, analytics.",
              },
              {
                icon: Users,
                title: "Agent Teams",
                color: "#F97316",
                badge: "Live",
                desc: "Build hierarchical AI teams. Head agents delegate to coordinators and executors. Sales, support, content — fully autonomous.",
              },
              {
                icon: Network,
                title: "Orchestration",
                color: "#F97316",
                badge: "Live",
                desc: "Connect agents visually. Define handoff rules, conditions, triggers. Multi-agent workflows on a canvas.",
              },
            ].map((mod) => (
              <div
                key={mod.title}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6 transition-colors hover:border-white/[0.12]"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${mod.color}15` }}
                  >
                    <mod.icon
                      className="h-5 w-5"
                      style={{ color: mod.color }}
                    />
                  </div>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                    style={{
                      backgroundColor: `${mod.color}15`,
                      color: mod.color,
                    }}
                  >
                    {mod.badge}
                  </span>
                </div>
                <h3 className="text-lg font-semibold">{mod.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-400">
                  {mod.desc}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {[
              {
                icon: Globe,
                title: "Site Builder",
                color: "#3B82F6",
                badge: "Q3 2026",
                desc: "Describe your website in natural language. KILN designs, builds, and hosts it with integrated AI.",
              },
              {
                icon: Zap,
                title: "Flow Engine",
                color: "#22C55E",
                badge: "Q4 2026",
                desc: "Automate workflows with natural language. Connect CRM, email, calendar, and 100+ tools.",
              },
            ].map((mod) => (
              <div
                key={mod.title}
                className="flex items-center gap-4 rounded-lg border border-white/[0.06] bg-white/[0.015] p-4"
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${mod.color}10` }}
                >
                  <mod.icon
                    className="h-4 w-4"
                    style={{ color: mod.color }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{mod.title}</h3>
                    <span
                      className="rounded-full px-2 py-0.5 text-[9px] font-semibold"
                      style={{
                        backgroundColor: `${mod.color}10`,
                        color: mod.color,
                      }}
                    >
                      {mod.badge}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500">{mod.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Features ──────────────────────────────────────────── */}
      <Section id="features" className="border-t border-white/[0.06] py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[#F97316]">
              Features
            </p>
            <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">
              Everything you need to ship AI agents
            </h2>
          </div>

          <div className="grid gap-px overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Users,
                title: "Agent Teams",
                desc: "Hierarchical teams with Head, Coordinator, and Executor roles.",
              },
              {
                icon: Layers,
                title: "Multi-LLM",
                desc: "Claude, GPT-4o, Perplexity, Gemini, Groq — per agent.",
              },
              {
                icon: Network,
                title: "Orchestration",
                desc: "Visual canvas for multi-agent workflows.",
              },
              {
                icon: Bot,
                title: "Task Agents",
                desc: "Autonomous background agents with triggers and routing.",
              },
              {
                icon: MessageSquare,
                title: "Conversational Builder",
                desc: "Describe your agent in plain English.",
              },
              {
                icon: FileText,
                title: "RAG Knowledge Base",
                desc: "Upload PDFs, URLs, or FAQs. Agent answers with your data.",
              },
              {
                icon: Zap,
                title: "Smart Actions",
                desc: "Book appointments, collect emails, score leads.",
              },
              {
                icon: Coins,
                title: "AI Credits",
                desc: "Usage-based pricing or bring your own API key.",
              },
              {
                icon: BarChart3,
                title: "ROI Analytics",
                desc: "Track conversations, leads, and estimated revenue.",
              },
              {
                icon: Brain,
                title: "Feedback Loop",
                desc: "Rate answers, add corrections. Agent improves over time.",
              },
              {
                icon: Send,
                title: "Telegram & Email",
                desc: "Multi-channel deployment from day one.",
              },
              {
                icon: Globe,
                title: "Auto Language",
                desc: "Detects and responds in your customer's language.",
              },
              {
                icon: Palette,
                title: "White-Label",
                desc: "Your brand, colors, logo, domain. Remove KILN branding.",
              },
              {
                icon: Timer,
                title: "Scheduled Agents",
                desc: "Automated tasks on a schedule. Reports, sync, alerts.",
              },
              {
                icon: Code2,
                title: "Custom Code",
                desc: "JavaScript actions triggered by your agent.",
              },
              {
                icon: Key,
                title: "Bring Your Own Key",
                desc: "Use your own API keys for unlimited usage.",
              },
              {
                icon: Terminal,
                title: "MCP Server",
                desc: "25 tools. Manage from Claude Code, Cursor, or any MCP client.",
              },
              {
                icon: GitFork,
                title: "Agent Cloning",
                desc: "Duplicate agents with one click.",
              },
              {
                icon: Webhook,
                title: "Webhooks",
                desc: "HTTP triggers for external service integration.",
              },
              {
                icon: Store,
                title: "Marketplace",
                desc: "Browse community templates. Publish your own.",
              },
            ].map((f) => (
              <div key={f.title} className="bg-[#0C0A09] p-5">
                <f.icon className="mb-3 h-4 w-4 text-neutral-400" />
                <h3 className="text-sm font-medium">{f.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Built for Everyone ────────────────────────────────── */}
      <Section className="border-t border-white/[0.06] py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[#F97316]">
              Audience
            </p>
            <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">
              Built for everyone
            </h2>
          </div>

          <div className="mb-10 flex justify-center">
            <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-1">
              {(
                [
                  { id: "business" as const, label: "For Business" },
                  { id: "agency" as const, label: "For Agencies" },
                  { id: "developer" as const, label: "For Developers" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setAudienceTab(t.id)}
                  className={`rounded-md px-5 py-2 text-sm font-medium transition-all ${
                    audienceTab === t.id
                      ? "bg-white text-[#0C0A09]"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mx-auto max-w-4xl">
            {audienceTab === "business" && (
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  {
                    icon: MessageSquare,
                    title: "No-Code Agent Builder",
                    desc: "Describe what you need in plain language. No technical knowledge required.",
                  },
                  {
                    icon: FileText,
                    title: "Industry Templates",
                    desc: "10 pre-built templates for dental, coaching, real estate, e-commerce, and more.",
                  },
                  {
                    icon: Users,
                    title: "Autonomous Agent Teams",
                    desc: "Agent Teams that handle sales, support, and marketing autonomously.",
                  },
                  {
                    icon: Layers,
                    title: "Best Model for Each Task",
                    desc: "Choose AI models optimized for each task — fast models for support, smart models for sales.",
                  },
                  {
                    icon: Code2,
                    title: "Embed Widget",
                    desc: "Add your AI agent to any website with a single line of code.",
                  },
                  {
                    icon: BarChart3,
                    title: "Analytics with ROI",
                    desc: "See conversations, leads captured, and estimated revenue generated.",
                  },
                ].map((f) => (
                  <div
                    key={f.title}
                    className="flex gap-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-5"
                  >
                    <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400" />
                    <div>
                      <h4 className="text-sm font-medium">{f.title}</h4>
                      <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                        {f.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {audienceTab === "agency" && (
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  {
                    icon: Palette,
                    title: "White-Label",
                    desc: "Remove all KILN branding. Your logo, colors, custom domain.",
                  },
                  {
                    icon: Users,
                    title: "Agent Teams for Clients",
                    desc: "Deploy agent teams for clients with hierarchical roles — Head, Coordinator, Executor.",
                  },
                  {
                    icon: Layers,
                    title: "Multi-LLM per Agent",
                    desc: "Use Perplexity for research, Claude for writing, Haiku for fast responses — per agent.",
                  },
                  {
                    icon: GitFork,
                    title: "Agent Cloning",
                    desc: "Duplicate proven agents across clients. Bulk clone support.",
                  },
                  {
                    icon: Shield,
                    title: "Multi-Client Management",
                    desc: "Manage agents for multiple clients from one dashboard.",
                  },
                  {
                    icon: Globe,
                    title: "Custom Domains",
                    desc: "Serve agents on your clients' domains with automatic SSL.",
                  },
                  {
                    icon: Key,
                    title: "API Access",
                    desc: "Full REST API and MCP server for programmatic agent management.",
                  },
                  {
                    icon: Webhook,
                    title: "Webhooks",
                    desc: "Real-time events for conversations, leads, and actions.",
                  },
                ].map((f) => (
                  <div
                    key={f.title}
                    className="flex gap-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-5"
                  >
                    <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400" />
                    <div>
                      <h4 className="text-sm font-medium">{f.title}</h4>
                      <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                        {f.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {audienceTab === "developer" && (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    {
                      icon: Terminal,
                      title: "MCP Server (25 tools)",
                      desc: "Full agent lifecycle from Claude Code, Cursor, or any MCP client.",
                    },
                    {
                      icon: Layers,
                      title: "Full Multi-LLM via API",
                      desc: "Route to Claude, GPT-4o, Perplexity, Gemini, or Groq per agent via REST API.",
                    },
                    {
                      icon: Users,
                      title: "Agent Teams via MCP",
                      desc: "Create hierarchical teams from Claude Code. Head, Coordinator, Executor roles.",
                    },
                    {
                      icon: Key,
                      title: "REST API + SDK",
                      desc: "Programmatic access to all agent features with API key auth.",
                    },
                    {
                      icon: Wrench,
                      title: "BYOK + Custom Code",
                      desc: "Bring your own API keys. Write custom JavaScript actions.",
                    },
                    {
                      icon: Webhook,
                      title: "Webhooks + HTTP Triggers",
                      desc: "Inbound webhooks trigger agent processing. Outbound HTTP actions.",
                    },
                    {
                      icon: FlaskConical,
                      title: "Prompt Branching",
                      desc: "Keyword-triggered conditional prompt injection for dynamic behavior.",
                    },
                    {
                      icon: Code2,
                      title: "Custom Tools",
                      desc: "Define HTTP tools with template variables. Claude calls them automatically.",
                    },
                  ].map((f) => (
                    <div
                      key={f.title}
                      className="flex gap-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-5"
                    >
                      <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400" />
                      <div>
                        <h4 className="text-sm font-medium">{f.title}</h4>
                        <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                          {f.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {/* MCP code snippet */}
                <div className="rounded-lg border border-white/[0.06] bg-[#141211] p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs text-neutral-500">
                      Connect in seconds
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(
                          'claude mcp add kiln-mcp --transport http https://kiln-topaz.vercel.app/api/mcp -H "Authorization: Bearer sk-kiln-YOUR_KEY"'
                        );
                        setMcpCopied(true);
                        setTimeout(() => setMcpCopied(false), 2000);
                      }}
                      className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-white"
                    >
                      {mcpCopied ? (
                        <Check className="h-3 w-3 text-[#22C55E]" />
                      ) : (
                        <CopyIcon className="h-3 w-3" />
                      )}
                      {mcpCopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="overflow-x-auto text-xs leading-relaxed">
                    <code>
                      <span className="text-neutral-500">$</span>{" "}
                      <span className="text-[#F97316]">claude mcp add</span>{" "}
                      <span className="text-white">kiln-mcp</span>{" "}
                      <span className="text-neutral-500">\</span>
                      {"\n"}
                      {"  "}
                      <span className="text-neutral-400">
                        --transport http
                      </span>{" "}
                      <span className="text-neutral-500">\</span>
                      {"\n"}
                      {"  "}
                      <span className="text-[#22C55E]">
                        https://kiln-topaz.vercel.app/api/mcp
                      </span>{" "}
                      <span className="text-neutral-500">\</span>
                      {"\n"}
                      {"  "}
                      <span className="text-neutral-400">-H</span>{" "}
                      <span className="text-[#3B82F6]">
                        &quot;Authorization: Bearer sk-kiln-YOUR_KEY&quot;
                      </span>
                    </code>
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* ── Social Proof ─────────────────────────────────────── */}
      <Section className="border-t border-white/[0.06] py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[#F97316]">
              Use Cases
            </p>
            <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">
              What people are building
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                quote:
                  "A marketing agency built an autonomous content team: Head Agent plans strategy, Writer Agent creates posts, SEO Agent optimizes — all running 24/7.",
                tag: "Agency",
                color: "#F97316",
              },
              {
                quote:
                  "A dental practice deployed an agent that handles 80% of appointment requests, scores leads, and learns from feedback automatically.",
                tag: "Business",
                color: "#3B82F6",
              },
              {
                quote:
                  "A developer orchestrated 10 specialized agents from Claude Code via MCP — research, outreach, qualification, and booking — as one Sales Team.",
                tag: "Developer",
                color: "#22C55E",
              },
            ].map((story) => (
              <div
                key={story.tag}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6"
              >
                <span
                  className="mb-4 inline-block rounded-full px-3 py-1 text-[10px] font-semibold"
                  style={{
                    backgroundColor: `${story.color}15`,
                    color: story.color,
                  }}
                >
                  {story.tag}
                </span>
                <p className="text-sm leading-relaxed text-neutral-300">
                  &ldquo;{story.quote}&rdquo;
                </p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Developer Section ────────────────────────────────── */}
      <Section
        id="developers"
        className="border-t border-white/[0.06] py-24"
      >
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[#22C55E]">
                For Developers
              </p>
              <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">
                Infrastructure for the
                <br />
                <span className="text-[#22C55E]">Agentic Coding</span> era.
              </h2>
              <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-neutral-400">
                KILN is an MCP server. Build agents from Claude Code, Cursor,
                or any MCP client. 25 tools. Full lifecycle management.
              </p>
              <div className="mt-6 flex items-center gap-4">
                <Link
                  href="/sign-up"
                  className="rounded-lg bg-[#22C55E] px-5 py-2.5 text-sm font-medium text-[#0C0A09] transition-opacity hover:opacity-90"
                >
                  Get API Key
                </Link>
                <a
                  href="/docs/mcp-server.md"
                  className="text-sm text-neutral-400 underline underline-offset-4 hover:text-white"
                >
                  Read the docs
                </a>
              </div>
            </div>

            <div className="rounded-lg border border-white/[0.06] bg-[#0F0E0D]">
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
                <div className="h-3 w-3 rounded-full bg-white/[0.08]" />
                <div className="h-3 w-3 rounded-full bg-white/[0.08]" />
                <div className="h-3 w-3 rounded-full bg-white/[0.08]" />
                <span className="ml-3 text-[11px] text-neutral-600">
                  terminal
                </span>
              </div>
              <div className="p-5 font-mono text-xs leading-loose">
                <div>
                  <span className="text-neutral-500">$</span>{" "}
                  <span className="text-[#22C55E]">kiln_create_team</span>{" "}
                  <span className="text-neutral-400">--name</span>{" "}
                  <span className="text-[#F97316]">
                    &quot;Sales Team&quot;
                  </span>{" "}
                  <span className="text-neutral-400">--template</span>{" "}
                  <span className="text-[#3B82F6]">SALES</span>
                </div>
                <div className="text-neutral-500">
                  {"  "}Team created: 7 agents, 3 levels
                </div>
                <div className="mt-2">
                  <span className="text-neutral-500">$</span>{" "}
                  <span className="text-[#22C55E]">kiln_assign_task</span>{" "}
                  <span className="text-neutral-400">--team</span> sales{" "}
                  <span className="text-neutral-400">--goal</span>{" "}
                  <span className="text-[#F97316]">
                    &quot;Find 50 leads in DACH&quot;
                  </span>
                </div>
                <div className="text-neutral-500">
                  {"  "}Task delegated to 4 executor agents...
                </div>
                <div className="mt-2">
                  <span className="text-neutral-500">$</span>{" "}
                  <span className="text-[#22C55E]">kiln_get_team_status</span>{" "}
                  <span className="text-neutral-400">--team</span> sales
                </div>
                <div className="text-neutral-500">
                  {"  "}Research:{" "}
                  <span className="text-[#22C55E]">47 leads found</span> |
                  Outreach:{" "}
                  <span className="text-[#3B82F6]">38 emails sent</span> |
                  Qualified:{" "}
                  <span className="text-[#F97316]">12 hot leads</span>
                </div>
                <div className="mt-2 inline-block h-3.5 w-2 animate-pulse bg-[#22C55E]" />
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Pricing ─────────────────────────────────────────── */}
      <Section id="pricing" className="border-t border-white/[0.06] py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[#F97316]">
              Pricing
            </p>
            <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">
              Simple, fair pricing
            </h2>
            <p className="mt-4 text-neutral-400">
              Start free. Upgrade as you grow.
            </p>

            <div className="mt-8 inline-flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-1">
              <button
                onClick={() => setAnnual(false)}
                className={`rounded-md px-4 py-1.5 text-xs font-medium transition-all ${
                  !annual
                    ? "bg-white text-[#0C0A09]"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setAnnual(true)}
                className={`rounded-md px-4 py-1.5 text-xs font-medium transition-all ${
                  annual
                    ? "bg-white text-[#0C0A09]"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Yearly
                <span className="ml-1.5 text-[10px] text-[#22C55E]">
                  -30%
                </span>
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {[
              {
                name: "Free",
                price: 0,
                isCustom: false,
                creditTiers: [{ credits: 50, monthly: 0, yearlyMo: 0 }],
                features: [
                  "1 AI Agent",
                  "50 AI Credits / Month",
                  "1 Knowledge Base (5MB)",
                  "Embed Widget",
                  "KILN Branding",
                  "Community Support",
                ],
                highlight: false,
                tagline: "Perfect for testing and exploring AI agents",
                useCases: ["Side projects", "Testing before you buy"],
              },
              {
                name: "Starter",
                price: 39,
                isCustom: false,
                creditTiers: [
                  { credits: 500, monthly: 39, yearlyMo: 27 },
                  { credits: 1000, monthly: 49, yearlyMo: 34 },
                  { credits: 2000, monthly: 59, yearlyMo: 41 },
                ],
                features: [
                  "3 Agents",
                  "Basic Analytics",
                  "3 Knowledge Bases (20MB)",
                  "Email Support",
                  "All Actions",
                ],
                highlight: false,
                tagline:
                  "For freelancers, coaches & small businesses getting started",
                useCases: [
                  "Coaches",
                  "Handwerker",
                  "Freelancers",
                  "Small shops",
                ],
              },
              {
                name: "Pro",
                price: 99,
                isCustom: false,
                creditTiers: [
                  { credits: 2000, monthly: 99, yearlyMo: 69 },
                  { credits: 5000, monthly: 129, yearlyMo: 90 },
                  { credits: 10000, monthly: 169, yearlyMo: 118 },
                ],
                features: [
                  "10 Agents",
                  "Full Analytics + ROI",
                  "10 Knowledge Bases (50MB)",
                  "White-Label",
                  "Feedback Loop",
                  "Priority Support",
                  "Prompt Editor",
                ],
                highlight: true,
                tagline:
                  "For growing businesses that want to automate & convert more",
                useCases: [
                  "Dental practices",
                  "Real estate agencies",
                  "Restaurants",
                  "Growing SaaS",
                ],
              },
              {
                name: "Business",
                price: 249,
                isCustom: false,
                creditTiers: [
                  { credits: 5000, monthly: 249, yearlyMo: 174 },
                  { credits: 15000, monthly: 329, yearlyMo: 230 },
                  { credits: 30000, monthly: 449, yearlyMo: 314 },
                ],
                features: [
                  "Unlimited Agents",
                  "Unlimited Knowledge Bases",
                  "API Access + MCP Server",
                  "Agent Cloning",
                  "Custom Domain",
                  "Multi-Client Management",
                  "Dedicated Support",
                ],
                highlight: false,
                tagline: "For agencies & teams managing multiple clients",
                useCases: [
                  "Marketing agencies",
                  "AI agencies",
                  "Consulting firms",
                  "Multi-location businesses",
                ],
              },
              {
                name: "Enterprise",
                price: 0,
                isCustom: true,
                creditTiers: [{ credits: 50000, monthly: 0, yearlyMo: 0 }],
                features: [
                  "Everything in Agency",
                  "Unlimited Agents",
                  "Unlimited Team Members",
                  "Custom SLA",
                  "Dedicated Onboarding",
                  "Priority Support",
                  "Custom Integrations",
                  "SSO / SAML",
                  "Audit Logs",
                ],
                highlight: false,
                premium: true,
                tagline:
                  "For teams that need custom infrastructure, controls, and rollout support",
                useCases: [
                  "Enterprises",
                  "Regulated teams",
                  "Multi-brand deployments",
                ],
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-lg border p-5 ${
                  plan.highlight
                    ? "border-[#F97316]/30 bg-[#F97316]/[0.03]"
                    : plan.premium
                      ? "border-[#D6B16F]/25 bg-[linear-gradient(180deg,rgba(214,177,111,0.08),rgba(255,255,255,0.02))] shadow-[0_18px_60px_rgba(214,177,111,0.08)]"
                    : "border-white/[0.06] bg-white/[0.02]"
                }`}
              >
                {plan.highlight && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-semibold text-white"
                    style={{
                      background: "linear-gradient(135deg, #F97316, #DC2626)",
                    }}
                  >
                    Most Popular
                  </div>
                )}
                {plan.premium && (
                  <div className="absolute right-4 top-4 rounded-full border border-[#D6B16F]/25 bg-[#D6B16F]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#E7C98B]">
                    Contact Sales
                  </div>
                )}
                <h3 className="text-base font-semibold">{plan.name}</h3>
                <p className="mt-1 text-[11px] italic leading-snug text-neutral-500">
                  {plan.tagline}
                </p>
                {(() => {
                  const tierIdx = creditTiers[plan.name] || 0;
                  const tier =
                    plan.creditTiers[tierIdx] || plan.creditTiers[0];
                  const displayPrice = annual
                    ? tier.yearlyMo
                    : tier.monthly;
                  return (
                    <>
                      <div className="mt-3 flex items-baseline gap-1">
                        {plan.isCustom ? (
                          <span className="font-serif text-3xl">Custom</span>
                        ) : (
                          <>
                            <span className="font-serif text-3xl">
                              &euro;{displayPrice}
                            </span>
                            <span className="text-xs text-neutral-500">
                              {tier.monthly === 0 ? "forever" : "/mo"}
                            </span>
                          </>
                        )}
                      </div>
                      {!plan.isCustom && annual && tier.monthly > 0 && (
                        <p className="mt-1 text-[11px] text-neutral-500">
                          <span className="line-through">
                            &euro;{tier.monthly}/mo
                          </span>{" "}
                          <span className="text-[#22C55E]">
                            &euro;{Math.round(tier.yearlyMo * 12)}/yr
                          </span>
                        </p>
                      )}
                      {!plan.isCustom && plan.creditTiers.length > 1 && (
                        <div className="mb-1 mt-3">
                          <div className="mb-1.5 text-[11px] font-medium text-[#F97316]">
                            {tier.credits.toLocaleString()} AI Credits
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={plan.creditTiers.length - 1}
                            value={tierIdx}
                            onChange={(e) =>
                              setCreditTiers((prev) => ({
                                ...prev,
                                [plan.name]: Number(e.target.value),
                              }))
                            }
                            className="h-1 w-full cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#F97316]"
                            style={{
                              background: `linear-gradient(to right, #F97316 ${
                                (tierIdx / (plan.creditTiers.length - 1)) *
                                100
                              }%, rgba(255,255,255,0.1) ${
                                (tierIdx / (plan.creditTiers.length - 1)) *
                                100
                              }%)`,
                            }}
                          />
                          <div className="mt-0.5 flex justify-between text-[9px] text-neutral-600">
                            {plan.creditTiers.map(
                              (
                                t: {
                                  credits: number;
                                  monthly: number;
                                  yearlyMo: number;
                                },
                                i: number
                              ) => (
                                <span key={i}>
                                  {t.credits >= 1000
                                    ? `${t.credits / 1000}k`
                                    : t.credits}
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      )}
                      {!plan.isCustom &&
                        plan.creditTiers.length === 1 &&
                        plan.creditTiers[0].credits > 0 && (
                          <p className="mt-2 text-[11px] text-neutral-500">
                            {plan.creditTiers[0].credits} AI Credits / month
                          </p>
                        )}
                    </>
                  );
                })()}
                <ul className="mt-5 flex-1 space-y-2">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-[13px] text-neutral-400"
                    >
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#F97316]" />
                      {f}
                    </li>
                  ))}
                </ul>
                {!plan.isCustom && plan.creditTiers[0].credits > 0 && (
                  <p className="mt-3 text-[9px] leading-relaxed text-neutral-600">
                    1 credit = 1 response (Haiku/Groq) · 0.5 responses
                    (Sonnet) · 0.2 responses (Opus)
                  </p>
                )}
                <div className="mt-4 border-t border-white/[0.06] pt-3">
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-neutral-600">
                    Recommended for
                  </p>
                  <p className="text-[11px] leading-relaxed text-neutral-500">
                    {plan.useCases.join(" · ")}
                  </p>
                </div>
                {plan.isCustom ? (
                  <a
                    href={calendlyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 block rounded-lg border border-[#D6B16F]/25 bg-[#D6B16F]/8 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-[#D6B16F]/14"
                  >
                    Contact Sales
                  </a>
                ) : (
                  <Link
                    href="/sign-up"
                    className={`mt-4 block rounded-lg py-2.5 text-center text-sm font-medium transition-opacity hover:opacity-90 ${
                      plan.highlight
                        ? "bg-white text-[#0C0A09]"
                        : "border border-white/10 text-white hover:bg-white/[0.04]"
                    }`}
                  >
                    {plan.price === 0
                      ? "Get Started Free"
                      : `Choose ${plan.name}`}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Professional Setup ────────────────────────────────── */}
      <Section className="border-t border-white/[0.06] py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[#F97316]">
              Professional Setup
            </p>
            <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">
              Want us to build it for you?
            </h2>
            <p className="mt-4 text-neutral-400">
              Our team sets up your AI agents, knowledge base, and integrations
              — ready to go in 24 hours.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                name: "Quick Start",
                price: "€490",
                subtitle: "Perfect for freelancers and small businesses.",
                features: [
                  "1 AI Agent",
                  "Knowledge Base setup",
                  "Actions configured",
                  "Embed on your website",
                  "30 days email support",
                ],
              },
              {
                name: "Business Setup",
                price: "€1,490",
                subtitle: "For established businesses ready to automate.",
                features: [
                  "3 AI Agents",
                  "Full Knowledge Base",
                  "Custom Actions",
                  "White-Label branding",
                  "Analytics setup",
                  "1h Training Call",
                  "30 days support",
                ],
              },
              {
                name: "Agency Launch",
                price: "€3,990",
                subtitle: "For agencies deploying at scale.",
                features: [
                  "10+ AI Agents",
                  "Full Platform Setup",
                  "Agent Orchestration",
                  "Webhook Integrations",
                  "3h Training",
                  "30 days priority support",
                ],
              },
            ].map((pkg) => (
              <div
                key={pkg.name}
                className="flex flex-col rounded-lg border border-white/[0.06] bg-white/[0.02] p-6"
              >
                <h3 className="text-lg font-semibold">{pkg.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-serif text-3xl">{pkg.price}</span>
                  <span className="text-xs text-neutral-500">one-time</span>
                </div>
                <p className="mt-2 text-[13px] text-neutral-500">
                  {pkg.subtitle}
                </p>
                <ul className="mt-5 flex-1 space-y-2">
                  {pkg.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-[13px] text-neutral-400"
                    >
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#F97316]" />
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href="mailto:andre@hephaistos-systems.de"
                  className="mt-6 block rounded-lg bg-white py-2.5 text-center text-sm font-medium text-[#0C0A09] transition-opacity hover:opacity-90"
                >
                  Book a Call
                </a>
              </div>
            ))}
          </div>

          <p className="mt-10 text-center text-sm text-neutral-500">
            Every setup includes 30 days of email support and a satisfaction
            guarantee.
          </p>
        </div>
      </Section>

      {/* ── Final CTA ───────────────────────────────────────── */}
      <Section className="border-t border-white/[0.06] py-24">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">
            Ready to build?
          </h2>
          <p className="mt-4 text-neutral-400">
            Start free. No code. No credit card.
          </p>

          <div className="mx-auto mt-10 flex flex-col items-center gap-4">
            <Link
              href="/sign-up"
              className="flex items-center gap-2 rounded-lg bg-white px-8 py-3.5 text-sm font-medium text-[#0C0A09] transition-opacity hover:opacity-90"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Link>

            {submitted === "cta" ? (
              <div className="flex items-center gap-2 text-sm text-[#22C55E]">
                <Check className="h-4 w-4" />
                You&apos;re on the list!
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleWaitlist("cta", ctaEmail);
                }}
                className="flex w-full max-w-sm gap-2"
              >
                <input
                  type="email"
                  value={ctaEmail}
                  onChange={(e) => setCtaEmail(e.target.value)}
                  placeholder="Join the waitlist"
                  required
                  className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-white/20 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg border border-white/10 px-5 py-2.5 text-sm text-neutral-300 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Join"
                  )}
                </button>
              </form>
            )}
          </div>

          <p className="mt-8 text-xs text-neutral-500">
            &#x1f1ea;&#x1f1fa; EU-hosted &middot; GDPR compliant &middot;
            Built in Germany
          </p>
        </div>
      </Section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg font-serif text-xs font-bold text-white"
                  style={{
                    background: "linear-gradient(135deg, #F97316, #DC2626)",
                  }}
                >
                  K
                </div>
                <span className="font-serif text-lg">KILN</span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                The AI Agent Platform.
                <br />
                Built in Germany by Hephaistos Systems.
              </p>
            </div>

            <div>
              <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-400">
                Product
              </h4>
              <ul className="space-y-2 text-xs text-neutral-500">
                <li>
                  <a
                    href="#features"
                    className="hover:text-neutral-300"
                  >
                    Features
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-neutral-300">
                    Pricing
                  </a>
                </li>
                <li>
                  <Link href="/marketplace" className="hover:text-neutral-300">
                    Marketplace
                  </Link>
                </li>
                <li>
                  <a
                    href="#developers"
                    className="hover:text-neutral-300"
                  >
                    Developers
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-400">
                Company
              </h4>
              <ul className="space-y-2 text-xs text-neutral-500">
                <li>
                  <a
                    href="https://discord.gg/kiln"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-neutral-300"
                  >
                    Community
                  </a>
                </li>
                <li>
                  <a href="/impressum" className="hover:text-neutral-300">
                    Impressum
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-400">
                Legal
              </h4>
              <ul className="space-y-2 text-xs text-neutral-500">
                <li>
                  <a href="/privacy" className="hover:text-neutral-300">
                    Privacy
                  </a>
                </li>
                <li>
                  <a href="/terms" className="hover:text-neutral-300">
                    Terms
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 border-t border-white/[0.06] pt-6">
            <p className="text-xs text-neutral-600">
              &copy; {new Date().getFullYear()} Hephaistos Systems
            </p>
          </div>
        </div>
      </footer>

      {/* ── KILN Sales Assistant Chat Widget ──────────────── */}
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
          className="flex h-14 w-14 items-center justify-center rounded-full text-white transition-transform hover:scale-105"
          style={{
            background: "linear-gradient(135deg, #F97316, #DC2626)",
            boxShadow: "0 4px 20px rgba(249,115,22,0.3)",
          }}
        >
          {chatOpen ? (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          ) : (
            <MessageSquare className="h-6 w-6" />
          )}
        </button>
      </div>
      <CookieBanner />
    </div>
  );
}
