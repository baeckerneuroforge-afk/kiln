"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import {
  Bot,
  Globe,
  Zap,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Sparkles,
  MessageSquare,
  Code2,
  BarChart3,
  Palette,
  Brain,
  Calendar,
} from "lucide-react";

export default function LandingPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/dashboard");
    }
  }, [isLoaded, isSignedIn, router]);

  // Eingeloggte User → Dashboard redirect (zeige nichts während Check)
  if (!isLoaded || isSignedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) setSubmitted(true);
    } catch {
      // Stille Fehlerbehandlung
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <nav className="fixed top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{
                background: "linear-gradient(135deg, #F97316, #DC2626)",
              }}
            >
              K
            </div>
            <span className="font-serif text-xl text-foreground">KILN</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Login
            </Link>
            <Link
              href="/sign-up"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Kostenlos starten
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pt-32 pb-20">
        {/* Glow Effect */}
        <div
          className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2"
          style={{
            width: "800px",
            height: "400px",
            background:
              "radial-gradient(ellipse, rgba(249,115,22,0.08) 0%, transparent 70%)",
          }}
        />

        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-kiln-orange" />
            AI Creation Platform — Jetzt in Early Access
          </div>

          <h1 className="font-serif text-5xl leading-tight text-foreground sm:text-6xl lg:text-7xl">
            Erstelle AI Agents{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, #F97316, #DC2626)",
              }}
            >
              per Sprache.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            KILN ist die Plattform auf der du AI Agents, Websites und Workflows
            in natürlicher Sprache erstellst — und mit einem Klick live
            schaltest. Kein Code nötig.
          </p>

          {/* Waitlist Form */}
          <div className="mx-auto mt-10 max-w-md">
            {submitted ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-kiln-green/30 bg-kiln-green/5 px-6 py-4 text-sm text-kiln-green">
                <CheckCircle2 className="h-5 w-5" />
                Du bist auf der Waitlist! Wir melden uns.
              </div>
            ) : (
              <form
                onSubmit={handleWaitlist}
                className="flex items-center gap-2"
              >
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="deine@email.de"
                  required
                  className="flex-1 rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{
                    background:
                      "linear-gradient(135deg, #F97316, #DC2626)",
                  }}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Waitlist
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Oder{" "}
              <Link href="/sign-up" className="text-primary underline">
                jetzt kostenlos starten
              </Link>{" "}
              — Free Plan verfügbar.
            </p>
          </div>
        </div>
      </section>

      {/* 3 Module */}
      <section className="border-t border-border py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-16 text-center">
            <h2 className="font-serif text-3xl text-foreground sm:text-4xl">
              Drei Module. Eine Plattform.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Alles was du brauchst um dein Business mit AI zu automatisieren.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Bot,
                title: "AI Agent Studio",
                color: "#F97316",
                status: "Live",
                statusColor: "bg-kiln-green/10 text-kiln-green",
                description:
                  "Erstelle intelligente Chat-Agents mit Knowledge Base, Terminbuchung und Lead-Scoring. White-Label-fähig.",
                features: [
                  "Conversational Builder",
                  "RAG Knowledge Base",
                  "7 Pre-built Actions",
                  "Embed-Widget",
                ],
              },
              {
                icon: Globe,
                title: "Site Builder",
                color: "#3B82F6",
                status: "Q3 2026",
                statusColor: "bg-kiln-blue/10 text-kiln-blue",
                description:
                  "Beschreibe deine Website — KILN designt und hosted sie. Mit AI-Chat-Integration und Analytics.",
                features: [
                  "Natural Language Design",
                  "Custom Domains",
                  "SEO optimiert",
                  "Agent Integration",
                ],
              },
              {
                icon: Zap,
                title: "Flow Engine",
                color: "#22C55E",
                status: "Q4 2026",
                statusColor: "bg-kiln-green/10 text-kiln-green",
                description:
                  "Automatisiere Workflows per Sprache. Verbinde CRM, E-Mail, Kalender und mehr.",
                features: [
                  "Visual Flow Builder",
                  "100+ Integrationen",
                  "Trigger & Actions",
                  "Webhook Support",
                ],
              },
            ].map((module) => (
              <div
                key={module.title}
                className="group rounded-2xl border border-border bg-card p-6 transition-all hover:border-border/80 hover:shadow-xl"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${module.color}15` }}
                  >
                    <module.icon
                      className="h-6 w-6"
                      style={{ color: module.color }}
                    />
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${module.statusColor}`}
                  >
                    {module.status}
                  </span>
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">
                  {module.title}
                </h3>
                <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                  {module.description}
                </p>
                <ul className="space-y-2">
                  {module.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <CheckCircle2
                        className="h-3.5 w-3.5"
                        style={{ color: module.color }}
                      />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="border-t border-border py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-16 text-center">
            <h2 className="font-serif text-3xl text-foreground sm:text-4xl">
              So einfach geht&apos;s
            </h2>
            <p className="mt-4 text-muted-foreground">
              In 3 Schritten zum eigenen AI Agent.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                icon: MessageSquare,
                title: "Beschreibe deinen Agent",
                description:
                  "Erzähl KILN was dein Agent tun soll — in deinen eigenen Worten. Branche, Tonalität, Wissen.",
              },
              {
                step: "02",
                icon: Brain,
                title: "KILN konfiguriert alles",
                description:
                  "System-Prompt, Persönlichkeit, Actions und Knowledge Base werden automatisch erstellt.",
              },
              {
                step: "03",
                icon: Code2,
                title: "Embed und live schalten",
                description:
                  "Ein Script-Tag — fertig. Dein Agent chattet auf deiner Website, in deinen Farben.",
              },
            ].map((item) => (
              <div key={item.step} className="relative">
                <div className="mb-4 font-mono text-4xl font-bold text-border">
                  {item.step}
                </div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mb-2 font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Detail */}
      <section className="border-t border-border py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-16 text-center">
            <h2 className="font-serif text-3xl text-foreground sm:text-4xl">
              Alles was dein Agent braucht
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Brain,
                title: "RAG Knowledge Base",
                desc: "PDF, URL, Text oder FAQ hochladen. Dein Agent antwortet mit deinem Wissen.",
              },
              {
                icon: Calendar,
                title: "Terminbuchung",
                desc: "Calendly-Integration. Claude erkennt Buchungswünsche automatisch.",
              },
              {
                icon: BarChart3,
                title: "Lead-Scoring",
                desc: "Automatische Lead-Bewertung (1-10) basierend auf dem Gesprächsverlauf.",
              },
              {
                icon: Palette,
                title: "White-Label",
                desc: "Eigene Farben, Logo und Domain. Dein Brand, nicht unseres.",
              },
              {
                icon: Code2,
                title: "Embed-Widget",
                desc: "Ein Script-Tag. Funktioniert auf jeder Website. Mobile-optimiert.",
              },
              {
                icon: Sparkles,
                title: "Branchen-Templates",
                desc: "Yoga, Immobilien, Coaching, Handwerk, Restaurant — sofort einsatzbereit.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-border bg-card p-5"
              >
                <f.icon className="mb-3 h-5 w-5 text-primary" />
                <h3 className="mb-1 text-sm font-semibold text-foreground">
                  {f.title}
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-border py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-16 text-center">
            <h2 className="font-serif text-3xl text-foreground sm:text-4xl">
              Einfache Preise
            </h2>
            <p className="mt-4 text-muted-foreground">
              Starte kostenlos. Upgrade wenn du wächst.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                name: "Free",
                price: "€0",
                period: "für immer",
                cta: "Kostenlos starten",
                highlight: false,
                features: [
                  "1 AI Agent",
                  "100 Chats/Monat",
                  "1 Knowledge Base (5 MB)",
                  "Embed-Widget",
                  "KILN Branding",
                  "Community Support",
                ],
              },
              {
                name: "Pro",
                price: "€49",
                period: "/Monat",
                cta: "Pro wählen",
                highlight: true,
                features: [
                  "10 AI Agents",
                  "Unbegrenzte Chats",
                  "10 Knowledge Bases (50 MB)",
                  "Alle Actions",
                  "White-Label (kein KILN Logo)",
                  "Priority Support",
                  "Analytics Dashboard",
                  "Custom Domain",
                ],
              },
              {
                name: "Agency",
                price: "€149",
                period: "/Monat",
                cta: "Agency wählen",
                highlight: false,
                features: [
                  "Unbegrenzte Agents",
                  "Unbegrenzte Chats",
                  "Unbegrenzte Knowledge Bases",
                  "Alle Actions + API",
                  "Komplettes White-Label",
                  "Dedicated Support",
                  "Multi-Client Management",
                  "Webhook & Integrationen",
                  "SLA 99.9%",
                ],
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-2xl border p-6 ${
                  plan.highlight
                    ? "border-primary bg-card shadow-xl shadow-primary/5"
                    : "border-border bg-card"
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[10px] font-semibold text-primary-foreground">
                    Beliebteste
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-foreground">
                    {plan.name}
                  </h3>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="font-serif text-4xl text-foreground">
                      {plan.price}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {plan.period}
                    </span>
                  </div>
                </div>
                <ul className="mb-8 flex-1 space-y-3">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/sign-up"
                  className={`block rounded-xl py-2.5 text-center text-sm font-medium transition-opacity hover:opacity-90 ${
                    plan.highlight
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card text-foreground hover:bg-muted"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roadmap */}
      <section className="border-t border-border py-24">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-16 text-center">
            <h2 className="font-serif text-3xl text-foreground sm:text-4xl">
              Roadmap
            </h2>
            <p className="mt-4 text-muted-foreground">
              Was kommt als nächstes.
            </p>
          </div>

          <div className="space-y-6">
            {[
              {
                phase: "Phase 1",
                title: "AI Agent Studio",
                status: "Live",
                color: "#F97316",
                items: [
                  "Conversational Agent Builder",
                  "RAG Knowledge Base",
                  "Actions (Termin, E-Mail, Lead-Scoring)",
                  "Embed-Widget + Public Pages",
                  "White-Label + Templates",
                ],
              },
              {
                phase: "Phase 2",
                title: "Site Builder",
                status: "Q3 2026",
                color: "#3B82F6",
                items: [
                  "Natural Language Website-Erstellung",
                  "Custom Domains + SSL",
                  "SEO-Optimierung",
                  "Agent-Chat Integration",
                ],
              },
              {
                phase: "Phase 3",
                title: "Flow Engine",
                status: "Q4 2026",
                color: "#22C55E",
                items: [
                  "Visual Workflow Builder",
                  "100+ Integrationen (CRM, E-Mail, Kalender)",
                  "Multi-Step Automations",
                  "Webhook + API Triggers",
                ],
              },
            ].map((phase) => (
              <div
                key={phase.phase}
                className="flex gap-6 rounded-xl border border-border bg-card p-6"
              >
                <div className="shrink-0">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-xs font-bold text-white"
                    style={{ backgroundColor: phase.color }}
                  >
                    {phase.phase.slice(-1)}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-3">
                    <h3 className="font-semibold text-foreground">
                      {phase.phase}: {phase.title}
                    </h3>
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[10px] font-medium"
                      style={{
                        backgroundColor: `${phase.color}15`,
                        color: phase.color,
                      }}
                    >
                      {phase.status}
                    </span>
                  </div>
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {phase.items.map((item) => (
                      <li
                        key={item}
                        className="flex items-center gap-2 text-sm text-muted-foreground"
                      >
                        <CheckCircle2
                          className="h-3.5 w-3.5 shrink-0"
                          style={{ color: phase.color }}
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="font-serif text-3xl text-foreground sm:text-4xl">
            Bereit deinen ersten Agent zu erstellen?
          </h2>
          <p className="mt-4 text-muted-foreground">
            Kostenlos starten. Kein Code. Keine Kreditkarte.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, #F97316, #DC2626)",
              }}
            >
              Kostenlos starten
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold text-white"
                style={{
                  background: "linear-gradient(135deg, #F97316, #DC2626)",
                }}
              >
                K
              </div>
              <span className="font-serif text-sm text-foreground">KILN</span>
              <span className="text-xs text-muted-foreground">
                by Hephaistos Systems
              </span>
            </div>
            <div className="flex items-center gap-6 text-xs text-muted-foreground">
              <a href="mailto:hello@getkiln.com" className="hover:text-foreground">
                Kontakt
              </a>
              <span>
                &copy; {new Date().getFullYear()} Hephaistos Systems
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
