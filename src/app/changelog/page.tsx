"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Wrench,
  Bug,
  Zap,
  Brain,
  FlaskConical,
  Wand2,
  Building2,
  ShieldCheck,
  Eye,
  Palette,
  Mail,
  GitFork,
  Code2,
  Plug,
  Layers,
  MessageSquare,
  BookOpen,
  History,
  GitCompare,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ── */

type Category = "Feature" | "Improvement" | "Fix";

interface ChangelogEntry {
  id: string;
  date: string;
  title: string;
  description: string;
  category: Category;
  icon: React.ElementType;
}

/* ── Badge ── */

const categoryColors: Record<Category, string> = {
  Feature: "bg-green-500/10 text-green-400 border-green-500/20",
  Improvement: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Fix: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const categoryIcons: Record<Category, React.ElementType> = {
  Feature: Sparkles,
  Improvement: Wrench,
  Fix: Bug,
};

function CategoryBadge({ category }: { category: Category }) {
  const Icon = categoryIcons[category];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", categoryColors[category])}>
      <Icon className="h-2.5 w-2.5" />
      {category}
    </span>
  );
}

/* ── Entries ── */

const entries: ChangelogEntry[] = [
  {
    id: "workflow-version-control",
    date: "2026-03-19",
    title: "Workflow Version Control & Collaboration",
    description: "Every workflow save creates a version snapshot. Compare any two versions side-by-side with visual diffs — added nodes in green, removed in red, changed in yellow. Rollback to any previous version with one click. Add comments to workflow nodes and see a unified activity feed.",
    category: "Feature",
    icon: GitCompare,
  },
  {
    id: "workflow-templates-gallery",
    date: "2026-03-18",
    title: "Workflow Templates Gallery",
    description: "Browse beautiful workflow templates with mini SVG flow diagrams. Filter by industry, category, and complexity. Preview the full diagram before deploying. Quick action buttons throughout the platform for faster navigation.",
    category: "Feature",
    icon: Layers,
  },
  {
    id: "workflow-engine",
    date: "2026-03-15",
    title: "Workflow Engine with 18+ Node Types",
    description: "Build automated multi-agent pipelines with triggers, logic nodes, actions, and control flow. Support for webhooks, schedules, HTTP requests, email, Slack, delays, conditional branching, and sub-workflows.",
    category: "Feature",
    icon: Zap,
  },
  {
    id: "visual-workflow-editor",
    date: "2026-03-14",
    title: "Visual Workflow Editor",
    description: "Drag-and-drop canvas powered by ReactFlow for building workflows visually. Auto-layout with dagre, mini-map, zoom, and real-time execution visualization with animated node states.",
    category: "Feature",
    icon: Layers,
  },
  {
    id: "agent-memory",
    date: "2026-03-10",
    title: "Agent Conversation Memory",
    description: "Agents now remember returning visitors across sessions. Visitor memory stores key facts, preferences, and context — creating personalized experiences without the user repeating themselves.",
    category: "Feature",
    icon: Brain,
  },
  {
    id: "ab-test-lab",
    date: "2026-03-08",
    title: "A/B Test Lab",
    description: "Compare agent versions side-by-side with statistical significance tracking. Test different prompts, models, and temperatures to find the optimal configuration for your use case.",
    category: "Feature",
    icon: FlaskConical,
  },
  {
    id: "guided-wizard",
    date: "2026-03-05",
    title: "Guided Agent Creation Wizard",
    description: "Create optimized AI agents in 5 steps. Choose your industry, describe what you need, and KILN generates the perfect system prompt, personality, and configuration automatically.",
    category: "Feature",
    icon: Wand2,
  },
  {
    id: "industry-templates",
    date: "2026-03-03",
    title: "Industry Templates",
    description: "One-click deployment for SHK, Immobilien, Coaches, E-Commerce, Legal, Health, and Restaurant industries. Each template includes pre-configured agents, prompts, and knowledge base structure.",
    category: "Feature",
    icon: Building2,
  },
  {
    id: "human-in-the-loop",
    date: "2026-02-28",
    title: "Human-in-the-Loop Approval Gates",
    description: "Add approval gates to automated workflows. When a workflow reaches a critical decision point, it pauses and notifies the assigned approver via email. Approve or reject with one click.",
    category: "Feature",
    icon: ShieldCheck,
  },
  {
    id: "live-preview",
    date: "2026-02-25",
    title: "Live Preview Panel",
    description: "Test agent changes in real-time without saving. The split-screen editor shows your configuration on the left and a live chat preview on the right, updating instantly as you type.",
    category: "Improvement",
    icon: Eye,
  },
  {
    id: "agent-versioning",
    date: "2026-02-22",
    title: "Agent Version Control",
    description: "Every save creates a version snapshot. View full version history, compare changes between versions, and rollback to any previous configuration with a single click.",
    category: "Feature",
    icon: History,
  },
  {
    id: "proactive-widget",
    date: "2026-02-18",
    title: "Proactive Chat Widget",
    description: "Context-aware chat messages that appear based on user behavior. Configure triggers for time-on-page, scroll depth, exit intent, and URL patterns to engage visitors at the right moment.",
    category: "Feature",
    icon: MessageSquare,
  },
  {
    id: "embed-themes",
    date: "2026-02-15",
    title: "4 Embed Themes",
    description: "Choose from Modern, Classic, Minimal, and Playful embed themes. Each theme includes customizable colors, fonts, and animations. Full white-label support for Pro and Agency plans.",
    category: "Feature",
    icon: Palette,
  },
  {
    id: "kb-reports",
    date: "2026-02-10",
    title: "Weekly Knowledge Base Reports",
    description: "Automatic improvement suggestions via email every week. Identifies unanswered questions, knowledge gaps, and trending topics — helping you continuously improve your agent's accuracy.",
    category: "Improvement",
    icon: Mail,
  },
  {
    id: "multi-agent-handoff",
    date: "2026-02-05",
    title: "Multi-Agent Handoff",
    description: "Seamless agent switching in live conversations. When a visitor's needs change, the current agent can hand off to a specialist with full context preserved — no repeated information.",
    category: "Feature",
    icon: GitFork,
  },
  {
    id: "developer-mcp",
    date: "2026-01-30",
    title: "Developer Page & MCP Server",
    description: "Deploy and manage agents directly from Claude Code using our MCP server. Infrastructure as code for AI agents — version control your configurations, automate deployments, and integrate with CI/CD.",
    category: "Feature",
    icon: Code2,
  },
  {
    id: "integrations",
    date: "2026-01-25",
    title: "10+ Integrations",
    description: "Connect Slack, Gmail, Google Calendar, Google Sheets, Notion, Telegram, WhatsApp, GitHub, and more. Each integration adds new capabilities to your agents and workflows.",
    category: "Feature",
    icon: Plug,
  },
];

/* ── Filter ── */

const categories: (Category | "All")[] = ["All", "Feature", "Improvement", "Fix"];

/* ── Page ── */

export default function ChangelogPage() {
  const [filter, setFilter] = useState<Category | "All">("All");

  const filtered = filter === "All" ? entries : entries.filter((e) => e.category === filter);

  // Group by month
  const grouped = new Map<string, ChangelogEntry[]>();
  for (const entry of filtered) {
    const month = new Date(entry.date).toLocaleDateString("en-US", { year: "numeric", month: "long" });
    if (!grouped.has(month)) grouped.set(month, []);
    grouped.get(month)!.push(entry);
  }

  return (
    <div className="min-h-screen bg-[#0C0A09]">
      {/* Header */}
      <header className="border-b border-zinc-800/80 bg-[#0C0A09]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}>
                <span className="font-serif text-sm font-bold text-white">K</span>
              </div>
              <span className="font-serif text-lg">KILN</span>
            </Link>
            <span className="text-zinc-700">/</span>
            <span className="text-sm font-medium text-zinc-300">Changelog</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/docs" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5" />
              API Docs
            </Link>
            <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        {/* Hero */}
        <div className="mb-10">
          <h1 className="font-serif text-4xl text-zinc-100">What&apos;s New</h1>
          <p className="mt-3 text-base text-zinc-500">
            New features, improvements, and fixes shipped to KILN.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-8 flex items-center gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                filter === cat
                  ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                  : "text-zinc-500 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-300"
              )}
            >
              {cat}
            </button>
          ))}
          <span className="ml-auto text-xs text-zinc-600">{filtered.length} entries</span>
        </div>

        {/* Timeline */}
        <div className="space-y-12">
          {Array.from(grouped.entries()).map(([month, monthEntries]) => (
            <div key={month}>
              <h2 className="mb-6 text-sm font-medium uppercase tracking-wider text-zinc-600">
                {month}
              </h2>
              <div className="relative space-y-0">
                {/* Timeline line */}
                <div className="absolute left-[19px] top-4 bottom-4 w-px bg-zinc-800" />

                {monthEntries.map((entry) => {
                  const Icon = entry.icon;
                  return (
                    <div key={entry.id} className="relative flex gap-6 pb-8">
                      {/* Timeline dot */}
                      <div className="relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900">
                        <Icon className="h-4.5 w-4.5 text-zinc-400" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <h3 className="text-base font-semibold text-zinc-100">{entry.title}</h3>
                          <CategoryBadge category={entry.category} />
                        </div>
                        <time className="text-xs text-zinc-600">
                          {new Date(entry.date).toLocaleDateString("en-US", {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </time>
                        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                          {entry.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-16 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-center">
          <p className="text-sm text-zinc-400">
            Have a feature request?{" "}
            <Link href="/help" className="text-orange-400 hover:underline">Let us know</Link>
            {" · "}
            <Link href="/docs" className="text-orange-400 hover:underline">API Docs</Link>
            {" · "}
            <Link href="/developers" className="text-orange-400 hover:underline">Developers</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
