"use client";

/**
 * Features — six killer features in a 2×3 grid (NOT 30 cards). The
 * second card (White-Label Sub-Orgs) is highlighted as the agency
 * USP with a brighter border tint.
 */
import { Brain, Building2, Key, MessageSquare, Plug, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    icon: Workflow,
    title: "Multi-Agent Workflows",
    body:
      "Visual drag-and-drop editor. Compose agents that talk to each other. 18+ node types including Computer Use, RAG, conditional logic.",
    usp: false,
  },
  {
    icon: Building2,
    title: "White-Label Sub-Orgs",
    body:
      "Per-client workspaces. Custom domain. Custom branding. Your clients see “PoweredByAcme.ai”, not KILN. You own the relationship.",
    usp: true,
  },
  {
    icon: MessageSquare,
    title: "Multi-Channel Deployment",
    body:
      "Voice (phone), WhatsApp, Email, Web-chat — one agent, every channel. Switch channels mid-conversation without losing context.",
    usp: false,
  },
  {
    icon: Brain,
    title: "Self-Learning Knowledge Base",
    body:
      "Upload docs once. Agents learn from interactions and suggest knowledge updates automatically. Less manual maintenance.",
    usp: false,
  },
  {
    icon: Key,
    title: "Bring Your Own Keys (BYOK)",
    body:
      "Use your client’s Anthropic / OpenAI / Gemini key. They pay API costs directly. You keep 100% of the margin on your service.",
    usp: false,
  },
  {
    icon: Plug,
    title: "MCP + A2A Protocol",
    body:
      "Connect to 500+ tools via Model Context Protocol. Agent-to-Agent communication via Google’s open standard. No tool is off-limits.",
    usp: false,
  },
];

export function FeaturesSection() {
  return (
    <section
      id="features"
      aria-label="Features"
      className="border-y border-border/40 bg-card/30 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            What You Get
          </p>
          <h2 className="mt-3 font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
            Everything you need to run an AI agency
          </h2>
        </div>
        <div className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className={cn(
                "group relative rounded-2xl border bg-card p-6 transition-all duration-200",
                f.usp
                  ? "border-kiln-orange/40 bg-kiln-orange/[0.03] hover:border-kiln-orange/60 hover:shadow-lg hover:shadow-kiln-orange/10"
                  : "border-border hover:border-foreground/20 hover:-translate-y-0.5",
              )}
            >
              {f.usp && (
                <span className="absolute -top-2.5 left-6 inline-flex items-center rounded-full bg-kiln-orange px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow">
                  Agency USP
                </span>
              )}
              <div
                className={cn(
                  "mb-4 flex h-10 w-10 items-center justify-center rounded-xl",
                  f.usp ? "bg-kiln-orange/15" : "bg-muted",
                )}
              >
                <f.icon
                  className={cn(
                    "h-5 w-5",
                    f.usp ? "text-kiln-orange" : "text-muted-foreground",
                  )}
                />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
