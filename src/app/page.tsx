"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Loader2,
  Minus,
  Bot,
  Globe,
  Zap,
  MessageSquare,
  FileText,
  Palette,
  BarChart3,
  Plug,
  Code2,
  Shield,
  Users,
  Workflow,
} from "lucide-react";

// ─── Scroll-triggered Fade-Up ──────────────────────────────────────
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
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return {
    ref,
    className: `transition-all duration-700 ${
      visible
        ? "opacity-100 translate-y-0"
        : "opacity-0 translate-y-8"
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
    <section id={id} ref={fade.ref} className={`${fade.className} ${className}`}>
      {children}
    </section>
  );
}

// ─── Landing Page ──────────────────────────────────────────────────
export default function LandingPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [ctaEmail, setCtaEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<"hero" | "cta" | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [annual, setAnnual] = useState(true);

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
            ? "border-b border-white/5 bg-[#0C0A09]/70 backdrop-blur-2xl"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
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
            <a href="#roadmap" className="transition-colors hover:text-white">Roadmap</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-[13px] text-neutral-400 transition-colors hover:text-white">
              Login
            </Link>
            <Link
              href="/sign-up"
              className="rounded-lg bg-white px-4 py-2 text-[13px] font-medium text-[#0C0A09] transition-opacity hover:opacity-90"
            >
              Kostenlos starten
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-32 pb-24 lg:pt-40 lg:pb-32">
        {/* Grid pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: "64px 64px",
          }}
        />
        {/* Radial glow */}
        <div
          className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2"
          style={{
            width: "900px",
            height: "500px",
            background: "radial-gradient(ellipse, rgba(249,115,22,0.10) 0%, rgba(220,38,38,0.04) 40%, transparent 70%)",
          }}
        />

        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs text-neutral-400 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E] animate-pulse" />
            Early Access — Jetzt kostenlos starten
          </div>

          <h1 className="font-serif text-5xl leading-[1.1] tracking-tight sm:text-6xl lg:text-[4.5rem]">
            Build anything
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #F97316 0%, #DC2626 100%)" }}
            >
              with AI.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-neutral-400">
            AI Agents, Websites und Workflows — in einer Plattform.
            <br className="hidden sm:block" />
            Beschreibe was du brauchst, KILN baut es.
          </p>

          {/* Waitlist */}
          <div className="mx-auto mt-10 max-w-md">
            {submitted === "hero" ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-[#22C55E]/20 bg-[#22C55E]/5 px-6 py-3.5 text-sm text-[#22C55E]">
                <Check className="h-4 w-4" />
                Du bist auf der Waitlist!
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
                  placeholder="deine@email.de"
                  required
                  className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:border-[#F97316]/50 focus:outline-none focus:ring-1 focus:ring-[#F97316]/30 backdrop-blur-sm"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium text-white transition-all hover:brightness-110 disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Beitreten <ArrowRight className="h-3.5 w-3.5" /></>}
                </button>
              </form>
            )}
            <p className="mt-4 text-xs text-neutral-500">
              Oder direkt{" "}
              <Link href="/sign-up" className="text-[#F97316] underline underline-offset-2">
                kostenlos starten
              </Link>{" "}
              — Free Plan, keine Kreditkarte.
            </p>
          </div>

          {/* Dashboard Mockup */}
          <div className="mx-auto mt-16 max-w-3xl">
            <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#141211] shadow-2xl shadow-black/50">
              {/* Window chrome */}
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
                <div className="h-3 w-3 rounded-full bg-white/10" />
                <div className="h-3 w-3 rounded-full bg-white/10" />
                <div className="h-3 w-3 rounded-full bg-white/10" />
                <div className="ml-4 h-5 flex-1 rounded-md bg-white/[0.04]" />
              </div>
              <div className="flex">
                {/* Sidebar */}
                <div className="hidden w-14 shrink-0 border-r border-white/[0.06] bg-[#0F0E0D] p-2 sm:flex sm:flex-col sm:items-center sm:gap-3 sm:pt-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg font-serif text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}>K</div>
                  <div className="mt-4 flex flex-col items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F97316]/10"><Bot className="h-4 w-4 text-[#F97316]" /></div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]"><Globe className="h-4 w-4 text-neutral-500" /></div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]"><Zap className="h-4 w-4 text-neutral-500" /></div>
                  </div>
                </div>
                {/* Content */}
                <div className="flex-1 p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <div className="font-serif text-lg text-white">AI Agent Studio</div>
                      <div className="text-xs text-neutral-500">3 Agents erstellt</div>
                    </div>
                    <div className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs text-neutral-400">+ Neuer Agent</div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[
                      { name: "Yoga-Assistent", status: "Live", color: "#22C55E", chats: 142 },
                      { name: "Makler-Bot", status: "Live", color: "#22C55E", chats: 89 },
                      { name: "Support Agent", status: "Entwurf", color: "#A8A29E", chats: 0 },
                    ].map((a) => (
                      <div key={a.name} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#F97316]/10">
                            <Bot className="h-3.5 w-3.5 text-[#F97316]" />
                          </div>
                          <span className="flex items-center gap-1 text-[10px]" style={{ color: a.color }}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: a.color }} />
                            {a.status}
                          </span>
                        </div>
                        <div className="text-xs font-medium text-white">{a.name}</div>
                        <div className="mt-1 text-[10px] text-neutral-500">{a.chats} Gespräche</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {/* Subtle reflection */}
            <div className="mx-auto h-32 w-[90%] rounded-b-xl bg-gradient-to-b from-white/[0.02] to-transparent blur-sm" />
          </div>
        </div>
      </section>

      {/* ── Features (3 Module) ─────────────────────────────── */}
      <Section id="features" className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-20 text-center">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[#F97316]">Plattform</p>
            <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">Drei Module. Eine Vision.</h2>
            <p className="mt-4 text-neutral-400">Alles was du brauchst — in einem Produkt.</p>
          </div>

          <div className="space-y-20">
            {[
              {
                icon: Bot, label: "Modul 1", title: "AI Agent Studio", color: "#F97316",
                desc: "Erstelle intelligente Chat-Agents die dein Business verstehen. Knowledge Base, Terminbuchung, Lead-Scoring — alles eingebaut.",
                features: [
                  { icon: MessageSquare, text: "Conversational Builder — beschreibe deinen Agent in natürlicher Sprache" },
                  { icon: FileText, text: "RAG Knowledge Base — PDF, URL, FAQ. Dein Agent antwortet mit deinem Wissen" },
                  { icon: Palette, text: "White-Label — eigene Farben, Logo, Domain. Dein Brand, nicht unseres" },
                  { icon: BarChart3, text: "Analytics & Lead-Scoring — jedes Gespräch wird automatisch bewertet" },
                ],
                status: "Live",
              },
              {
                icon: Globe, label: "Modul 2", title: "Site Builder", color: "#3B82F6",
                desc: "Beschreibe deine Website — KILN designt, baut und hosted sie. Mit integriertem AI-Chat und Analytics.",
                features: [
                  { icon: Code2, text: "Natural Language Design — beschreibe Layouts, Farben, Inhalte" },
                  { icon: Shield, text: "Custom Domains + SSL — professionelle URLs ab Tag 1" },
                  { icon: Bot, text: "Agent Integration — Chat-Widget automatisch eingebettet" },
                  { icon: BarChart3, text: "SEO & Analytics — automatisch optimiert, messbar" },
                ],
                status: "Q3 2026",
              },
              {
                icon: Zap, label: "Modul 3", title: "Flow Engine", color: "#22C55E",
                desc: "Automatisiere Workflows per Sprache. Verbinde CRM, E-Mail, Kalender und 100+ Tools.",
                features: [
                  { icon: Workflow, text: "Visual Flow Builder — Drag & Drop mit AI-Assist" },
                  { icon: Plug, text: "100+ Integrationen — HubSpot, Calendly, Slack, Stripe und mehr" },
                  { icon: Zap, text: "Trigger & Actions — Wenn X passiert, mache Y. Automatisch." },
                  { icon: Users, text: "Multi-Client — Flows für verschiedene Kunden verwalten" },
                ],
                status: "Q4 2026",
              },
            ].map((mod, idx) => (
              <Section key={mod.title} className={`flex flex-col gap-12 lg:flex-row lg:items-center ${idx % 2 === 1 ? "lg:flex-row-reverse" : ""}`}>
                {/* Text */}
                <div className="flex-1">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${mod.color}15` }}>
                      <mod.icon className="h-5 w-5" style={{ color: mod.color }} />
                    </div>
                    <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">{mod.label}</span>
                    <span className="rounded-full px-2.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${mod.color}15`, color: mod.color }}>
                      {mod.status}
                    </span>
                  </div>
                  <h3 className="font-serif text-2xl tracking-tight sm:text-3xl">{mod.title}</h3>
                  <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-neutral-400">{mod.desc}</p>
                </div>
                {/* Feature List */}
                <div className="flex-1 space-y-4">
                  {mod.features.map((f) => (
                    <div key={f.text} className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${mod.color}10` }}>
                        <f.icon className="h-4 w-4" style={{ color: mod.color }} />
                      </div>
                      <p className="text-sm leading-relaxed text-neutral-300">{f.text}</p>
                    </div>
                  ))}
                </div>
              </Section>
            ))}
          </div>
        </div>
      </Section>

      {/* ── How it Works ────────────────────────────────────── */}
      <Section className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-20 text-center">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[#F97316]">Prozess</p>
            <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">Vier Schritte. Kein Code.</h2>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: "01", title: "Beschreiben", desc: "Erzähl KILN in deinen Worten was du brauchst. Branche, Tonalität, Zielgruppe." },
              { n: "02", title: "Generieren", desc: "KILN erstellt System-Prompt, Persönlichkeit, Actions und Knowledge Base automatisch." },
              { n: "03", title: "Anpassen", desc: "Teste im Live-Chat, passe Antworten an, lade Wissen hoch. Alles visuell." },
              { n: "04", title: "Live schalten", desc: "Ein Klick. Dein Agent ist online — auf deiner Website, in deinen Farben." },
            ].map((step) => (
              <div key={step.n}>
                <div className="mb-4 font-mono text-5xl font-bold bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(180deg, #F97316 0%, #DC262640 100%)" }}>
                  {step.n}
                </div>
                <h3 className="mb-2 text-[15px] font-semibold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-neutral-500">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Showcase ────────────────────────────────────────── */}
      <Section className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-20 text-center">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[#F97316]">Beispiele</p>
            <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">Was du mit KILN bauen kannst</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                badge: "AI Agent", color: "#F97316", gradient: "from-[#F97316]/10 to-[#DC2626]/5",
                title: "Yoga-Studio Assistent", desc: "Beantwortet Kursfragen, bucht Probestunden, sammelt Leads — 24/7 auf deiner Website.",
              },
              {
                badge: "Website", color: "#3B82F6", gradient: "from-[#3B82F6]/10 to-[#6366F1]/5",
                title: "Makler-Landingpage", desc: "Professionelle Immobilien-Seite mit integriertem Beratungs-Chat und Besichtigungsbuchung.",
              },
              {
                badge: "Workflow", color: "#22C55E", gradient: "from-[#22C55E]/10 to-[#10B981]/5",
                title: "Lead-Nurturing Flow", desc: "Neuer Lead → E-Mail-Sequenz → CRM-Eintrag → Termin-Reminder. Vollautomatisch.",
              },
            ].map((ex) => (
              <div
                key={ex.title}
                className={`rounded-2xl border border-white/[0.06] bg-gradient-to-br ${ex.gradient} p-6`}
              >
                <span
                  className="mb-4 inline-block rounded-full px-3 py-1 text-[10px] font-semibold"
                  style={{ backgroundColor: `${ex.color}15`, color: ex.color }}
                >
                  {ex.badge}
                </span>
                <h3 className="mb-2 text-lg font-semibold">{ex.title}</h3>
                <p className="text-sm leading-relaxed text-neutral-400">{ex.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Comparison ──────────────────────────────────────── */}
      <Section className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[#F97316]">Vergleich</p>
            <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">KILN vs. Alternativen</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="pb-4 pr-6 text-left text-xs font-medium text-neutral-500">Feature</th>
                  {["KILN", "Bolt.new", "Zapier", "Voiceflow", "Webflow"].map((name) => (
                    <th key={name} className={`pb-4 text-center text-xs font-medium ${name === "KILN" ? "text-[#F97316]" : "text-neutral-500"}`}>
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-neutral-400">
                {[
                  { feature: "AI Agents", kiln: true, bolt: false, zapier: false, voice: true, webflow: false },
                  { feature: "Website Builder", kiln: true, bolt: true, zapier: false, voice: false, webflow: true },
                  { feature: "Workflow Automation", kiln: true, bolt: false, zapier: true, voice: false, webflow: false },
                  { feature: "Knowledge Base (RAG)", kiln: true, bolt: false, zapier: false, voice: true, webflow: false },
                  { feature: "White-Label", kiln: true, bolt: false, zapier: false, voice: true, webflow: true },
                  { feature: "Natural Language Builder", kiln: true, bolt: true, zapier: false, voice: false, webflow: false },
                  { feature: "Embed-Widget", kiln: true, bolt: false, zapier: false, voice: true, webflow: false },
                  { feature: "All-in-One Plattform", kiln: true, bolt: false, zapier: false, voice: false, webflow: false },
                ].map((row) => (
                  <tr key={row.feature} className="border-b border-white/[0.04]">
                    <td className="py-3 pr-6 text-[13px] text-neutral-300">{row.feature}</td>
                    {[row.kiln, row.bolt, row.zapier, row.voice, row.webflow].map((v, i) => (
                      <td key={i} className="py-3 text-center">
                        {v ? (
                          <Check className={`mx-auto h-4 w-4 ${i === 0 ? "text-[#F97316]" : "text-neutral-500"}`} />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-neutral-700" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* ── Pricing ─────────────────────────────────────────── */}
      <Section id="pricing" className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[#F97316]">Pricing</p>
            <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">Einfache, faire Preise</h2>
            <p className="mt-4 text-neutral-400">Starte kostenlos. Upgrade wenn du wächst.</p>

            {/* Toggle */}
            <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] p-1">
              <button
                onClick={() => setAnnual(false)}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${!annual ? "bg-white text-[#0C0A09]" : "text-neutral-400"}`}
              >
                Monatlich
              </button>
              <button
                onClick={() => setAnnual(true)}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${annual ? "bg-white text-[#0C0A09]" : "text-neutral-400"}`}
              >
                Jährlich
                <span className="ml-1.5 text-[10px] text-[#22C55E]">-20%</span>
              </button>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                name: "Free", price: 0, features: [
                  "1 AI Agent", "100 Chats / Monat", "1 Knowledge Base (5 MB)", "Embed-Widget", "KILN Branding", "Community Support",
                ], highlight: false,
              },
              {
                name: "Pro", price: annual ? 39 : 49, features: [
                  "10 AI Agents", "Unbegrenzte Chats", "10 Knowledge Bases (50 MB)", "Alle Actions", "White-Label (kein KILN Logo)", "Priority Support", "Analytics Dashboard", "Custom Domain",
                ], highlight: true,
              },
              {
                name: "Agency", price: annual ? 119 : 149, features: [
                  "Unbegrenzte Agents", "Unbegrenzte Chats", "Unbegrenzte Knowledge Bases", "Alle Actions + API Zugriff", "Komplettes White-Label", "Dedicated Support", "Multi-Client Management", "Webhook & Integrationen", "SLA 99.9%",
                ], highlight: false,
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-2xl border p-6 ${
                  plan.highlight
                    ? "border-[#F97316]/30 bg-[#F97316]/[0.03]"
                    : "border-white/[0.06] bg-white/[0.02]"
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-semibold text-white" style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}>
                    Beliebteste
                  </div>
                )}
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="font-serif text-4xl">€{plan.price}</span>
                  <span className="text-sm text-neutral-500">{plan.price === 0 ? "für immer" : "/Monat"}</span>
                </div>
                <ul className="mt-6 flex-1 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-neutral-400">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#F97316]" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/sign-up"
                  className={`mt-8 block rounded-xl py-2.5 text-center text-sm font-medium transition-all hover:brightness-110 ${
                    plan.highlight
                      ? "text-white"
                      : "border border-white/10 text-white hover:bg-white/[0.04]"
                  }`}
                  style={plan.highlight ? { background: "linear-gradient(135deg, #F97316, #DC2626)" } : undefined}
                >
                  {plan.price === 0 ? "Kostenlos starten" : `${plan.name} wählen`}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Roadmap ─────────────────────────────────────────── */}
      <Section id="roadmap" className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-3xl px-6">
          <div className="mb-20 text-center">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-[#F97316]">Roadmap</p>
            <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">Was kommt als nächstes</h2>
          </div>

          <div className="relative space-y-0">
            {/* Vertical line */}
            <div className="absolute left-[19px] top-2 bottom-2 w-px bg-gradient-to-b from-[#F97316] via-white/10 to-transparent" />

            {[
              { phase: "Phase 1", title: "AI Agent Studio", badge: "In Arbeit", badgeColor: "#F97316", items: ["Conversational Builder", "RAG Knowledge Base", "Actions & Lead-Scoring", "Embed-Widget & Templates", "White-Label & Analytics"] },
              { phase: "Phase 2", title: "Site Builder", badge: "Q3 2026", badgeColor: "#3B82F6", items: ["Natural Language Design", "Custom Domains + SSL", "Agent Integration", "SEO-Optimierung"] },
              { phase: "Phase 3", title: "Flow Engine", badge: "Q4 2026", badgeColor: "#22C55E", items: ["Visual Flow Builder", "100+ Integrationen", "Multi-Step Automations", "Webhook & API Triggers"] },
              { phase: "Phase 4", title: "Scale & Enterprise", badge: "2027", badgeColor: "#A78BFA", items: ["Multi-Tenant / Agencies", "Custom LLM Models", "On-Premise Option", "Enterprise SLA"] },
            ].map((p, i) => (
              <div key={p.phase} className="relative flex gap-6 pb-12 last:pb-0">
                {/* Dot */}
                <div className={`relative z-10 mt-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${i === 0 ? "border-[#F97316] bg-[#F97316]/10" : "border-white/10 bg-[#141211]"}`}>
                  <span className={`text-xs font-bold ${i === 0 ? "text-[#F97316]" : "text-neutral-500"}`}>{i + 1}</span>
                </div>
                {/* Content */}
                <div className="pt-0.5">
                  <div className="mb-2 flex items-center gap-3">
                    <h3 className="font-semibold">{p.phase}: {p.title}</h3>
                    <span className="rounded-full px-2.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${p.badgeColor}15`, color: p.badgeColor }}>
                      {p.badge}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {p.items.map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-neutral-500">
                        <span className="h-1 w-1 rounded-full" style={{ backgroundColor: p.badgeColor }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Final CTA ───────────────────────────────────────── */}
      <Section className="border-t border-white/[0.06] py-28">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">
            Ready to build?
          </h2>
          <p className="mt-4 text-neutral-400">
            Starte kostenlos. Kein Code. Keine Kreditkarte.
          </p>

          <div className="mx-auto mt-10 max-w-md">
            {submitted === "cta" ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-[#22C55E]/20 bg-[#22C55E]/5 px-6 py-3.5 text-sm text-[#22C55E]">
                <Check className="h-4 w-4" />
                Du bist auf der Waitlist!
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleWaitlist("cta", ctaEmail);
                }}
                className="flex gap-2"
              >
                <input
                  type="email"
                  value={ctaEmail}
                  onChange={(e) => setCtaEmail(e.target.value)}
                  placeholder="deine@email.de"
                  required
                  className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:border-[#F97316]/50 focus:outline-none focus:ring-1 focus:ring-[#F97316]/30"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium text-white transition-all hover:brightness-110 disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Beitreten <ArrowRight className="h-3.5 w-3.5" /></>}
                </button>
              </form>
            )}
          </div>

          <p className="mt-12 text-xs text-neutral-600">
            Built with{" "}
            <span className="text-[#F97316]">&#x1f525;</span>{" "}
            in Germany.
          </p>
        </div>
      </Section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded font-serif text-[10px] font-bold text-white" style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}>K</div>
            <span className="font-serif text-sm">KILN</span>
            <span className="text-xs text-neutral-600">by Hephaistos Systems</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-neutral-600">
            <a href="mailto:hello@getkiln.com" className="transition-colors hover:text-neutral-300">Kontakt</a>
            <span>&copy; {new Date().getFullYear()} Hephaistos Systems</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
