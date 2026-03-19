"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { CookieBanner } from "@/components/cookie-banner";
import Link from "next/link";
import { motion } from "framer-motion";
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
  Copy as CopyIcon,
  Terminal,
  Webhook,
  Brain,
  Timer,
  GitFork,
  Key,
  Users,
  Layers,
  Network,
  Coins,
  Send,
  Store,
  ChevronRight,
  Shield,
  Wrench,
  FlaskConical,
} from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { DEMO_AGENT_SLUG } from "@/lib/demo-agent";

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
      const count = Math.floor((canvas.width * canvas.height) / 4000);
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          r: Math.random() * 1.5 + 0.3,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.1,
          opacity: Math.random() * 0.6 + 0.2,
          twinkleSpeed: Math.random() * 0.02 + 0.005,
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

    window.addEventListener("resize", () => {
      resize();
      createStars();
    });

    return () => {
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      style={{ background: "transparent" }}
    />
  );
}

// ─── Mouse Parallax Floating Element ────────────────────────────────
function FloatingElement({
  children,
  intensity = 20,
  className = "",
}: {
  children: React.ReactNode;
  intensity?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouse = (e: MouseEvent) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const dx = (e.clientX - cx) / cx;
      const dy = (e.clientY - cy) / cy;
      setOffset({ x: dx * intensity, y: dy * intensity });
    };
    window.addEventListener("mousemove", handleMouse);
    return () => window.removeEventListener("mousemove", handleMouse);
  }, [intensity]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        transition: "transform 0.3s ease-out",
      }}
    >
      {children}
    </div>
  );
}

// ─── Scroll-triggered Section ───────────────────────────────────────
function AnimatedSection({
  children,
  className = "",
  id,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  delay?: number;
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 60 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

// ─── Word-by-word Text Reveal ───────────────────────────────────────
function TextReveal({ text, className = "" }: { text: string; className?: string }) {
  const words = text.split(" ");
  return (
    <span className={className}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 + i * 0.08, duration: 0.5, ease: "easeOut" }}
          className="inline-block mr-[0.3em]"
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
}

// ─── Terminal Typed Effect ──────────────────────────────────────────
function TerminalTyped() {
  const lines = useMemo(
    () => [
      { prompt: true, text: 'kiln_create_agent --name "Sales Bot" --model claude-sonnet', delay: 0 },
      { prompt: false, text: "  Agent created: ag_7x2kf9 (claude-sonnet-4-6)", delay: 1800 },
      { prompt: true, text: 'kiln_add_knowledge --agent ag_7x2kf9 --url "https://docs.example.com"', delay: 3200 },
      { prompt: false, text: "  Indexed 47 pages → 312 chunks (pgvector)", delay: 5000 },
      { prompt: true, text: "kiln_deploy_agent --agent ag_7x2kf9 --channel widget", delay: 6500 },
      { prompt: false, text: "  Deployed! Widget: https://kiln.app/embed/ag_7x2kf9", delay: 8200 },
      { prompt: true, text: 'kiln_create_team --name "Sales Team" --template SALES', delay: 10000 },
      { prompt: false, text: "  Team created: 5 agents, 3 levels (Head → Coordinator → Executor)", delay: 11800 },
      { prompt: true, text: "kiln_get_team_status --team sales", delay: 13500 },
      { prompt: false, text: "  Research: 47 leads | Outreach: 38 emails | Qualified: 12 hot leads", delay: 15200 },
    ],
    []
  );

  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    lines.forEach((line, i) => {
      timers.push(setTimeout(() => setVisibleLines(i + 1), line.delay));
    });
    return () => timers.forEach(clearTimeout);
  }, [lines]);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0A0A0A] overflow-hidden shadow-2xl shadow-black/60">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <div className="h-3 w-3 rounded-full bg-[#FF5F57]" />
        <div className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
        <div className="h-3 w-3 rounded-full bg-[#28C840]" />
        <span className="ml-3 text-[11px] text-neutral-500 font-mono">kiln — zsh</span>
      </div>
      <div className="p-5 font-mono text-[13px] leading-loose min-h-[320px]">
        {lines.slice(0, visibleLines).map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            {line.prompt ? (
              <div>
                <span className="text-[#22C55E]">~</span>
                <span className="text-[#3B82F6]"> kiln</span>
                <span className="text-neutral-500"> $ </span>
                <span className="text-white">{line.text}</span>
              </div>
            ) : (
              <div className="text-neutral-400">{line.text}</div>
            )}
          </motion.div>
        ))}
        {visibleLines < lines.length && (
          <span className="inline-block h-4 w-2 animate-pulse bg-[#F97316]" />
        )}
        {visibleLines >= lines.length && (
          <div className="mt-1">
            <span className="text-[#22C55E]">~</span>
            <span className="text-[#3B82F6]"> kiln</span>
            <span className="text-neutral-500"> $ </span>
            <span className="inline-block h-4 w-2 animate-pulse bg-[#F97316]" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 3D Tilt Card ───────────────────────────────────────────────────
function TiltCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState("");

  const handleMouse = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const rotateX = ((y - cy) / cy) * -6;
    const rotateY = ((x - cx) / cx) * 6;
    setTransform(`perspective(600px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`);
  };

  const handleLeave = () => {
    setTransform("perspective(600px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)");
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      className={className}
      style={{ transform, transition: "transform 0.2s ease-out" }}
    >
      {children}
    </div>
  );
}

// ─── Landing Page V2 ────────────────────────────────────────────────
export default function LandingPageV2() {
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
  const [mcpCopied, setMcpCopied] = useState(false);
  const [audienceTab, setAudienceTab] = useState<"business" | "agency" | "developer">("business");
  const videoRef = useRef<HTMLVideoElement>(null);

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

  const features = [
    { icon: Users, title: "Agent Teams", desc: "Hierarchical teams with Head, Coordinator, and Executor roles." },
    { icon: Layers, title: "Multi-LLM", desc: "Claude, GPT-4o, Perplexity, Gemini, Groq — per agent." },
    { icon: Network, title: "Orchestration", desc: "Visual canvas for multi-agent workflows." },
    { icon: Bot, title: "Task Agents", desc: "Autonomous background agents with triggers and routing." },
    { icon: MessageSquare, title: "Conversational Builder", desc: "Describe your agent in plain English." },
    { icon: FileText, title: "RAG Knowledge Base", desc: "Upload PDFs, URLs, or FAQs. Agent answers with your data." },
    { icon: Zap, title: "Smart Actions", desc: "Book appointments, collect emails, score leads." },
    { icon: Coins, title: "AI Credits", desc: "Usage-based pricing or bring your own API key." },
    { icon: BarChart3, title: "ROI Analytics", desc: "Track conversations, leads, and estimated revenue." },
    { icon: Brain, title: "Feedback Loop", desc: "Rate answers, add corrections. Agent improves over time." },
    { icon: Send, title: "Telegram & Email", desc: "Multi-channel deployment from day one." },
    { icon: Globe, title: "Auto Language", desc: "Detects and responds in your customer's language." },
    { icon: Palette, title: "White-Label", desc: "Your brand, colors, logo, domain. Remove KILN branding." },
    { icon: Timer, title: "Scheduled Agents", desc: "Automated tasks on a schedule. Reports, sync, alerts." },
    { icon: Code2, title: "Custom Code", desc: "JavaScript actions triggered by your agent." },
    { icon: Key, title: "Bring Your Own Key", desc: "Use your own API keys for unlimited usage." },
    { icon: Terminal, title: "MCP Server", desc: "25 tools. Manage from Claude Code, Cursor, or any MCP client." },
    { icon: GitFork, title: "Agent Cloning", desc: "Duplicate agents with one click." },
    { icon: Webhook, title: "Webhooks", desc: "HTTP triggers for external service integration." },
    { icon: Store, title: "Marketplace", desc: "Browse community templates. Publish your own." },
  ];

  const plans = [
    {
      name: "Free",
      price: 0,
      isCustom: false,
      creditTiers: [{ credits: 50, monthly: 0, yearlyMo: 0 }],
      features: ["1 AI Agent", "50 AI Credits / Month", "1 Knowledge Base (5MB)", "Embed Widget", "KILN Branding", "Community Support"],
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
      features: ["3 Agents", "Basic Analytics", "3 Knowledge Bases (20MB)", "Email Support", "All Actions"],
      highlight: false,
      tagline: "For freelancers, coaches & small businesses getting started",
      useCases: ["Coaches", "Handwerker", "Freelancers", "Small shops"],
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
      features: ["10 Agents", "Full Analytics + ROI", "10 Knowledge Bases (50MB)", "White-Label", "Feedback Loop", "Priority Support", "Prompt Editor"],
      highlight: true,
      tagline: "For growing businesses that want to automate & convert more",
      useCases: ["Dental practices", "Real estate agencies", "Restaurants", "Growing SaaS"],
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
      features: ["Unlimited Agents", "Unlimited Knowledge Bases", "API Access + MCP Server", "Agent Cloning", "Custom Domain", "Multi-Client Management", "Dedicated Support"],
      highlight: false,
      tagline: "For agencies & teams managing multiple clients",
      useCases: ["Marketing agencies", "AI agencies", "Consulting firms", "Multi-location businesses"],
    },
    {
      name: "Enterprise",
      price: 0,
      isCustom: true,
      creditTiers: [{ credits: 50000, monthly: 0, yearlyMo: 0 }],
      features: ["Everything in Business", "SLA 99.9%", "Custom Onboarding", "50,000+ AI Credits", "Scheduled Agents", "Webhooks", "Priority Queue"],
      highlight: false,
      tagline: "For large organizations with custom requirements",
      useCases: ["Enterprises", "Regulated industries", "Custom SLA requirements"],
    },
  ];

  return (
    <div className="min-h-screen bg-[#0C0A09] text-white antialiased selection:bg-[#F97316]/20 overflow-x-hidden">
      <StarField />

      {/* ── Nav ─────────────────────────────────────────────── */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className={`fixed top-0 z-50 w-full transition-all duration-500 ${
          scrolled
            ? "border-b border-white/[0.06] bg-[#0C0A09]/70 backdrop-blur-xl"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg font-serif text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}
            >
              K
            </div>
            <span className="font-serif text-xl tracking-tight">KILN</span>
          </div>
          <div className="hidden items-center gap-8 text-[13px] text-neutral-400 sm:flex">
            <a href="#features" className="transition-colors hover:text-white">Features</a>
            <a href="#pricing" className="transition-colors hover:text-white">Pricing</a>
            <Link href="/marketplace" className="transition-colors hover:text-white">Marketplace</Link>
            <a href="#developers" className="transition-colors hover:text-white">Developers</a>
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
      </motion.nav>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative pt-40 pb-32 lg:pt-52 lg:pb-40">
        {/* Glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(ellipse 50% 40% at 50% 0%, rgba(249,115,22,0.08) 0%, transparent 70%)",
          }}
        />

        <div className="relative z-10 mx-auto max-w-5xl px-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-sm text-neutral-300"
          >
            <span className="h-2 w-2 rounded-full bg-[#22C55E] animate-pulse" />
            The AI Agent Platform
            <ChevronRight className="h-3.5 w-3.5 text-neutral-500" />
          </motion.div>

          <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-8xl">
            <TextReveal text="Build AI agents." className="block bg-gradient-to-r from-[#F97316] via-[#FB923C] to-[#DC2626] bg-clip-text text-transparent" />
            <TextReveal text="Ship in minutes." className="block text-white mt-2" />
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-neutral-400"
          >
            Create intelligent AI agents, build autonomous teams, connect any LLM,
            and manage everything from code or no-code. EU-hosted. GDPR compliant.
          </motion.p>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.5 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
          >
            <Link
              href="/sign-up"
              className="group flex items-center gap-2 rounded-xl px-8 py-4 text-sm font-semibold text-white transition-all hover:scale-105 hover:shadow-lg hover:shadow-[#F97316]/20"
              style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}
            >
              Get Started Free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>

            <button
              onClick={() => {
                const el = document.getElementById("demo-video");
                if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                if (videoRef.current?.paused) videoRef.current.play();
              }}
              className="flex items-center gap-2 rounded-xl border border-white/10 px-6 py-4 text-sm font-medium text-neutral-300 transition-all hover:bg-white/[0.06] hover:border-white/20"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10">
                <span className="ml-0.5 border-y-[5px] border-l-[8px] border-y-transparent border-l-white" />
              </span>
              Watch Demo
            </button>

            {submitted === "hero" ? (
              <div className="flex items-center gap-2 rounded-xl border border-white/10 px-6 py-4 text-sm text-[#22C55E]">
                <Check className="h-4 w-4" />
                You&apos;re on the list!
              </div>
            ) : (
              <form
                onSubmit={(e) => { e.preventDefault(); handleWaitlist("hero", email); }}
                className="flex gap-2"
              >
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Join the waitlist"
                  required
                  className="w-52 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm text-white placeholder:text-neutral-500 focus:border-[#F97316]/40 focus:outline-none focus:ring-1 focus:ring-[#F97316]/20"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl border border-white/10 px-5 py-4 text-sm text-neutral-300 transition-all hover:bg-white/[0.06] hover:border-white/20 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join"}
                </button>
              </form>
            )}
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.3 }}
            className="mt-4 text-xs text-neutral-500"
          >
            Free plan included &middot; No credit card required &middot; EU-hosted
          </motion.p>

          {/* Product Demo Video */}
          <FloatingElement intensity={10} className="mx-auto mt-20 max-w-5xl">
            <motion.div
              initial={{ opacity: 0, y: 40, rotateX: 8 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ delay: 1.2, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              style={{ perspective: "1200px" }}
              id="demo-video"
            >
              <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141211] shadow-2xl shadow-black/60">
                {/* Window chrome */}
                <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
                  <div className="h-3 w-3 rounded-full bg-[#FF5F57]" />
                  <div className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
                  <div className="h-3 w-3 rounded-full bg-[#28C840]" />
                  <div className="ml-4 flex h-6 flex-1 items-center justify-center rounded-md bg-white/[0.04]">
                    <span className="text-[10px] text-neutral-600">kilnbase.com</span>
                  </div>
                </div>
                {/* Video */}
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="w-full"
                  style={{ display: "block", aspectRatio: "16/9", objectFit: "cover", backgroundColor: "#0a0a0a" }}
                >
                  <source src="/kiln-demo.mp4" type="video/mp4" />
                </video>
              </div>
            </motion.div>
          </FloatingElement>
        </div>
      </section>

      {/* ── Live Demo ────────────────────────────────────────── */}
      {DEMO_AGENT_SLUG && (
        <AnimatedSection className="border-t border-white/[0.06] py-28" id="demo">
          <div className="mx-auto max-w-3xl px-6">
            <div className="mb-12 text-center">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#F97316]">Live Demo</p>
              <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Try it now.</h2>
              <p className="mt-4 text-neutral-400">This is a real KILN agent. No sign-up required.</p>
            </div>
            <div className="overflow-hidden rounded-2xl border border-white/[0.08]">
              <iframe src={`/embed/${DEMO_AGENT_SLUG}`} className="w-full border-0" style={{ height: "520px" }} allow="clipboard-write" title="KILN Demo Agent" />
            </div>
            <div className="mt-8 text-center">
              <Link href="/sign-up" className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all hover:scale-105" style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}>
                Build your own agent in 2 minutes <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="mt-3 text-xs text-neutral-500">Free plan includes 50 AI credits — no credit card required.</p>
            </div>
          </div>
        </AnimatedSection>
      )}

      {/* ── Platform Modules ─────────────────────────────────── */}
      <AnimatedSection className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#F97316]">Platform</p>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Four Modules. One Platform.</h2>
            <p className="mt-4 text-lg text-neutral-400">Everything you need to build, deploy, and scale AI agents.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              { icon: Bot, title: "AI Agent Studio", color: "#F97316", badge: "Live", desc: "Create agents with natural language. RAG knowledge base, smart actions, white-label, analytics." },
              { icon: Users, title: "Agent Teams", color: "#F97316", badge: "Live", desc: "Build hierarchical AI teams. Head agents delegate to coordinators and executors. Fully autonomous." },
              { icon: Network, title: "Orchestration", color: "#F97316", badge: "Live", desc: "Connect agents visually. Define handoff rules, conditions, triggers. Multi-agent workflows on a canvas." },
            ].map((mod, i) => (
              <motion.div
                key={mod.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all hover:border-[#F97316]/20 hover:shadow-lg hover:shadow-[#F97316]/5"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ backgroundColor: `${mod.color}15` }}>
                    <mod.icon className="h-5 w-5" style={{ color: mod.color }} />
                  </div>
                  <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ backgroundColor: `${mod.color}15`, color: mod.color }}>{mod.badge}</span>
                </div>
                <h3 className="text-lg font-bold">{mod.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-400">{mod.desc}</p>
              </motion.div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {[
              { icon: Globe, title: "Site Builder", color: "#3B82F6", badge: "Q3 2026", desc: "Describe your website in natural language. KILN designs, builds, and hosts it with integrated AI." },
              { icon: Zap, title: "Workflow Automation", color: "#22C55E", badge: "Q4 2026", desc: "Automate workflows with natural language. Connect CRM, email, calendar, and 100+ tools." },
            ].map((mod, i) => (
              <motion.div
                key={mod.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5 transition-all hover:border-white/[0.12]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${mod.color}10` }}>
                  <mod.icon className="h-4.5 w-4.5" style={{ color: mod.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold">{mod.title}</h3>
                    <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ backgroundColor: `${mod.color}10`, color: mod.color }}>{mod.badge}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500">{mod.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </AnimatedSection>

      {/* ── Features ──────────────────────────────────────────── */}
      <AnimatedSection id="features" className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#F97316]">Features</p>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Everything you need to ship AI agents</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: Math.min(i * 0.04, 0.4), duration: 0.4 }}
                whileHover={{ y: -3, transition: { duration: 0.15 } }}
                className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all hover:border-[#F97316]/15 hover:bg-white/[0.03]"
              >
                <f.icon className="mb-3 h-5 w-5 text-[#F97316]/70 transition-colors group-hover:text-[#F97316]" />
                <h3 className="text-sm font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </AnimatedSection>

      {/* ── Audience / Built for Everyone ─────────────────────── */}
      <AnimatedSection className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#F97316]">Audience</p>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Built for everyone</h2>
          </div>

          {/* Tab switcher */}
          <div className="mb-12 flex justify-center">
            <div className="relative inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1 backdrop-blur-sm">
              {([
                { id: "business" as const, label: "For Business" },
                { id: "agency" as const, label: "For Agencies" },
                { id: "developer" as const, label: "For Developers" },
              ]).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setAudienceTab(t.id)}
                  className="relative z-10 rounded-lg px-6 py-2.5 text-sm font-medium transition-colors duration-200"
                  style={{ color: audienceTab === t.id ? "#0C0A09" : "#a3a3a3" }}
                >
                  {audienceTab === t.id && (
                    <motion.div
                      layoutId="audienceIndicator"
                      className="absolute inset-0 rounded-lg bg-white"
                      transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                    />
                  )}
                  <span className="relative z-10">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div className="mx-auto max-w-4xl">
            <AnimatePresence mode="wait">
              {audienceTab === "business" && (
                <motion.div
                  key="business"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.3 }}
                  className="grid gap-4 sm:grid-cols-2"
                >
                  {[
                    { icon: MessageSquare, title: "No-Code Agent Builder", desc: "Describe what you need in plain language. No technical knowledge required." },
                    { icon: FileText, title: "Industry Templates", desc: "10 pre-built templates for dental, coaching, real estate, e-commerce, and more." },
                    { icon: Users, title: "Autonomous Agent Teams", desc: "Agent Teams that handle sales, support, and marketing autonomously." },
                    { icon: Layers, title: "Best Model for Each Task", desc: "Choose AI models optimized for each task — fast models for support, smart models for sales." },
                    { icon: Code2, title: "Embed Widget", desc: "Add your AI agent to any website with a single line of code." },
                    { icon: BarChart3, title: "Analytics with ROI", desc: "See conversations, leads captured, and estimated revenue generated." },
                  ].map((f, i) => (
                    <motion.div
                      key={f.title}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.35 }}
                      whileHover={{ y: -2, transition: { duration: 0.15 } }}
                      className="group flex gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all hover:border-[#F97316]/15 hover:bg-white/[0.04]"
                    >
                      <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-[#F97316]/60 transition-colors group-hover:text-[#F97316]" />
                      <div>
                        <h4 className="text-sm font-semibold">{f.title}</h4>
                        <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">{f.desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}

              {audienceTab === "agency" && (
                <motion.div
                  key="agency"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.3 }}
                  className="grid gap-4 sm:grid-cols-2"
                >
                  {[
                    { icon: Palette, title: "White-Label", desc: "Remove all KILN branding. Your logo, colors, custom domain." },
                    { icon: Users, title: "Agent Teams for Clients", desc: "Deploy agent teams for clients with hierarchical roles — Head, Coordinator, Executor." },
                    { icon: Layers, title: "Multi-LLM per Agent", desc: "Use Perplexity for research, Claude for writing, Haiku for fast responses — per agent." },
                    { icon: GitFork, title: "Agent Cloning", desc: "Duplicate proven agents across clients. Bulk clone support." },
                    { icon: Shield, title: "Multi-Client Management", desc: "Manage agents for multiple clients from one dashboard." },
                    { icon: Globe, title: "Custom Domains", desc: "Serve agents on your clients' domains with automatic SSL." },
                    { icon: Key, title: "API Access", desc: "Full REST API and MCP server for programmatic agent management." },
                    { icon: Webhook, title: "Webhooks", desc: "Real-time events for conversations, leads, and actions." },
                  ].map((f, i) => (
                    <motion.div
                      key={f.title}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.35 }}
                      whileHover={{ y: -2, transition: { duration: 0.15 } }}
                      className="group flex gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all hover:border-[#F97316]/15 hover:bg-white/[0.04]"
                    >
                      <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-[#F97316]/60 transition-colors group-hover:text-[#F97316]" />
                      <div>
                        <h4 className="text-sm font-semibold">{f.title}</h4>
                        <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">{f.desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}

              {audienceTab === "developer" && (
                <motion.div
                  key="developer"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[
                      { icon: Terminal, title: "MCP Server (25 tools)", desc: "Full agent lifecycle from Claude Code, Cursor, or any MCP client." },
                      { icon: Layers, title: "Full Multi-LLM via API", desc: "Route to Claude, GPT-4o, Perplexity, Gemini, or Groq per agent via REST API." },
                      { icon: Users, title: "Agent Teams via MCP", desc: "Create hierarchical teams from Claude Code. Head, Coordinator, Executor roles." },
                      { icon: Key, title: "REST API + SDK", desc: "Programmatic access to all agent features with API key auth." },
                      { icon: Wrench, title: "BYOK + Custom Code", desc: "Bring your own API keys. Write custom JavaScript actions." },
                      { icon: Webhook, title: "Webhooks + HTTP Triggers", desc: "Inbound webhooks trigger agent processing. Outbound HTTP actions." },
                      { icon: FlaskConical, title: "Prompt Branching", desc: "Keyword-triggered conditional prompt injection for dynamic behavior." },
                      { icon: Code2, title: "Custom Tools", desc: "Define HTTP tools with template variables. Claude calls them automatically." },
                    ].map((f, i) => (
                      <motion.div
                        key={f.title}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05, duration: 0.35 }}
                        whileHover={{ y: -2, transition: { duration: 0.15 } }}
                        className="group flex gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all hover:border-[#F97316]/15 hover:bg-white/[0.04]"
                      >
                        <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-[#F97316]/60 transition-colors group-hover:text-[#F97316]" />
                        <div>
                          <h4 className="text-sm font-semibold">{f.title}</h4>
                          <p className="mt-1.5 text-xs leading-relaxed text-neutral-500">{f.desc}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* MCP code snippet */}
                  <div className="rounded-xl border border-white/[0.06] bg-[#141211] p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs text-neutral-500">Connect in seconds</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(
                            'claude mcp add kiln-mcp --transport http https://kiln-topaz.vercel.app/api/mcp -H "Authorization: Bearer sk-kiln-YOUR_KEY"'
                          );
                          setMcpCopied(true);
                          setTimeout(() => setMcpCopied(false), 2000);
                        }}
                        className="flex items-center gap-1.5 text-xs text-neutral-500 transition-colors hover:text-white"
                      >
                        {mcpCopied ? <Check className="h-3 w-3 text-[#22C55E]" /> : <CopyIcon className="h-3 w-3" />}
                        {mcpCopied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <pre className="overflow-x-auto text-xs leading-relaxed">
                      <code>
                        <span className="text-neutral-500">$</span>{" "}
                        <span className="text-[#F97316]">claude mcp add</span>{" "}
                        <span className="text-white">kiln-mcp</span>{" "}
                        <span className="text-neutral-500">\</span>
                        {"\n"}{"  "}
                        <span className="text-neutral-400">--transport http</span>{" "}
                        <span className="text-neutral-500">\</span>
                        {"\n"}{"  "}
                        <span className="text-[#22C55E]">https://kiln-topaz.vercel.app/api/mcp</span>{" "}
                        <span className="text-neutral-500">\</span>
                        {"\n"}{"  "}
                        <span className="text-neutral-400">-H</span>{" "}
                        <span className="text-[#F97316]">&quot;Authorization: Bearer sk-kiln-YOUR_KEY&quot;</span>
                      </code>
                    </pre>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </AnimatedSection>

      {/* ── Terminal / Developer Section ──────────────────────── */}
      <AnimatedSection id="developers" className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#22C55E]">For Developers</p>
              <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
                Infrastructure for the
                <br />
                <span className="bg-gradient-to-r from-[#22C55E] to-[#3B82F6] bg-clip-text text-transparent">Agentic Coding</span> era.
              </h2>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-neutral-400">
                KILN is an MCP server. Build agents from Claude Code, Cursor, or any MCP client. 25 tools. Full lifecycle management.
              </p>
              <div className="mt-8 flex items-center gap-4">
                <Link
                  href="/sign-up"
                  className="rounded-xl bg-[#22C55E] px-6 py-3 text-sm font-semibold text-[#0C0A09] transition-all hover:scale-105 hover:shadow-lg hover:shadow-[#22C55E]/20"
                >
                  Get API Key
                </Link>
                <a href="/docs" className="text-sm text-neutral-400 underline underline-offset-4 hover:text-white">
                  Read the docs
                </a>
              </div>

              {/* MCP copy snippet */}
              <div className="mt-8 rounded-xl border border-white/[0.06] bg-[#0A0A0A] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-neutral-500">Connect in seconds</span>
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
                    {mcpCopied ? <Check className="h-3 w-3 text-[#22C55E]" /> : <CopyIcon className="h-3 w-3" />}
                    {mcpCopied ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="overflow-x-auto text-xs leading-relaxed font-mono">
                  <code>
                    <span className="text-neutral-500">$</span>{" "}
                    <span className="text-[#F97316]">claude mcp add</span>{" "}
                    <span className="text-white">kiln-mcp</span>{" "}
                    <span className="text-neutral-500">\</span>{"\n"}
                    {"  "}<span className="text-neutral-400">--transport http</span>{" "}
                    <span className="text-neutral-500">\</span>{"\n"}
                    {"  "}<span className="text-[#22C55E]">https://kiln-topaz.vercel.app/api/mcp</span>{" "}
                    <span className="text-neutral-500">\</span>{"\n"}
                    {"  "}<span className="text-neutral-400">-H</span>{" "}
                    <span className="text-[#3B82F6]">&quot;Authorization: Bearer sk-kiln-YOUR_KEY&quot;</span>
                  </code>
                </pre>
              </div>
            </div>

            <TerminalTyped />
          </div>
        </div>
      </AnimatedSection>

      {/* ── Use Cases / Social Proof ──────────────────────────── */}
      <AnimatedSection className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#F97316]">Use Cases</p>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">What people are building</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              { quote: "A marketing agency built an autonomous content team: Head Agent plans strategy, Writer Agent creates posts, SEO Agent optimizes — all running 24/7.", tag: "Agency", color: "#F97316" },
              { quote: "A dental practice deployed an agent that handles 80% of appointment requests, scores leads, and learns from feedback automatically.", tag: "Business", color: "#3B82F6" },
              { quote: "A developer orchestrated 10 specialized agents from Claude Code via MCP — research, outreach, qualification, and booking — as one Sales Team.", tag: "Developer", color: "#22C55E" },
            ].map((story, i) => (
              <motion.div
                key={story.tag}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15, duration: 0.5 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 transition-all hover:border-white/[0.12]"
              >
                <span className="mb-5 inline-block rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ backgroundColor: `${story.color}15`, color: story.color }}>
                  {story.tag}
                </span>
                <p className="text-[15px] leading-relaxed text-neutral-300">&ldquo;{story.quote}&rdquo;</p>
              </motion.div>
            ))}
          </div>
        </div>
      </AnimatedSection>

      {/* ── Pricing ─────────────────────────────────────────── */}
      <AnimatedSection id="pricing" className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#F97316]">Pricing</p>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Simple, fair pricing</h2>
            <p className="mt-4 text-lg text-neutral-400">Start free. Upgrade as you grow.</p>

            <div className="mt-8 inline-flex items-center rounded-xl border border-white/10 bg-white/[0.03] p-1">
              <button
                onClick={() => setAnnual(false)}
                className={`rounded-lg px-5 py-2 text-sm font-medium transition-all ${!annual ? "bg-white text-[#0C0A09]" : "text-neutral-400 hover:text-white"}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setAnnual(true)}
                className={`rounded-lg px-5 py-2 text-sm font-medium transition-all ${annual ? "bg-white text-[#0C0A09]" : "text-neutral-400 hover:text-white"}`}
              >
                Yearly
                <span className="ml-1.5 text-[10px] text-[#22C55E]">-30%</span>
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {plans.map((plan) => (
              <TiltCard
                key={plan.name}
                className={`relative flex flex-col rounded-2xl border p-6 ${
                  plan.highlight
                    ? "border-[#F97316]/30 bg-[#F97316]/[0.04]"
                    : "border-white/[0.06] bg-white/[0.02]"
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-white" style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}>
                    Most Popular
                  </div>
                )}
                <h3 className="text-base font-bold">{plan.name}</h3>
                <p className="mt-1 text-[11px] italic leading-snug text-neutral-500">{plan.tagline}</p>
                {(() => {
                  const tierIdx = creditTiers[plan.name] || 0;
                  const tier = plan.creditTiers[tierIdx] || plan.creditTiers[0];
                  const displayPrice = annual ? tier.yearlyMo : tier.monthly;
                  return (
                    <>
                      <div className="mt-3 flex items-baseline gap-1">
                        {plan.isCustom ? (
                          <span className="text-3xl font-extrabold">Custom</span>
                        ) : (
                          <>
                            <span className="text-3xl font-extrabold">&euro;{displayPrice}</span>
                            <span className="text-xs text-neutral-500">{tier.monthly === 0 ? "forever" : "/mo"}</span>
                          </>
                        )}
                      </div>
                      {!plan.isCustom && annual && tier.monthly > 0 && (
                        <p className="mt-1 text-[11px] text-neutral-500">
                          <span className="line-through">&euro;{tier.monthly}/mo</span>{" "}
                          <span className="text-[#22C55E]">&euro;{Math.round(tier.yearlyMo * 12)}/yr</span>
                        </p>
                      )}
                      {!plan.isCustom && plan.creditTiers.length > 1 && (
                        <div className="mb-1 mt-3">
                          <div className="mb-1.5 text-[11px] font-semibold text-[#F97316]">
                            {tier.credits.toLocaleString()} AI Credits
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={plan.creditTiers.length - 1}
                            value={tierIdx}
                            onChange={(e) => setCreditTiers((prev) => ({ ...prev, [plan.name]: Number(e.target.value) }))}
                            className="h-1 w-full cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#F97316]"
                            style={{
                              background: `linear-gradient(to right, #F97316 ${(tierIdx / (plan.creditTiers.length - 1)) * 100}%, rgba(255,255,255,0.1) ${(tierIdx / (plan.creditTiers.length - 1)) * 100}%)`,
                            }}
                          />
                          <div className="mt-0.5 flex justify-between text-[9px] text-neutral-600">
                            {plan.creditTiers.map((t: { credits: number; monthly: number; yearlyMo: number }, i: number) => (
                              <span key={i}>{t.credits >= 1000 ? `${t.credits / 1000}k` : t.credits}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {!plan.isCustom && plan.creditTiers.length === 1 && plan.creditTiers[0].credits > 0 && (
                        <p className="mt-2 text-[11px] text-neutral-500">{plan.creditTiers[0].credits} AI Credits / month</p>
                      )}
                    </>
                  );
                })()}
                <ul className="mt-5 flex-1 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-neutral-400">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#F97316]" />
                      {f}
                    </li>
                  ))}
                </ul>
                {!plan.isCustom && plan.creditTiers[0].credits > 0 && (
                  <p className="mt-3 text-[9px] leading-relaxed text-neutral-600">
                    1 credit = 1 response (Haiku/Groq) · 0.5 responses (Sonnet) · 0.2 responses (Opus)
                  </p>
                )}
                <div className="mt-4 border-t border-white/[0.06] pt-3">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">Recommended for</p>
                  <p className="text-[11px] leading-relaxed text-neutral-500">{plan.useCases.join(" · ")}</p>
                </div>
                {plan.isCustom ? (
                  <a href="mailto:andre@hephaistos-systems.de" className="mt-4 block rounded-xl border border-white/10 py-2.5 text-center text-sm font-semibold text-white transition-all hover:bg-white/[0.04]">
                    Contact Sales
                  </a>
                ) : (
                  <Link
                    href="/sign-up"
                    className={`mt-4 block rounded-xl py-2.5 text-center text-sm font-semibold transition-all hover:scale-[1.02] ${
                      plan.highlight
                        ? "text-white hover:shadow-lg hover:shadow-[#F97316]/20"
                        : "border border-white/10 text-white hover:bg-white/[0.04]"
                    }`}
                    style={plan.highlight ? { background: "linear-gradient(135deg, #F97316, #DC2626)" } : undefined}
                  >
                    {plan.price === 0 ? "Get Started Free" : `Choose ${plan.name}`}
                  </Link>
                )}
              </TiltCard>
            ))}
          </div>
        </div>
      </AnimatedSection>

      {/* ── Professional Setup ────────────────────────────────── */}
      <AnimatedSection className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#F97316]">Professional Setup</p>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Want us to build it for you?</h2>
            <p className="mt-4 text-lg text-neutral-400">Our team sets up your AI agents, knowledge base, and integrations — ready to go in 24 hours.</p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              { name: "Quick Start", price: "€490", subtitle: "Perfect for freelancers and small businesses.", features: ["1 AI Agent", "Knowledge Base setup", "Actions configured", "Embed on your website", "30 days email support"] },
              { name: "Business Setup", price: "€1,490", subtitle: "For established businesses ready to automate.", features: ["3 AI Agents", "Full Knowledge Base", "Custom Actions", "White-Label branding", "Analytics setup", "1h Training Call", "30 days support"] },
              { name: "Agency Launch", price: "€3,990", subtitle: "For agencies deploying at scale.", features: ["10+ AI Agents", "Full Platform Setup", "Agent Orchestration", "Webhook Integrations", "3h Training", "30 days priority support"] },
            ].map((pkg, i) => (
              <motion.div
                key={pkg.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="flex flex-col rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8"
              >
                <h3 className="text-lg font-bold">{pkg.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold">{pkg.price}</span>
                  <span className="text-xs text-neutral-500">one-time</span>
                </div>
                <p className="mt-2 text-[13px] text-neutral-500">{pkg.subtitle}</p>
                <ul className="mt-5 flex-1 space-y-2">
                  {pkg.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-neutral-400">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#F97316]" />
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href="mailto:andre@hephaistos-systems.de"
                  className="mt-6 block rounded-xl py-3 text-center text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-[#F97316]/20"
                  style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}
                >
                  Book a Call
                </a>
              </motion.div>
            ))}
          </div>
          <p className="mt-10 text-center text-sm text-neutral-500">Every setup includes 30 days of email support and a satisfaction guarantee.</p>
        </div>
      </AnimatedSection>

      {/* ── Final CTA ───────────────────────────────────────── */}
      <AnimatedSection className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
            <span className="bg-gradient-to-r from-[#F97316] to-[#DC2626] bg-clip-text text-transparent">Ready to build?</span>
          </h2>
          <p className="mt-4 text-lg text-neutral-400">Start free. No code. No credit card.</p>

          <div className="mx-auto mt-10 flex flex-col items-center gap-4">
            <Link
              href="/sign-up"
              className="group flex items-center gap-2 rounded-xl px-10 py-4 text-sm font-semibold text-white transition-all hover:scale-105 hover:shadow-xl hover:shadow-[#F97316]/20"
              style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}
            >
              Get Started Free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>

            {submitted === "cta" ? (
              <div className="flex items-center gap-2 text-sm text-[#22C55E]">
                <Check className="h-4 w-4" />
                You&apos;re on the list!
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); handleWaitlist("cta", ctaEmail); }} className="flex w-full max-w-sm gap-2">
                <input
                  type="email"
                  value={ctaEmail}
                  onChange={(e) => setCtaEmail(e.target.value)}
                  placeholder="Join the waitlist"
                  required
                  className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-white placeholder:text-neutral-500 focus:border-[#F97316]/40 focus:outline-none focus:ring-1 focus:ring-[#F97316]/20"
                />
                <button type="submit" disabled={submitting} className="rounded-xl border border-white/10 px-6 py-3 text-sm text-neutral-300 transition-all hover:bg-white/[0.06] disabled:opacity-50">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join"}
                </button>
              </form>
            )}
          </div>

          <p className="mt-8 text-xs text-neutral-500">
            &#x1f1ea;&#x1f1fa; EU-hosted &middot; GDPR compliant &middot; Built in Germany
          </p>
        </div>
      </AnimatedSection>

      {/* ── Footer ──────────────────────────────────────────── */}
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
                <li><a href="#features" className="hover:text-neutral-300">Features</a></li>
                <li><a href="#pricing" className="hover:text-neutral-300">Pricing</a></li>
                <li><Link href="/marketplace" className="hover:text-neutral-300">Marketplace</Link></li>
                <li><a href="#developers" className="hover:text-neutral-300">Developers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">Company</h4>
              <ul className="space-y-2 text-xs text-neutral-500">
                <li><a href="https://discord.gg/kiln" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-300">Community</a></li>
                <li><a href="/impressum" className="hover:text-neutral-300">Impressum</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">Legal</h4>
              <ul className="space-y-2 text-xs text-neutral-500">
                <li><a href="/privacy" className="hover:text-neutral-300">Privacy</a></li>
                <li><a href="/terms" className="hover:text-neutral-300">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 border-t border-white/[0.06] pt-6">
            <p className="text-xs text-neutral-600">&copy; {new Date().getFullYear()} Hephaistos Systems</p>
          </div>
        </div>
      </footer>

      {/* ── Chat Widget ──────────────────────────────────────── */}
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
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          ) : (
            <MessageSquare className="h-6 w-6" />
          )}
        </button>
      </div>
      <CookieBanner />
    </div>
  );
}
