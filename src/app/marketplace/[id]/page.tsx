"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  ChevronRight,
  Download,
  Loader2,
  MessageSquare,
  Rocket,
  Sparkles,
  Star,
  Users,
  Zap,
} from "lucide-react";
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
    workflowAgents?: { name: string; agentMode: "CHAT" | "TASK" | "APPROVAL"; role?: string; description?: string }[];
    orchestration?: { mode?: string; description?: string };
  };
  createdAt: string;
}

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

const roleColors: Record<string, { bg: string; border: string; text: string }> = {
  HEAD: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400" },
  COORDINATOR: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400" },
  EXECUTOR: { bg: "bg-green-500/10", border: "border-green-500/30", text: "text-green-400" },
  REPORTER: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400" },
  APPROVAL_GATE: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400" },
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn("h-4 w-4", i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-zinc-700")} />
      ))}
    </div>
  );
}

export default function TemplateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { isSignedIn } = useUser();
  const [template, setTemplate] = useState<Template | null>(null);
  const [related, setRelated] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);

  const templateId = params.id as string;

  const loadTemplate = useCallback(async () => {
    setLoading(true);
    try {
      // Load all marketplace templates and find by ID
      const res = await fetch("/api/marketplace");
      const data = await res.json();
      const all: Template[] = data.templates || [];
      const found = all.find((t) => t.id === templateId);
      if (!found) {
        router.push("/marketplace");
        return;
      }
      setTemplate(found);
      // Related: same category, excluding current
      setRelated(all.filter((t) => t.id !== templateId && t.category === found.category).slice(0, 3));
    } catch {
      router.push("/marketplace");
    } finally {
      setLoading(false);
    }
  }, [templateId, router]);

  useEffect(() => { loadTemplate(); }, [loadTemplate]);

  const deploy = async () => {
    if (!isSignedIn || !template) {
      toast("Bitte melde dich an.", "error");
      return;
    }
    setDeploying(true);
    try {
      const res = await fetch("/api/marketplace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "use", templateId: template.id }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.teamId) {
        toast(`Team "${data.teamName}" deployed!`);
        window.location.href = `/dashboard/teams/${data.teamId}?deployed=true`;
        return;
      }
      toast(`Agent "${data.agentName}" erstellt!`);
      window.location.href = `/dashboard/agents/${data.agentId}`;
    } catch {
      toast("Deploy fehlgeschlagen.", "error");
    } finally {
      setDeploying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
      </div>
    );
  }

  if (!template) return null;

  const agents = template.agentConfigSnapshot.workflowAgents || [];
  const isTeam = agents.length > 0;
  const enabledActions = template.agentConfigSnapshot.actions?.filter((a) => a.enabled) || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Breadcrumb */}
      <div className="border-b border-border bg-card/30">
        <div className="mx-auto max-w-5xl px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link href="/marketplace" className="hover:text-foreground transition-colors flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" /> Marketplace
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground">{template.name}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          {/* Main Content */}
          <div className="space-y-8">
            {/* Header */}
            <div>
              <div className="flex items-center gap-4 mb-4">
                <div className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-2xl",
                  isTeam ? "bg-blue-500/10 border border-blue-500/20" : "bg-orange-500/10 border border-orange-500/20"
                )}>
                  {isTeam ? <Users className="h-7 w-7 text-blue-400" /> : <Bot className="h-7 w-7 text-orange-400" />}
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground font-serif">{template.name}</h1>
                  <p className="text-sm text-muted-foreground">von {template.authorName}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-medium", categoryColors[template.category] || categoryColors.Other)}>
                  {template.category}
                </span>
                <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-medium", template.price > 0 ? "bg-orange-500/10 text-orange-400 border-orange-500/20" : "bg-green-500/10 text-green-400 border-green-500/20")}>
                  {template.price > 0 ? `€${template.price}` : "Free"}
                </span>
                <div className="flex items-center gap-1.5">
                  <StarRating rating={template.rating} />
                  <span className="text-xs text-muted-foreground">{template.rating.toFixed(1)} ({template.ratingCount})</span>
                </div>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Download className="h-3 w-3" /> {template.downloads}x deployed
                </span>
              </div>

              <p className="text-sm text-foreground leading-relaxed">{template.description}</p>
            </div>

            {/* Visual Flow Diagram */}
            {isTeam && (
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-400" />
                  Team-Workflow
                </h2>
                <div className="rounded-xl border border-border bg-zinc-900/50 p-4">
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    {agents.map((agent, i) => {
                      const rc = roleColors[agent.role || "EXECUTOR"] || roleColors.EXECUTOR;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          {i > 0 && <ChevronRight className="h-4 w-4 text-zinc-600 shrink-0" />}
                          <div className={cn("rounded-xl border p-3 min-w-[140px]", rc.border, rc.bg)}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={cn("text-[9px] font-bold uppercase tracking-wider", rc.text)}>
                                {agent.role || "EXECUTOR"}
                              </span>
                            </div>
                            <p className="text-xs font-medium text-foreground">{agent.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {agent.agentMode === "APPROVAL" ? "Approval Gate" : agent.agentMode}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {template.agentConfigSnapshot.orchestration?.description && (
                    <p className="mt-3 text-center text-[11px] text-muted-foreground border-t border-border pt-3">
                      {template.agentConfigSnapshot.orchestration.description}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Agent Details */}
            {isTeam && (
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-3">Enthaltene Agents</h2>
                <div className="space-y-3">
                  {agents.map((agent, i) => {
                    const rc = roleColors[agent.role || "EXECUTOR"] || roleColors.EXECUTOR;
                    return (
                      <div key={i} className="rounded-xl border border-border bg-card/50 p-4 flex items-start gap-3">
                        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg shrink-0", rc.bg)}>
                          {agent.agentMode === "APPROVAL"
                            ? <Sparkles className={cn("h-4 w-4", rc.text)} />
                            : <Bot className={cn("h-4 w-4", rc.text)} />
                          }
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium text-foreground">{agent.name}</p>
                            <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase", rc.bg, rc.text)}>
                              {agent.role}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Modus: {agent.agentMode === "APPROVAL" ? "Approval Gate" : agent.agentMode}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Welcome Message */}
            {template.agentConfigSnapshot.welcomeMessage && (
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-3">Begrüßungsnachricht</h2>
                <div className="rounded-xl border border-border bg-card/50 p-4">
                  <p className="text-sm text-foreground">{template.agentConfigSnapshot.welcomeMessage}</p>
                </div>
              </div>
            )}

            {/* Suggested Questions */}
            {template.agentConfigSnapshot.suggestedQuestions && template.agentConfigSnapshot.suggestedQuestions.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-3">Vorgeschlagene Fragen</h2>
                <div className="flex flex-wrap gap-2">
                  {template.agentConfigSnapshot.suggestedQuestions.map((q, i) => (
                    <span key={i} className="rounded-full border border-border bg-card/50 px-3 py-1.5 text-xs text-foreground">{q}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Related Templates */}
            {related.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-3">Ähnliche Templates</h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  {related.map((r) => (
                    <Link
                      key={r.id}
                      href={`/marketplace/${r.id}`}
                      className="rounded-xl border border-border bg-card/50 p-4 transition-all hover:border-orange-500/30"
                    >
                      <h3 className="text-xs font-semibold text-foreground mb-1 truncate">{r.name}</h3>
                      <p className="text-[10px] text-muted-foreground line-clamp-2 mb-2">{r.description}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        <span>{r.rating.toFixed(1)}</span>
                        <span>·</span>
                        <span>{r.downloads}x</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-5 lg:sticky lg:top-8 self-start">
            {/* Deploy Card */}
            <div className="rounded-2xl border border-border bg-card/50 p-5 space-y-4">
              <button
                onClick={deploy}
                disabled={deploying}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-3.5 text-sm font-semibold text-white transition-all hover:shadow-lg hover:shadow-orange-500/20 disabled:opacity-50"
              >
                {deploying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Template deployen
              </button>

              <div className="space-y-3 text-xs text-muted-foreground">
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span>Preis</span>
                  <span className="font-semibold text-foreground">{template.price > 0 ? `€${template.price}` : "Kostenlos"}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span>Kategorie</span>
                  <span className="font-semibold text-foreground">{template.category}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span>Bewertung</span>
                  <div className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span className="font-semibold text-foreground">{template.rating.toFixed(1)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span>Deployments</span>
                  <span className="font-semibold text-foreground">{template.downloads}</span>
                </div>
                {isTeam && (
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <span>Agents</span>
                    <span className="font-semibold text-foreground">{agents.filter(a => a.agentMode !== "APPROVAL").length}</span>
                  </div>
                )}
                <div className="flex items-center justify-between py-2">
                  <span>Erstellt</span>
                  <span className="font-semibold text-foreground">{new Date(template.createdAt).toLocaleDateString("de-DE")}</span>
                </div>
              </div>
            </div>

            {/* What you'll get */}
            <div className="rounded-2xl border border-border bg-card/50 p-5">
              <h3 className="text-xs font-semibold text-foreground mb-3">Was du bekommst</h3>
              <div className="space-y-2.5">
                {isTeam && (
                  <div className="flex items-center gap-2.5 text-xs text-zinc-300">
                    <Users className="h-4 w-4 text-blue-400 shrink-0" />
                    <span>{agents.filter(a => a.agentMode !== "APPROVAL").length} konfigurierte Agents</span>
                  </div>
                )}
                {enabledActions.length > 0 && (
                  <div className="flex items-center gap-2.5 text-xs text-zinc-300">
                    <Zap className="h-4 w-4 text-orange-400 shrink-0" />
                    <span>{enabledActions.length} Actions ({enabledActions.map(a => a.type.replace(/_/g, " ")).join(", ")})</span>
                  </div>
                )}
                <div className="flex items-center gap-2.5 text-xs text-zinc-300">
                  <MessageSquare className="h-4 w-4 text-green-400 shrink-0" />
                  <span>Optimierte System-Prompts</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-zinc-300">
                  <Sparkles className="h-4 w-4 text-purple-400 shrink-0" />
                  <span>Vollständig anpassbar nach Deploy</span>
                </div>
              </div>
            </div>

            {/* Customization hint */}
            <div className="rounded-2xl bg-orange-500/5 border border-orange-500/10 p-4">
              <h3 className="text-xs font-semibold text-orange-400 mb-2">Nach dem Deploy anpassbar:</h3>
              <ul className="text-[11px] text-orange-300/70 space-y-1">
                <li>• Firmenname & Branche</li>
                <li>• Agent-Namen & Prompts</li>
                <li>• Actions & Integrationen</li>
                <li>• Knowledge Base hinzufügen</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
