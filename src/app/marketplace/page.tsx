"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Search,
  Star,
  Download,
  ArrowRight,
  Loader2,
  X,
  Sparkles,
  Bot,
  Store,
  MessageSquare,
  Zap,
  Users,
  ChevronRight,
  Rocket,
  Filter,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { useUser } from "@clerk/nextjs";

interface Template {
  id: string;
  authorName: string;
  name: string;
  description: string;
  category: string;
  price: number;
  rating: number;
  ratingCount: number;
  downloads: number;
  screenshotUrl: string | null;
  agentConfigSnapshot: {
    welcomeMessage?: string;
    suggestedQuestions?: string[];
    actions?: { type: string; enabled: boolean }[];
    workflowTemplateId?: string;
    teamTemplateId?: string;
    workflowAgents?: { name: string; agentMode: "CHAT" | "TASK" | "APPROVAL"; role?: string }[];
    orchestration?: { mode?: string; description?: string };
  };
  createdAt: string;
}

const categories = [
  { key: "All", label: "Alle", icon: null },
  { key: "Sales", label: "Sales", icon: "💰" },
  { key: "Support", label: "Support", icon: "🎧" },
  { key: "Business", label: "Operations", icon: "⚙️" },
  { key: "Marketing", label: "Marketing", icon: "📣" },
  { key: "Trades", label: "Handwerk", icon: "🔧" },
  { key: "Real Estate", label: "Immobilien", icon: "🏠" },
  { key: "Education", label: "Beratung", icon: "🎓" },
  { key: "Restaurant", label: "Gastronomie", icon: "🍽️" },
  { key: "Workflow Templates", label: "Team Workflows", icon: "🔄" },
];

const categoryColors: Record<string, string> = {
  Business: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Marketing: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Support: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Sales: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Health: "bg-red-500/10 text-red-400 border-red-500/20",
  Education: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "Real Estate": "bg-teal-500/10 text-teal-400 border-teal-500/20",
  Trades: "bg-stone-500/10 text-stone-400 border-stone-500/20",
  Restaurant: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  "Workflow Templates": "bg-sky-500/10 text-sky-400 border-sky-500/20",
  Other: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

function StarRating({ rating, size = "sm", interactive, onRate }: {
  rating: number;
  size?: "sm" | "md";
  interactive?: boolean;
  onRate?: (value: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const stars = Math.round(rating);
  const dim = size === "md" ? "h-4 w-4" : "h-3 w-3";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          disabled={!interactive}
          onClick={() => onRate?.(i)}
          onMouseEnter={() => interactive && setHover(i)}
          onMouseLeave={() => interactive && setHover(0)}
          className={cn("p-0", interactive && "cursor-pointer")}
        >
          <Star
            className={cn(
              dim,
              "transition-colors",
              i <= (hover || stars)
                ? "fill-amber-400 text-amber-400"
                : "text-zinc-700"
            )}
          />
        </button>
      ))}
    </div>
  );
}

function MiniFlowDiagram({ agents }: { agents: { name: string; agentMode: string; role?: string }[] }) {
  if (!agents || agents.length === 0) return null;

  const roleColors: Record<string, string> = {
    HEAD: "border-orange-500/40 bg-orange-500/10",
    COORDINATOR: "border-blue-500/40 bg-blue-500/10",
    EXECUTOR: "border-green-500/40 bg-green-500/10",
    REPORTER: "border-purple-500/40 bg-purple-500/10",
    APPROVAL_GATE: "border-amber-500/40 bg-amber-500/10",
  };

  return (
    <div className="flex items-center gap-1 overflow-hidden py-1">
      {agents.slice(0, 5).map((agent, i) => (
        <div key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-2.5 w-2.5 text-zinc-600 shrink-0" />}
          <div
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-[8px] font-medium text-zinc-300 whitespace-nowrap truncate max-w-[80px]",
              roleColors[agent.role || ""] || "border-zinc-700 bg-zinc-800/50"
            )}
            title={agent.name}
          >
            {agent.name}
          </div>
        </div>
      ))}
      {agents.length > 5 && (
        <span className="text-[8px] text-zinc-600 ml-0.5">+{agents.length - 5}</span>
      )}
    </div>
  );
}

export default function MarketplacePage() {
  const { toast } = useToast();
  const { isSignedIn } = useUser();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("popular");
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [using, setUsing] = useState<string | null>(null);
  const [ratingTemplate, setRatingTemplate] = useState<string | null>(null);
  const [ratingValue, setRatingValue] = useState(0);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category !== "All") params.set("category", category);
      if (search.trim()) params.set("search", search.trim());
      params.set("sort", sort);

      const res = await fetch(`/api/marketplace?${params}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTemplates(data.templates || []);
    } catch {
      toast("Failed to load templates", "error");
    } finally {
      setLoading(false);
    }
  }, [category, search, sort, toast]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const cloneTemplate = async (templateId: string) => {
    if (!isSignedIn) {
      toast("Bitte melde dich an, um Templates zu nutzen.", "error");
      return;
    }
    setUsing(templateId);
    try {
      const res = await fetch("/api/marketplace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "use", templateId }),
      });
      const data = await res.json();
      if (data.requiresPayment) {
        toast(`Dieses Template kostet €${data.price}. Bezahl-Templates kommen bald.`, "error");
        return;
      }
      if (data.error) throw new Error(data.error);
      if (data.teamId) {
        toast(`Team "${data.teamName}" deployed!`);
        window.location.href = `/dashboard/teams/${data.teamId}?deployed=true`;
        return;
      }
      toast(`Agent "${data.agentName}" erstellt!`);
      window.location.href = `/dashboard/agents/${data.agentId}`;
    } catch {
      toast("Template konnte nicht angewendet werden.", "error");
    } finally {
      setUsing(null);
    }
  };

  const rateTemplate = async (templateId: string, rating: number) => {
    if (!isSignedIn) {
      toast("Bitte melde dich an, um Templates zu bewerten.", "error");
      return;
    }
    try {
      const res = await fetch("/api/marketplace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rate", templateId, rating }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast("Bewertung gespeichert!");
      setRatingTemplate(null);
      loadTemplates();
    } catch {
      toast("Bewertung fehlgeschlagen.", "error");
    }
  };

  const agentCount = (t: Template) =>
    t.agentConfigSnapshot.workflowAgents?.filter((a) => a.agentMode !== "APPROVAL").length || 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden border-b border-border">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 via-transparent to-blue-500/5" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-4 pt-12 pb-10 sm:px-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 border border-orange-500/20">
              <Store className="h-6 w-6 text-orange-400" />
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-orange-500/10 border border-orange-500/20 px-2.5 py-0.5 text-[10px] font-medium text-orange-400">
                {templates.length} Templates
              </span>
            </div>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold text-foreground font-serif leading-tight mb-3">
            Agent & Team Templates
          </h1>
          <p className="text-base text-muted-foreground max-w-xl mb-8">
            Fertige Agent-Workflows in einem Klick deployen. Anpassen, starten, skalieren.
          </p>

          {/* Search Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Templates durchsuchen..."
                className="w-full rounded-xl border border-border bg-card/80 backdrop-blur-sm py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-orange-500/50 focus:outline-none focus:ring-2 focus:ring-orange-500/10 transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="rounded-xl border border-border bg-card/80 backdrop-blur-sm px-3 py-3 text-sm text-foreground focus:border-orange-500/50 focus:outline-none"
              >
                <option value="popular">Beliebteste</option>
                <option value="newest">Neueste</option>
                <option value="rating">Beste Bewertung</option>
              </select>
            </div>
          </div>

          {/* Category Pills */}
          <div className="mt-6 flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-all",
                  category === cat.key
                    ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-zinc-600"
                )}
              >
                {cat.icon && <span className="text-xs">{cat.icon}</span>}
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Template Grid */}
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-orange-400 mb-3" />
            <p className="text-sm text-muted-foreground">Templates werden geladen...</p>
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
              <Sparkles className="h-7 w-7 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-1">Keine Templates gefunden</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              {search ? "Versuche einen anderen Suchbegriff oder Kategorie." : "Sei der Erste! Öffne einen Agent und klicke 'Publish to Marketplace'."}
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => {
              const agents = t.agentConfigSnapshot.workflowAgents;
              const isTeam = !!agents && agents.length > 0;
              const count = agentCount(t);

              return (
                <div
                  key={t.id}
                  className="group flex flex-col rounded-2xl border border-border bg-card/50 backdrop-blur-sm transition-all duration-300 hover:border-orange-500/30 hover:shadow-lg hover:shadow-orange-500/5 overflow-hidden"
                >
                  {/* Card Body */}
                  <div className="p-5 flex-1">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                          isTeam ? "bg-blue-500/10 group-hover:bg-blue-500/15" : "bg-orange-500/10 group-hover:bg-orange-500/15"
                        )}>
                          {isTeam ? <Users className="h-5 w-5 text-blue-400" /> : <Bot className="h-5 w-5 text-orange-400" />}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-foreground leading-tight truncate">{t.name}</h3>
                          <p className="text-[10px] text-muted-foreground">von {t.authorName}</p>
                        </div>
                      </div>
                      <span className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold",
                        t.price > 0 ? "bg-orange-500/10 text-orange-400 border border-orange-500/20" : "bg-green-500/10 text-green-400 border border-green-500/20"
                      )}>
                        {t.price > 0 ? `€${t.price}` : "Free"}
                      </span>
                    </div>

                    {/* Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-3">
                      <span className={cn("rounded-full border px-2 py-0.5 text-[9px] font-medium", categoryColors[t.category] || categoryColors.Other)}>
                        {t.category}
                      </span>
                      {isTeam && (
                        <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[9px] font-medium text-blue-400">
                          {count} Agent{count !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3 min-h-[2rem]">{t.description}</p>

                    {/* Mini Flow Diagram for team templates */}
                    {isTeam && agents && (
                      <div className="mb-3 rounded-lg border border-border/50 bg-zinc-900/50 px-2 py-1.5">
                        <MiniFlowDiagram agents={agents} />
                      </div>
                    )}

                    {/* Stats Row */}
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <StarRating rating={t.rating} />
                        <span className="ml-0.5">{t.rating.toFixed(1)}</span>
                        <span>({t.ratingCount})</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Download className="h-3 w-3" />
                        <span>{t.downloads}x deployed</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Bar */}
                  <div className="flex border-t border-border bg-card/30">
                    <button
                      onClick={() => setPreviewTemplate(t)}
                      className="flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/[0.03] hover:text-foreground"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Details
                    </button>
                    <div className="w-px bg-border" />
                    <button
                      onClick={() => cloneTemplate(t.id)}
                      disabled={using === t.id}
                      className="flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-semibold text-orange-400 transition-colors hover:bg-orange-500/10 disabled:opacity-50"
                    >
                      {using === t.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Rocket className="h-3.5 w-3.5" />
                      )}
                      Deploy
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setPreviewTemplate(null)}>
          <div className="w-full max-w-xl rounded-2xl border border-border bg-zinc-900 shadow-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border p-5">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl",
                  previewTemplate.agentConfigSnapshot.workflowAgents?.length
                    ? "bg-blue-500/10" : "bg-orange-500/10"
                )}>
                  {previewTemplate.agentConfigSnapshot.workflowAgents?.length
                    ? <Users className="h-5 w-5 text-blue-400" />
                    : <Bot className="h-5 w-5 text-orange-400" />
                  }
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">{previewTemplate.name}</h2>
                  <p className="text-xs text-muted-foreground">von {previewTemplate.authorName}</p>
                </div>
              </div>
              <button onClick={() => setPreviewTemplate(null)} className="rounded-lg p-2 text-muted-foreground hover:bg-zinc-800 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Badges + Stats */}
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-medium", categoryColors[previewTemplate.category] || categoryColors.Other)}>
                  {previewTemplate.category}
                </span>
                <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-medium", previewTemplate.price > 0 ? "bg-orange-500/10 text-orange-400 border-orange-500/20" : "bg-green-500/10 text-green-400 border-green-500/20")}>
                  {previewTemplate.price > 0 ? `€${previewTemplate.price}` : "Free"}
                </span>
                <div className="flex items-center gap-1">
                  <StarRating rating={previewTemplate.rating} size="md" />
                  <span className="text-xs text-muted-foreground">({previewTemplate.ratingCount})</span>
                </div>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Download className="h-3 w-3" /> {previewTemplate.downloads}x deployed
                </span>
              </div>

              {/* Description */}
              <div>
                <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Beschreibung</h4>
                <p className="text-sm text-foreground leading-relaxed">{previewTemplate.description}</p>
              </div>

              {/* Workflow Agents */}
              {previewTemplate.agentConfigSnapshot.workflowAgents && previewTemplate.agentConfigSnapshot.workflowAgents.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Agents ({previewTemplate.agentConfigSnapshot.workflowAgents.filter(a => a.agentMode !== "APPROVAL").length})
                  </h4>
                  <div className="space-y-2">
                    {previewTemplate.agentConfigSnapshot.workflowAgents.map((agent, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-zinc-800/50 px-3 py-2.5">
                        <div className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-bold",
                          agent.agentMode === "APPROVAL" ? "bg-amber-500/10 text-amber-400"
                            : agent.agentMode === "TASK" ? "bg-green-500/10 text-green-400"
                            : "bg-blue-500/10 text-blue-400"
                        )}>
                          {agent.agentMode === "APPROVAL" ? "AG" : agent.agentMode === "TASK" ? "T" : "C"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground">{agent.name}</p>
                          <p className="text-[10px] text-muted-foreground">{agent.role} · {agent.agentMode === "APPROVAL" ? "Approval Gate" : agent.agentMode}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Orchestration */}
              {previewTemplate.agentConfigSnapshot.orchestration?.description && (
                <div>
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Orchestrierung</h4>
                  <div className="rounded-lg border border-border bg-zinc-800/50 p-3">
                    <p className="text-xs text-foreground leading-relaxed">{previewTemplate.agentConfigSnapshot.orchestration.description}</p>
                  </div>
                </div>
              )}

              {/* Welcome Message Preview */}
              {previewTemplate.agentConfigSnapshot.welcomeMessage && (
                <div>
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Begrüßungsnachricht</h4>
                  <div className="rounded-lg border border-border bg-zinc-800/50 p-3">
                    <p className="text-xs text-foreground">{previewTemplate.agentConfigSnapshot.welcomeMessage}</p>
                  </div>
                </div>
              )}

              {/* What you'll get */}
              <div>
                <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Was du bekommst</h4>
                <div className="grid grid-cols-2 gap-2">
                  {previewTemplate.agentConfigSnapshot.workflowAgents && (
                    <div className="rounded-lg border border-border bg-zinc-800/30 p-3 flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-400 shrink-0" />
                      <span className="text-xs text-zinc-300">{agentCount(previewTemplate)} konfigurierte Agents</span>
                    </div>
                  )}
                  {previewTemplate.agentConfigSnapshot.actions && previewTemplate.agentConfigSnapshot.actions.filter(a => a.enabled).length > 0 && (
                    <div className="rounded-lg border border-border bg-zinc-800/30 p-3 flex items-center gap-2">
                      <Zap className="h-4 w-4 text-orange-400 shrink-0" />
                      <span className="text-xs text-zinc-300">{previewTemplate.agentConfigSnapshot.actions.filter(a => a.enabled).length} Actions</span>
                    </div>
                  )}
                  <div className="rounded-lg border border-border bg-zinc-800/30 p-3 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-green-400 shrink-0" />
                    <span className="text-xs text-zinc-300">Optimierte Prompts</span>
                  </div>
                  <div className="rounded-lg border border-border bg-zinc-800/30 p-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-400 shrink-0" />
                    <span className="text-xs text-zinc-300">Sofort anpassbar</span>
                  </div>
                </div>
              </div>

              {/* Customization hint */}
              <div className="rounded-lg bg-orange-500/5 border border-orange-500/10 p-3">
                <p className="text-[11px] text-orange-300/80">
                  Nach dem Deploy kannst du anpassen: Firmenname, Branche, Agent-Prompts, Actions und mehr.
                </p>
              </div>

              {/* Rating */}
              <div className="border-t border-border pt-4">
                <p className="text-xs font-medium text-zinc-400 mb-2">Template bewerten</p>
                <div className="flex items-center gap-2">
                  <StarRating
                    rating={ratingTemplate === previewTemplate.id ? ratingValue : 0}
                    size="md"
                    interactive
                    onRate={(v) => { setRatingValue(v); setRatingTemplate(previewTemplate.id); }}
                  />
                  {ratingTemplate === previewTemplate.id && ratingValue > 0 && (
                    <button
                      onClick={() => rateTemplate(previewTemplate.id, ratingValue)}
                      className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-500/90 transition-colors"
                    >
                      Absenden
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Deploy CTA */}
            <div className="border-t border-border p-5">
              <button
                onClick={() => { cloneTemplate(previewTemplate.id); setPreviewTemplate(null); }}
                disabled={using === previewTemplate.id}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:shadow-lg hover:shadow-orange-500/20 disabled:opacity-50"
              >
                {using === previewTemplate.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Template deployen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-border bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Zurück zum Dashboard
          </Link>
          <Link
            href="/dashboard/teams"
            className="text-xs text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-1"
          >
            Eigenes Template teilen <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
