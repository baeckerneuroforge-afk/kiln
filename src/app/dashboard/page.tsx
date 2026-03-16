import { Bot, Globe, Zap, ArrowRight } from "lucide-react";
import Link from "next/link";
import { GettingStartedBanner } from "@/components/getting-started-banner";

const modules = [
  {
    title: "AI Agent Studio",
    description: "Create intelligent chat agents with custom knowledge bases.",
    icon: Bot,
    href: "/dashboard/agents",
    color: "from-kiln-orange/20 to-kiln-ember/10",
    iconColor: "text-kiln-orange",
    borderColor: "border-kiln-orange/20",
    active: true,
  },
  {
    title: "Site Builder",
    description: "Generate websites and landing pages with natural language.",
    icon: Globe,
    href: "/dashboard/sites",
    color: "from-kiln-blue/20 to-kiln-blue/5",
    iconColor: "text-kiln-blue",
    borderColor: "border-kiln-blue/20",
    active: false,
  },
  {
    title: "Flow Engine",
    description: "Automate workflows with AI-powered automations.",
    icon: Zap,
    href: "/dashboard/flows",
    color: "from-kiln-green/20 to-kiln-green/5",
    iconColor: "text-kiln-green",
    borderColor: "border-kiln-green/20",
    active: false,
  },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-5xl">
      {/* Getting Started Banner (shows only for new users with 0 agents) */}
      <GettingStartedBanner />

      {/* Header */}
      <div className="mb-8">
        <h1 className="font-serif text-3xl text-foreground">
          Welcome to KILN
        </h1>
        <p className="mt-2 text-muted-foreground">
          Create AI Agents, Websites & Workflows — all in one place.
        </p>
      </div>

      {/* Module Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {modules.map((mod) => (
          <Link
            key={mod.title}
            href={mod.href}
            className={`group relative overflow-hidden rounded-xl border ${mod.borderColor} bg-card p-6 transition-all hover:border-opacity-50 hover:shadow-lg ${
              !mod.active ? "opacity-60" : ""
            }`}
          >
            {/* Gradient Hintergrund */}
            <div
              className={`absolute inset-0 bg-gradient-to-br ${mod.color} opacity-50`}
            />

            <div className="relative">
              <div className="mb-4 flex items-center justify-between">
                <mod.icon className={`h-8 w-8 ${mod.iconColor}`} />
                {!mod.active && (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    Coming Soon
                  </span>
                )}
              </div>
              <h2 className="mb-1 text-lg font-semibold text-foreground">
                {mod.title}
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">
                {mod.description}
              </p>
              {mod.active && (
                <div className="flex items-center gap-1 text-sm font-medium text-primary transition-colors group-hover:text-primary/80">
                  Start
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Stats Placeholder */}
      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {[
          { label: "Agents", value: "0" },
          { label: "Conversations", value: "0" },
          { label: "Leads", value: "0" },
          { label: "Est. Value", value: "€0" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border bg-card p-4"
          >
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
