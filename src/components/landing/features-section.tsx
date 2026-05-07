"use client";

/**
 * Features — 18 features in 3 tiers.
 *
 * Tier 1 (4 large cards, 2×2 grid): killer USPs with full mockups
 *   and drill-down links to /features/[slug] sub-pages.
 * Tier 2 (8 medium cards, 4×2 grid): power features for serious
 *   agencies — described but no individual sub-page.
 * Tier 3 (6 small cards, 3×2 grid): trust anchors — production
 *   readiness signals, one-line each.
 *
 * Cards lift on hover with a subtle kiln-orange border tint. Tier 1
 * cards have a richer hover (scale + shadow). The grid uses density
 * deliberately — eighteen items reads as "fully loaded" rather than
 * "minimal SaaS landing".
 */
import Link from "next/link";
import {
  ArrowRight,
  Brain,
  Building2,
  Cpu,
  Database,
  FileCheck,
  Gauge,
  GitBranch,
  Globe,
  History,
  Key,
  Layers,
  MessageSquare,
  Phone,
  Plug,
  Receipt,
  ScrollText,
  Shield,
  Target,
  UserCheck,
  Webhook,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TiltCard } from "./tilt-card";
import { FloatingElement } from "./floating-element";

interface Tier1Feature {
  icon: LucideIcon;
  title: string;
  body: string;
  href: string;
  preview: React.ReactNode;
}

const TIER_1: Tier1Feature[] = [
  {
    icon: Workflow,
    title: "Multi-Agent Workflows",
    body:
      "Visual drag-and-drop editor. 18+ node types. Compose agents that talk to each other. Conditional logic. Parallel execution. Built for serious orchestration.",
    href: "/features/multi-agent-workflows",
    preview: <WorkflowPreview />,
  },
  {
    icon: Building2,
    title: "White-Label Sub-Orgs",
    body:
      "One platform, every client gets their own workspace. Custom domain. Custom branding. Full data isolation. Your client sees ai.theirbrand.com — never KILN.",
    href: "/features/white-label-sub-orgs",
    preview: <SubOrgsPreview />,
  },
  {
    icon: MessageSquare,
    title: "Multi-Channel Deployment",
    body:
      "Voice (phone), WhatsApp, Email, Web-chat — one agent, every channel. Switch channels mid-conversation without losing context. Built on Twilio + Vonage.",
    href: "/features/multi-channel",
    preview: <ChannelsPreview />,
  },
  {
    icon: Plug,
    title: "BYOK + MCP + A2A",
    body:
      "Bring your client's API keys. Connect 500+ tools via MCP. Agent-to-Agent protocol via Google's open standard. No vendor lock-in. No tool is off-limits.",
    href: "/features/byok-mcp-a2a",
    preview: <BYOKPreview />,
  },
];

interface Tier2Feature {
  icon: LucideIcon;
  title: string;
  body: string;
  accent: "violet" | "blue" | "green" | "amber";
  href?: string;
}

const TIER_2: Tier2Feature[] = [
  {
    icon: Brain,
    title: "Self-Learning Knowledge Base",
    body:
      "Agents learn from interactions. Suggest knowledge updates automatically. Less manual maintenance, smarter agents over time.",
    accent: "violet",
    href: "/features/self-learning-rag",
  },
  {
    icon: Layers,
    title: "Agent Teams (Hierarchical)",
    body:
      "Head → Coordinator → Executor patterns. Compose hierarchical teams that work autonomously on complex tasks.",
    accent: "violet",
  },
  {
    icon: Database,
    title: "Agent Memory (Persistent)",
    body:
      "Agents remember visitors across sessions. Personalized conversations. Context that builds over time.",
    accent: "violet",
  },
  {
    icon: Receipt,
    title: "Stripe-Connect Billing",
    body:
      "Built-in agency billing. Charge sub-orgs monthly. One Stripe account, N client subscriptions. Auto-invoicing.",
    accent: "green",
    href: "/features/agency-billing",
  },
  {
    icon: Globe,
    title: "Custom Domains per Sub-Org",
    body:
      "ai.acme-corp.com instead of acme.kilnbase.com. Full DNS control. SSL automated. Your brand or theirs.",
    accent: "blue",
  },
  {
    icon: Target,
    title: "Lead Scoring & Actions",
    body:
      "Score leads automatically. Trigger emails, webhooks, or CRM updates. Built-in funnel logic.",
    accent: "amber",
  },
  {
    icon: UserCheck,
    title: "Approval Workflows",
    body:
      "Human-in-the-loop gates. Agents pause before critical actions. Full control, zero risk.",
    accent: "amber",
  },
  {
    icon: ScrollText,
    title: "Audit Trail (GDPR)",
    body:
      "Complete history of every action, decision, data access. 1-year retention. GDPR-ready audit logs.",
    accent: "blue",
  },
];

interface Tier3Feature {
  icon: LucideIcon;
  title: string;
}

const TIER_3: Tier3Feature[] = [
  { icon: Shield, title: "EU-hosted + GDPR-native" },
  { icon: Key, title: "RBAC: 5 Roles built-in" },
  { icon: Gauge, title: "SLA Monitoring + Uptime" },
  { icon: Cpu, title: "Real-time Cost Controls" },
  { icon: Webhook, title: "Webhooks + REST API" },
  { icon: History, title: "Version Control for Agents" },
];

export function FeaturesSection() {
  return (
    <section
      id="features"
      aria-label="Features"
      className="relative isolate border-y border-border/40 bg-card/30 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Everything You Need
          </p>
          <h2 className="mt-3 font-serif text-3xl tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Built for agencies that ship AI to production
          </h2>
        </div>

        {/* ── Tier 1: killer USPs ────────────────────────────── */}
        <div className="mt-14 grid gap-5 lg:grid-cols-2">
          {TIER_1.map((f) => (
            <Tier1Card key={f.title} feature={f} />
          ))}
        </div>

        {/* ── Tier 2: power features ──────────────────────────── */}
        <div className="mt-20">
          <h3 className="mb-6 text-center text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Built for serious agencies
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TIER_2.map((f) => (
              <Tier2Card key={f.title} feature={f} />
            ))}
          </div>
        </div>

        {/* ── Tier 3: trust anchors ───────────────────────────── */}
        <div className="mt-16">
          <h3 className="mb-5 text-center text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Production-ready infrastructure
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {TIER_3.map((f) => (
              <div
                key={f.title}
                className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-4 py-3 transition-colors hover:border-foreground/20"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <f.icon className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
                <span className="text-sm text-foreground">{f.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Tier1Card({ feature }: { feature: Tier1Feature }) {
  return (
    <TiltCard maxTilt={5} perspective={1000} scale={1.015} className="h-full">
      <Link
        href={feature.href}
        data-testid="tier1-card"
        className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-6 transition-[box-shadow,border-color] duration-300 hover:border-kiln-orange/40 hover:shadow-xl hover:shadow-kiln-orange/10"
      >
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-kiln-orange/10">
          <feature.icon className="h-5 w-5 text-kiln-orange" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {feature.body}
        </p>

        <FloatingElement intensity={4} className="mt-5">
          <div className="rounded-xl border border-border bg-background/40 p-4">
            {feature.preview}
          </div>
        </FloatingElement>

        <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-kiln-orange">
          Learn more
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>
    </TiltCard>
  );
}

const TIER2_ACCENTS: Record<Tier2Feature["accent"], { bg: string; fg: string }> = {
  violet: { bg: "bg-violet-500/10", fg: "text-violet-400" },
  blue: { bg: "bg-blue-500/10", fg: "text-blue-400" },
  green: { bg: "bg-green-500/10", fg: "text-green-400" },
  amber: { bg: "bg-amber-500/10", fg: "text-amber-400" },
};

function Tier2Card({ feature }: { feature: Tier2Feature }) {
  const tone = TIER2_ACCENTS[feature.accent];
  const inner = (
    <>
      <div
        className={cn(
          "mb-3 flex h-9 w-9 items-center justify-center rounded-lg",
          tone.bg,
        )}
      >
        <feature.icon className={cn("h-4 w-4", tone.fg)} />
      </div>
      <h4 className="text-sm font-semibold text-foreground">{feature.title}</h4>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        {feature.body}
      </p>
    </>
  );
  if (feature.href) {
    return (
      <Link
        href={feature.href}
        className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md"
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20">
      {inner}
    </div>
  );
}

/* ── Tier 1 mockup previews ────────────────────────────────── */

function WorkflowPreview() {
  return (
    <div className="grid grid-cols-3 gap-2 text-[10px]">
      {[
        { label: "Trigger", color: "#F59E0B" },
        { label: "Agent", color: "#F97316" },
        { label: "If/Else", color: "#8B5CF6" },
        { label: "Notion", color: "#22C55E" },
        { label: "Slack", color: "#22C55E" },
        { label: "Webhook", color: "#3B82F6" },
      ].map((n) => (
        <div
          key={n.label}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5"
          style={{ borderColor: `${n.color}40` }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: n.color }}
          />
          <span className="text-foreground">{n.label}</span>
        </div>
      ))}
    </div>
  );
}

function SubOrgsPreview() {
  return (
    <div className="space-y-1.5">
      {[
        { name: "Acme Corp", color: "#F97316", domain: "ai.acme.com" },
        { name: "Beta Studios", color: "#3B82F6", domain: "ai.beta.io" },
        { name: "Gamma Inc", color: "#22C55E", domain: "ai.gamma.co" },
      ].map((b) => (
        <div
          key={b.name}
          className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-[10px]"
        >
          <span
            className="flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold text-white"
            style={{ backgroundColor: b.color }}
          >
            {b.name[0]}
          </span>
          <span className="font-medium text-foreground">{b.name}</span>
          <span className="ml-auto font-mono text-muted-foreground">{b.domain}</span>
        </div>
      ))}
    </div>
  );
}

function ChannelsPreview() {
  return (
    <div className="grid grid-cols-4 gap-2 text-[10px]">
      {[
        { icon: Phone, label: "Voice" },
        { icon: MessageSquare, label: "WhatsApp" },
        { icon: FileCheck, label: "Email" },
        { icon: Globe, label: "Web" },
      ].map((c) => (
        <div
          key={c.label}
          className="flex flex-col items-center gap-1 rounded-md border border-border bg-card py-2"
        >
          <c.icon className="h-3.5 w-3.5 text-kiln-orange" />
          <span className="text-foreground">{c.label}</span>
          <span className="text-[8px] text-green-400">● Live</span>
        </div>
      ))}
    </div>
  );
}

function BYOKPreview() {
  return (
    <div className="space-y-1.5 text-[10px]">
      {[
        { provider: "Anthropic", key: "sk-ant-…" },
        { provider: "OpenAI", key: "sk-…" },
        { provider: "Gemini", key: "AI…" },
      ].map((k) => (
        <div
          key={k.provider}
          className="flex items-center justify-between rounded-md border border-border bg-card px-2.5 py-1.5"
        >
          <div className="flex items-center gap-1.5">
            <Key className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium text-foreground">{k.provider}</span>
          </div>
          <span className="font-mono text-muted-foreground">{k.key}</span>
          <GitBranch className="h-3 w-3 text-green-400" />
        </div>
      ))}
    </div>
  );
}
