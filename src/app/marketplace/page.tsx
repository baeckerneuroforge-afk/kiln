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
    workflowAgents?: { name: string; agentMode: "CHAT" | "TASK" | "APPROVAL"; role?: string }[];
    orchestration?: { mode?: string; description?: string };
  };
  createdAt: string;
}

const categories = [
  "All", "Business", "Marketing", "Support", "Sales", "Health",
  "Education", "Real Estate", "Trades", "Restaurant", "Workflow Templates", "Other",
];

const categoryColors: Record<string, string> = {
  Business: "bg-blue-500/10 text-blue-400",
  Marketing: "bg-purple-500/10 text-purple-400",
  Support: "bg-kiln-green/10 text-kiln-green",
  Sales: "bg-kiln-orange/10 text-kiln-orange",
  Health: "bg-red-500/10 text-red-400",
  Education: "bg-amber-500/10 text-amber-400",
  "Real Estate": "bg-emerald-500/10 text-emerald-400",
  Trades: "bg-stone-500/10 text-stone-400",
  Restaurant: "bg-rose-500/10 text-rose-400",
  "Workflow Templates": "bg-sky-500/10 text-sky-400",
  Other: "bg-muted text-muted-foreground",
};

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const stars = Math.round(rating);
  const dim = size === "md" ? "h-4 w-4" : "h-3 w-3";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(dim, i <= stars ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")}
        />
      ))}
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
      toast("Please sign in to use templates", "error");
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
        toast(`This template costs €${data.price}. Paid templates coming soon.`, "error");
        return;
      }
      if (data.error) throw new Error(data.error);
      if (data.teamId) {
        toast(`Workflow "${data.teamName}" deployed!`);
        window.location.href = `/dashboard/teams/${data.teamId}`;
        return;
      }
      toast(`Agent "${data.agentName}" created from template!`);
      window.location.href = `/dashboard/agents/${data.agentId}`;
    } catch {
      toast("Failed to use template", "error");
    } finally {
      setUsing(null);
    }
  };

  const rateTemplate = async (templateId: string, rating: number) => {
    if (!isSignedIn) {
      toast("Please sign in to rate templates", "error");
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
      toast("Rating submitted!");
      setRatingTemplate(null);
      loadTemplates();
    } catch {
      toast("Failed to submit rating", "error");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-kiln-orange/10">
              <Store className="h-5 w-5 text-kiln-orange" />
            </div>
            <h1 className="text-2xl font-bold text-foreground font-serif">Template Marketplace</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-lg">
            Browse community-built agent templates. Clone any template to your account and customize it for your needs.
          </p>

          {/* Search + Sort */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates..."
                className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/20"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-kiln-orange focus:outline-none"
            >
              <option value="popular">Popular</option>
              <option value="newest">Newest</option>
              <option value="rating">Highest Rated</option>
            </select>
          </div>

          {/* Category tabs */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  category === cat
                    ? "bg-kiln-orange text-white"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
              <Sparkles className="h-7 w-7 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">No templates found</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              {search ? "Try a different search term or category." : "Be the first to publish a template! Open any agent and click 'Publish to Marketplace'."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <div
                key={t.id}
                className="group flex flex-col rounded-xl border border-border bg-card transition-all duration-200 card-hover-lift overflow-hidden"
              >
                {/* Card header */}
                <div className="p-5 flex-1">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-kiln-orange/10">
                        <Bot className="h-4.5 w-4.5 text-kiln-orange" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground leading-tight">{t.name}</h3>
                        <p className="text-[10px] text-muted-foreground">by {t.authorName}</p>
                      </div>
                    </div>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[9px] font-medium",
                      t.price > 0 ? "bg-kiln-orange/10 text-kiln-orange" : "bg-kiln-green/10 text-kiln-green"
                    )}>
                      {t.price > 0 ? `€${t.price}` : "Free"}
                    </span>
                  </div>

                  <span className={cn("inline-block rounded-full px-2 py-0.5 text-[9px] font-medium mb-2", categoryColors[t.category] || categoryColors.Other)}>
                    {t.category}
                  </span>

                  <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{t.description}</p>

                  {/* Stats */}
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <StarRating rating={t.rating} />
                      <span>({t.ratingCount})</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Download className="h-3 w-3" />
                      <span>{t.downloads}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex border-t border-border">
                  <button
                    onClick={() => setPreviewTemplate(t)}
                    className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Preview
                  </button>
                  <div className="w-px bg-border" />
                  <button
                    onClick={() => cloneTemplate(t.id)}
                    disabled={using === t.id}
                    className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-kiln-orange transition-colors hover:bg-kiln-orange/10 disabled:opacity-50"
                  >
                    {using === t.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ArrowRight className="h-3.5 w-3.5" />
                    )}
                    Use Template
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setPreviewTemplate(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-kiln-orange/10">
                  <Bot className="h-5 w-5 text-kiln-orange" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">{previewTemplate.name}</h2>
                  <p className="text-xs text-muted-foreground">by {previewTemplate.authorName}</p>
                </div>
              </div>
              <button onClick={() => setPreviewTemplate(null)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                <p className="text-sm text-foreground">{previewTemplate.description}</p>
              </div>

              <div className="flex items-center gap-3">
                <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-medium", categoryColors[previewTemplate.category] || categoryColors.Other)}>
                  {previewTemplate.category}
                </span>
                <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-medium", previewTemplate.price > 0 ? "bg-kiln-orange/10 text-kiln-orange" : "bg-kiln-green/10 text-kiln-green")}>
                  {previewTemplate.price > 0 ? `€${previewTemplate.price}` : "Free"}
                </span>
                <div className="flex items-center gap-1">
                  <StarRating rating={previewTemplate.rating} size="md" />
                  <span className="text-xs text-muted-foreground">({previewTemplate.ratingCount})</span>
                </div>
              </div>

              {previewTemplate.agentConfigSnapshot.welcomeMessage && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Welcome Message</p>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-foreground">{previewTemplate.agentConfigSnapshot.welcomeMessage}</p>
                  </div>
                </div>
              )}

              {previewTemplate.agentConfigSnapshot.suggestedQuestions && previewTemplate.agentConfigSnapshot.suggestedQuestions.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Suggested Questions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {previewTemplate.agentConfigSnapshot.suggestedQuestions.map((q, i) => (
                      <span key={i} className="rounded-full bg-muted px-2.5 py-1 text-[10px] text-foreground">{q}</span>
                    ))}
                  </div>
                </div>
              )}

              {previewTemplate.agentConfigSnapshot.workflowAgents && previewTemplate.agentConfigSnapshot.workflowAgents.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Workflow Agents</p>
                  <div className="flex flex-wrap gap-1.5">
                    {previewTemplate.agentConfigSnapshot.workflowAgents.map((agent, i) => (
                      <span key={i} className="rounded-full bg-muted px-2.5 py-1 text-[10px] text-foreground">
                        {agent.name} ({agent.agentMode === "APPROVAL" ? "Approval Gate" : agent.agentMode})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {previewTemplate.agentConfigSnapshot.orchestration?.description && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Orchestration</p>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-foreground">
                      {previewTemplate.agentConfigSnapshot.orchestration.description}
                    </p>
                  </div>
                </div>
              )}

              {previewTemplate.agentConfigSnapshot.actions && previewTemplate.agentConfigSnapshot.actions.filter((a) => a.enabled).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Included Actions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {previewTemplate.agentConfigSnapshot.actions.filter((a) => a.enabled).map((a, i) => (
                      <span key={i} className="flex items-center gap-1 rounded-full bg-kiln-orange/10 px-2.5 py-1 text-[10px] font-medium text-kiln-orange">
                        <Zap className="h-2.5 w-2.5" />
                        {a.type.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Rating */}
              <div className="border-t border-border pt-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">Rate this template</p>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <button
                      key={i}
                      onClick={() => { setRatingValue(i); setRatingTemplate(previewTemplate.id); }}
                      className="p-0.5"
                    >
                      <Star className={cn(
                        "h-5 w-5 transition-colors",
                        i <= (ratingTemplate === previewTemplate.id ? ratingValue : 0)
                          ? "fill-amber-400 text-amber-400"
                          : "text-muted-foreground/30 hover:text-amber-400/50"
                      )} />
                    </button>
                  ))}
                  {ratingTemplate === previewTemplate.id && ratingValue > 0 && (
                    <button
                      onClick={() => rateTemplate(previewTemplate.id, ratingValue)}
                      className="ml-2 rounded-lg bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-500/90"
                    >
                      Submit
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-border p-4">
              <button
                onClick={() => { cloneTemplate(previewTemplate.id); setPreviewTemplate(null); }}
                disabled={using === previewTemplate.id}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-kiln-orange px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-kiln-orange/90 disabled:opacity-50"
              >
                {using === previewTemplate.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Use This Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Back to dashboard */}
      <div className="border-t border-border bg-card/50">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 text-center">
          <Link
            href="/dashboard"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
