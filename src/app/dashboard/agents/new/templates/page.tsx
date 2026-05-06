"use client";

/**
 * Phase 1 Templates browse page for the agent-creation flow.
 *
 * Mock catalog of 6 starter templates spanning the most common agency
 * use-cases. Each card routes to the existing wizard at
 * /dashboard/agents/new?template=<id> — the wizard ignores unknown
 * template IDs today (falls through to the empty goal step), so the
 * link is forward-compatible with the real catalog when it lands.
 *
 * The separate /dashboard/agents/templates page is the legacy template
 * route and uses the in-repo agent-templates lib; keep it untouched
 * for now. This page is the new entry from /dashboard/agents/new and
 * leans on simpler mock data for Phase 1.
 */
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Phone,
  MessageSquare,
  ClipboardList,
  FileText,
  Mail,
  CalendarCheck,
  type LucideIcon,
} from "lucide-react";

type Template = {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  useCase: string;
};

const TEMPLATES: Template[] = [
  {
    id: "voice-receptionist",
    icon: Phone,
    title: "Voice Receptionist",
    description: "Answers incoming calls, schedules appointments.",
    useCase: "General",
  },
  {
    id: "chat-support",
    icon: MessageSquare,
    title: "Chat Customer Support",
    description: "Answers FAQs on your website, escalates when stuck.",
    useCase: "General",
  },
  {
    id: "lead-qualifier",
    icon: ClipboardList,
    title: "Lead Qualifier",
    description: "Qualifies cold leads via WhatsApp before a sales call.",
    useCase: "General",
  },
  {
    id: "document-processor",
    icon: FileText,
    title: "Document Processor",
    description: "Categorizes invoices, contracts, and other documents.",
    useCase: "Tax / Legal",
  },
  {
    id: "email-auto-responder",
    icon: Mail,
    title: "Email Auto-Responder",
    description: "Sorts incoming emails by category and drafts replies.",
    useCase: "General",
  },
  {
    id: "booking-assistant",
    icon: CalendarCheck,
    title: "Booking Assistant",
    description: "Books slots in Cal.com or Calendly via chat or call.",
    useCase: "General",
  },
];

const USE_CASE_PILL: Record<string, string> = {
  General: "bg-muted text-muted-foreground",
  "Tax / Legal": "bg-blue-500/10 text-blue-600",
};

export default function NewAgentTemplatesPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href="/dashboard/agents/new"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to creation options
      </Link>

      <header className="mb-8">
        <h1 className="font-serif text-2xl text-foreground">
          Start from a template
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pre-built configurations for the most common agency use-cases.
          Each template prefills the wizard so you only adjust what
          matters.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((template) => (
          <TemplateCard key={template.id} template={template} />
        ))}
      </div>
    </div>
  );
}

function TemplateCard({ template }: { template: Template }) {
  const pillClass = USE_CASE_PILL[template.useCase] ?? USE_CASE_PILL.General;
  return (
    <Link
      href={`/dashboard/agents/new?template=${template.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:border-kiln-orange/40 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <template.icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${pillClass}`}
        >
          {template.useCase}
        </span>
      </div>

      <div>
        <h3 className="text-base font-semibold text-foreground">
          {template.title}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {template.description}
        </p>
      </div>

      <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-kiln-orange transition-transform group-hover:translate-x-0.5">
        Use this template <ArrowRight className="h-3 w-3" />
      </span>
    </Link>
  );
}
