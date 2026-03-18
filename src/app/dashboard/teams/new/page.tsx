"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Headphones,
  Loader2,
  PenTool,
  Sparkles,
  Users,
  Wrench,
  Building2,
  GraduationCap,
  CookingPot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

type TemplateAgent = {
  key: string;
  name: string;
  role: "HEAD" | "COORDINATOR" | "EXECUTOR" | "REPORTER" | "APPROVAL_GATE";
  agentMode: "CHAT" | "TASK";
};

type TemplateConnection = {
  from: string;
  to: string;
  condition: string;
};

type TemplateSummary = {
  id: string;
  name: string;
  description: string;
  category: string;
  industry?: string;
  agentCount: number;
  agents: TemplateAgent[];
  orchestration: {
    mode: string;
    description: string;
    connections: TemplateConnection[];
  };
};

const TEMPLATE_VISUALS: Record<
  string,
  { icon: typeof Briefcase; accent: string; bg: string; border: string; ring: string }
> = {
  "sales-pipeline": {
    icon: Briefcase,
    accent: "text-kiln-orange",
    bg: "bg-kiln-orange/10",
    border: "border-kiln-orange/25",
    ring: "ring-kiln-orange/30",
  },
  "customer-support-tiers": {
    icon: Headphones,
    accent: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/25",
    ring: "ring-blue-500/30",
  },
  "content-creation-pipeline": {
    icon: PenTool,
    accent: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/25",
    ring: "ring-emerald-500/30",
  },
  "lead-qualification-booking": {
    icon: CalendarDays,
    accent: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/25",
    ring: "ring-violet-500/30",
  },
  "shk-betrieb-lead-pipeline": {
    icon: Wrench,
    accent: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
    ring: "ring-amber-500/30",
  },
  "immobilienmakler-pipeline": {
    icon: Building2,
    accent: "text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/25",
    ring: "ring-sky-500/30",
  },
  "coach-erstgespraech-pipeline": {
    icon: GraduationCap,
    accent: "text-pink-400",
    bg: "bg-pink-500/10",
    border: "border-pink-500/25",
    ring: "ring-pink-500/30",
  },
  "kuechenstudio-pipeline": {
    icon: CookingPot,
    accent: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/25",
    ring: "ring-rose-500/30",
  },
};

const INDUSTRY_FILTERS = [
  { key: "Alle", label: "Alle" },
  { key: "Handwerk", label: "Handwerk" },
  { key: "Immobilien", label: "Immobilien" },
  { key: "Beratung", label: "Beratung" },
  { key: "E-Commerce", label: "E-Commerce" },
  { key: "Allgemein", label: "Allgemein" },
];

const INDUSTRY_OPTIONS = [
  "SaaS",
  "Agency",
  "Ecommerce",
  "Healthcare",
  "Education",
  "Real Estate",
  "Finance",
  "Professional Services",
  "Other",
];

const ROLE_LABELS: Record<TemplateAgent["role"], string> = {
  HEAD: "Head",
  COORDINATOR: "Coordinator",
  EXECUTOR: "Executor",
  REPORTER: "Reporter",
  APPROVAL_GATE: "Approval Gate",
};

function TemplateFlowPreview({
  agents,
  connections,
  compact = false,
}: {
  agents: TemplateAgent[];
  connections: TemplateConnection[];
  compact?: boolean;
}) {
  const nameByKey = useMemo(
    () => Object.fromEntries(agents.map((agent) => [agent.key, agent.name])),
    [agents]
  );

  return (
    <div className="space-y-3">
      <div className={cn("flex flex-wrap items-center gap-2", compact && "gap-1.5")}>
        {agents.map((agent, index) => (
          <div key={agent.key} className="contents">
            <div
              className={cn(
                "rounded-full border border-border bg-background/70 px-3 py-1.5",
                compact ? "text-[10px]" : "text-xs"
              )}
            >
              <span className="font-medium text-foreground">{agent.name}</span>
              <span className="ml-2 text-muted-foreground">
                {agent.role === "APPROVAL_GATE"
                  ? "Approval"
                  : agent.agentMode === "CHAT"
                    ? "Chat"
                    : "Task"}
              </span>
            </div>
            {index < agents.length - 1 && (
              <ArrowRight className={cn("text-muted-foreground/60", compact ? "h-3 w-3" : "h-4 w-4")} />
            )}
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        {connections.map((connection) => (
          <div
            key={`${connection.from}-${connection.to}`}
            className="rounded-lg border border-border/70 bg-background/50 px-3 py-2 text-[11px] text-muted-foreground"
          >
            <span className="font-medium text-foreground">{nameByKey[connection.from]}</span>
            <span className="mx-1.5 text-muted-foreground/50">→</span>
            <span className="font-medium text-foreground">{nameByKey[connection.to]}</span>
            <span className="mx-2 text-muted-foreground/40">•</span>
            <span>{connection.condition}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function NewTeamTemplatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [industryFilter, setIndustryFilter] = useState("Alle");
  const [deploying, setDeploying] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("SaaS");
  const [customIndustry, setCustomIndustry] = useState("");
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/teams/templates");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load team templates");
      }
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load team templates:", err);
      toast("Failed to load team templates", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    if (!templates.length) return;

    const requestedTemplate = searchParams.get("template");
    const hasRequestedTemplate = requestedTemplate
      ? templates.some((template) => template.id === requestedTemplate)
      : false;

    setSelectedTemplateId((current) => {
      if (current && templates.some((template) => template.id === current)) {
        return current;
      }
      if (hasRequestedTemplate && requestedTemplate) {
        return requestedTemplate;
      }
      return templates[0].id;
    });
  }, [searchParams, templates]);

  const selectedTemplate = templates.find(
    (template) => template.id === selectedTemplateId
  );

  useEffect(() => {
    if (!selectedTemplate) return;
    setAgentNames(
      Object.fromEntries(
        selectedTemplate.agents.map((agent) => [agent.key, agent.name])
      )
    );
  }, [selectedTemplate]);

  const filteredTemplates = useMemo(
    () =>
      industryFilter === "Alle"
        ? templates
        : templates.filter((t) => t.industry === industryFilter),
    [templates, industryFilter]
  );

  const resolvedIndustry =
    industry === "Other" ? customIndustry.trim() : industry.trim();
  const teamPreviewName = selectedTemplate
    ? businessName.trim()
      ? `${businessName.trim()} ${selectedTemplate.name}`
      : selectedTemplate.name
    : "Team Template";

  async function deployTemplate() {
    if (!selectedTemplate) return;

    setDeploying(true);
    try {
      const res = await fetch("/api/teams/from-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          customization: {
            teamName: teamPreviewName,
            businessName: businessName.trim() || undefined,
            industry: resolvedIndustry || undefined,
            agentNames,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to deploy team");
      }

      toast(`Team "${data.teamName}" deployed`);
      router.push(data.detailUrl || `/dashboard/teams/${data.teamId}`);
    } catch (err) {
      console.error("Failed to deploy team template:", err);
      toast(
        err instanceof Error ? err.message : "Failed to deploy team template",
        "error"
      );
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link
          href="/dashboard/teams"
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Teams
        </Link>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-kiln-orange/20 bg-kiln-orange/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-kiln-orange">
            <Sparkles className="h-3.5 w-3.5" />
            One-Click Team Templates
          </div>
          <h1 className="font-serif text-3xl text-foreground">
            Deploy Multi-Agent Workflows in One Click
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Choose a proven team template, adapt it to your business and industry,
            and KILN will create the full team, all agents, and the orchestration
            links for you.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card/50 px-4 py-3 text-sm text-muted-foreground">
          Agents deploy in draft mode so you can test immediately before going live.
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-border bg-card/50">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Choose a Template
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Each template includes pre-written prompts, actions, and orchestration flow.
                </p>
              </div>
            </div>

            {/* Industry filter chips */}
            <div className="flex flex-wrap gap-2">
              {INDUSTRY_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setIndustryFilter(filter.key)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                    industryFilter === filter.key
                      ? "border-kiln-orange/40 bg-kiln-orange/10 text-kiln-orange"
                      : "border-border bg-background/50 text-muted-foreground hover:border-foreground/15 hover:text-foreground"
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {filteredTemplates.map((template) => {
                const visual =
                  TEMPLATE_VISUALS[template.id] || TEMPLATE_VISUALS["sales-pipeline"];
                const Icon = visual.icon;
                const isSelected = template.id === selectedTemplateId;

                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={cn(
                      "rounded-2xl border bg-card/70 p-5 text-left transition-all duration-200 hover:bg-card",
                      visual.border,
                      isSelected
                        ? `ring-2 ${visual.ring} shadow-[0_0_0_1px_rgba(255,255,255,0.04)]`
                        : "border-border hover:border-foreground/15"
                    )}
                  >
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div
                        className={cn(
                          "flex h-12 w-12 items-center justify-center rounded-2xl",
                          visual.bg
                        )}
                      >
                        <Icon className={cn("h-5 w-5", visual.accent)} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        {template.industry && template.industry !== "Allgemein" && (
                          <div className={cn("rounded-full px-2.5 py-1 text-[10px] font-medium", visual.bg, visual.accent)}>
                            {template.industry}
                          </div>
                        )}
                        <div className="rounded-full border border-border bg-background/70 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                          {template.agentCount} agents
                        </div>
                      </div>
                    </div>

                    <h3 className="text-lg font-semibold text-foreground">
                      {template.name}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {template.description}
                    </p>

                    <div className="mt-4">
                      <TemplateFlowPreview
                        agents={template.agents}
                        connections={template.orchestration.connections}
                        compact
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-4">
            {selectedTemplate ? (
              <div className="rounded-2xl border border-border bg-card/80 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">
                      Customize {selectedTemplate.name}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Tune the team to your business, then deploy the full workflow.
                    </p>
                  </div>
                  <div className="rounded-full border border-kiln-orange/20 bg-kiln-orange/10 px-3 py-1 text-[11px] font-medium text-kiln-orange">
                    Ready to Deploy
                  </div>
                </div>

                <div className="mt-6 space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Business Name
                      </span>
                      <input
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="Acme Labs"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/30"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Industry
                      </span>
                      <select
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value)}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/30"
                      >
                        {INDUSTRY_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {industry === "Other" && (
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Custom Industry
                      </span>
                      <input
                        value={customIndustry}
                        onChange={(e) => setCustomIndustry(e.target.value)}
                        placeholder="Manufacturing"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/30"
                      />
                    </label>
                  )}

                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-medium text-foreground">
                        Agent Names
                      </h3>
                    </div>
                    <div className="space-y-3">
                      {selectedTemplate.agents.map((agent) => (
                        <label key={agent.key} className="block">
                          <span className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              {ROLE_LABELS[agent.role]} ·{" "}
                              {agent.role === "APPROVAL_GATE"
                                ? "Human Approval Gate"
                                : agent.agentMode === "CHAT"
                                  ? "Chat Agent"
                                  : "Task Agent"}
                            </span>
                            <span className="text-[11px] text-foreground/80">
                              {agent.name}
                            </span>
                          </span>
                          <input
                            value={agentNames[agent.key] ?? ""}
                            onChange={(e) =>
                              setAgentNames((current) => ({
                                ...current,
                                [agent.key]: e.target.value,
                              }))
                            }
                            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/30"
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-background/60 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Deployment Preview
                        </p>
                        <h3 className="mt-1 text-lg font-semibold text-foreground">
                          {teamPreviewName}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {selectedTemplate.orchestration.mode}
                          {resolvedIndustry ? ` · ${resolvedIndustry}` : ""}
                        </p>
                      </div>
                      <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                        {selectedTemplate.agentCount} agents ready
                      </div>
                    </div>

                    <div className="mt-4">
                      <TemplateFlowPreview
                        agents={selectedTemplate.agents.map((agent) => ({
                          ...agent,
                          name: agentNames[agent.key] || agent.name,
                        }))}
                        connections={selectedTemplate.orchestration.connections}
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-muted/20 p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-kiln-green" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          What gets created
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          KILN will create the team, all agents, their default actions,
                          and the orchestration rules connecting them. You can test or edit
                          everything right away.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2">
                    <Link
                      href="/dashboard/teams"
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Cancel
                    </Link>
                    <Button onClick={deployTemplate} disabled={deploying}>
                      {deploying ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Deploying Team
                        </>
                      ) : (
                        <>
                          Deploy Team
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
                <Sparkles className="mx-auto h-8 w-8 text-kiln-orange" />
                <h2 className="mt-4 text-lg font-semibold text-foreground">
                  Choose a template to continue
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Select one of the team templates on the left to customize and deploy it.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
