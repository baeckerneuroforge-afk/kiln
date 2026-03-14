"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Users,
  Plus,
  Play,
  Pause,
  Loader2,
  Target,
  Clock,
  Sparkles,
  X,
  Briefcase,
  Headphones,
  PenTool,
  ArrowLeft,
  ArrowRight,
  Trash2,
  Edit3,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/* ---------- Types ---------- */
interface TeamMember {
  id: string;
  role: "HEAD" | "COORDINATOR" | "EXECUTOR" | "REPORTER";
}

interface Team {
  id: string;
  name: string;
  description: string | null;
  goal: string | null;
  status: "ACTIVE" | "PAUSED";
  members: TeamMember[];
  _count: { tasks: number };
  createdAt: string;
}

interface SuggestedRole {
  name: string;
  role: "HEAD" | "COORDINATOR" | "EXECUTOR" | "REPORTER";
  responsibilities: string;
  systemPrompt: string;
  reportsTo?: string;
}

/* ---------- Template configs ---------- */
const QUICK_TEMPLATES = [
  {
    key: "sales",
    label: "Sales Team",
    description: "Lead gen, outreach, qualification & meeting booking",
    icon: Briefcase,
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    hoverBorder: "hover:border-orange-500/50",
  },
  {
    key: "support",
    label: "Support Team",
    description: "Triage, technical support, billing & onboarding",
    icon: Headphones,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    hoverBorder: "hover:border-blue-500/50",
  },
  {
    key: "content",
    label: "Content Team",
    description: "Blog, social media, newsletters, SEO & analytics",
    icon: PenTool,
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    hoverBorder: "hover:border-green-500/50",
  },
];

/* ---------- Helpers ---------- */
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function roleCounts(members: TeamMember[]): string {
  const heads = members.filter((m) => m.role === "HEAD").length;
  const coordinators = members.filter((m) => m.role === "COORDINATOR").length;
  const executors = members.filter((m) => m.role === "EXECUTOR").length;
  const reporters = members.filter((m) => m.role === "REPORTER").length;
  const parts: string[] = [];
  if (heads > 0) parts.push(`${heads} Head`);
  if (coordinators > 0) parts.push(`${coordinators} Coord.`);
  if (executors > 0) parts.push(`${executors} Exec.`);
  if (reporters > 0) parts.push(`${reporters} Reporter`);
  return parts.join(" · ") || "No members";
}

const roleColors: Record<string, { bg: string; text: string }> = {
  HEAD: { bg: "bg-orange-500/15", text: "text-orange-400" },
  COORDINATOR: { bg: "bg-blue-500/15", text: "text-blue-400" },
  EXECUTOR: { bg: "bg-green-500/15", text: "text-green-400" },
  REPORTER: { bg: "bg-purple-500/15", text: "text-purple-400" },
};

/* ---------- Skeleton ---------- */
function CardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-start justify-between">
        <div className="skeleton h-10 w-10 rounded-lg" />
        <div className="skeleton h-5 w-14 rounded-full" />
      </div>
      <div className="skeleton mb-2 h-5 w-2/3 rounded" />
      <div className="skeleton mb-1 h-4 w-full rounded" />
      <div className="skeleton mb-4 h-4 w-4/5 rounded" />
      <div className="flex items-center gap-4">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="skeleton h-4 w-20 rounded" />
      </div>
    </div>
  );
}

/* ---------- Create Team Modal (multi-step) ---------- */
function CreateTeamModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const router = useRouter();

  // Step 1 state
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Step 2 state (AI-suggested structure)
  const [suggestedRoles, setSuggestedRoles] = useState<SuggestedRole[]>([]);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  function reset() {
    setStep(1);
    setName("");
    setGoal("");
    setError(null);
    setSuggestedRoles([]);
    setGenerating(false);
    setSubmitting(false);
    setEditingIdx(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  // Step 1 → Step 2: Ask Claude for structure
  async function handleNext() {
    if (!name.trim() || !goal.trim()) return;
    setError(null);
    setGenerating(true);

    try {
      const res = await fetch("/api/teams/suggest-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: goal.trim(), teamName: name.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setSuggestedRoles(data.roles);
      setStep(2);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to generate structure";
      setError(message);
    } finally {
      setGenerating(false);
    }
  }

  // Step 2 → Create team with roles
  async function handleCreate() {
    if (suggestedRoles.length === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      // Create the team first
      const teamRes = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), goal: goal.trim() }),
      });

      if (!teamRes.ok) {
        const data = await teamRes.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${teamRes.status}`);
      }

      const team = await teamRes.json();

      // Generate members with the suggested roles
      const membersRes = await fetch(
        `/api/teams/${team.id}/generate-members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roles: suggestedRoles }),
        }
      );

      if (!membersRes.ok) {
        const data = await membersRes.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${membersRes.status}`);
      }

      handleClose();
      onCreated();
      router.push(`/dashboard/teams/${team.id}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to create team";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  function removeRole(idx: number) {
    setSuggestedRoles((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateRole(idx: number, field: keyof SuggestedRole, value: string) {
    setSuggestedRoles((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div className="relative z-10 w-full max-w-2xl rounded-xl border border-border bg-card shadow-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <div>
            <h2 className="font-serif text-2xl text-foreground">
              {step === 1 ? "Create Team" : "Review Team Structure"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {step === 1
                ? "Define your team's name and goal. KILN will design the optimal agent structure."
                : `${suggestedRoles.length} agents suggested. Review, adjust, then create.`}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-6 py-3 bg-muted/30">
          <div
            className={cn(
              "flex items-center gap-2 text-xs font-medium",
              step === 1 ? "text-kiln-orange" : "text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                step === 1
                  ? "bg-kiln-orange text-white"
                  : "bg-kiln-orange/20 text-kiln-orange"
              )}
            >
              1
            </span>
            Name & Goal
          </div>
          <div className="h-px flex-1 bg-border" />
          <div
            className={cn(
              "flex items-center gap-2 text-xs font-medium",
              step === 2 ? "text-kiln-orange" : "text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                step === 2
                  ? "bg-kiln-orange text-white"
                  : "bg-muted text-muted-foreground"
              )}
            >
              2
            </span>
            Team Structure
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Team Name <span className="text-kiln-orange">*</span>
                </label>
                <input
                  autoFocus
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Growth Squad"
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/30"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Team Goal <span className="text-kiln-orange">*</span>
                </label>
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="Describe what this team should accomplish. KILN will design the optimal agent structure..."
                  rows={4}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/30 resize-none"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {suggestedRoles.map((role, idx) => {
                const rc = roleColors[role.role] || roleColors.EXECUTOR;
                const isEditing = editingIdx === idx;

                return (
                  <div
                    key={idx}
                    className="rounded-lg border border-border bg-background p-3 group"
                  >
                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            value={role.name}
                            onChange={(e) =>
                              updateRole(idx, "name", e.target.value)
                            }
                            className="flex-1 rounded border border-border bg-card px-2 py-1 text-sm text-foreground outline-none focus:border-kiln-orange"
                            placeholder="Agent name"
                          />
                          <select
                            value={role.role}
                            onChange={(e) =>
                              updateRole(idx, "role", e.target.value)
                            }
                            className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground outline-none"
                          >
                            <option value="HEAD">HEAD</option>
                            <option value="COORDINATOR">COORDINATOR</option>
                            <option value="EXECUTOR">EXECUTOR</option>
                            <option value="REPORTER">REPORTER</option>
                          </select>
                        </div>
                        <input
                          value={role.responsibilities}
                          onChange={(e) =>
                            updateRole(idx, "responsibilities", e.target.value)
                          }
                          className="w-full rounded border border-border bg-card px-2 py-1 text-xs text-muted-foreground outline-none focus:border-kiln-orange"
                          placeholder="Responsibilities"
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">
                            Reports to:
                          </span>
                          <select
                            value={role.reportsTo || ""}
                            onChange={(e) =>
                              updateRole(
                                idx,
                                "reportsTo",
                                e.target.value || ""
                              )
                            }
                            className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground outline-none"
                          >
                            <option value="">None (HEAD)</option>
                            {suggestedRoles
                              .filter((_, i) => i !== idx)
                              .map((r) => (
                                <option key={r.name} value={r.name}>
                                  {r.name}
                                </option>
                              ))}
                          </select>
                          <div className="flex-1" />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingIdx(null)}
                            className="text-xs h-7"
                          >
                            Done
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={cn(
                                "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                                rc.bg,
                                rc.text
                              )}
                            >
                              {role.role}
                            </span>
                            <span className="text-sm font-medium text-foreground truncate">
                              {role.name}
                            </span>
                            {role.reportsTo && (
                              <span className="text-[10px] text-muted-foreground">
                                → {role.reportsTo}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {role.responsibilities}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setEditingIdx(idx)}
                            className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => removeRole(idx)}
                            className="p-1 text-muted-foreground hover:text-red-400 rounded transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {error && (
            <p className="mt-4 text-sm text-destructive">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          {step === 2 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep(1)}
              className="text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={generating || submitting}
            >
              Cancel
            </Button>

            {step === 1 ? (
              <Button
                size="sm"
                onClick={handleNext}
                disabled={generating || !name.trim() || !goal.trim()}
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Designing team...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Structure
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </>
                )}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={submitting || suggestedRoles.length === 0}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating {suggestedRoles.length} agents...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Team ({suggestedRoles.length} agents)
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Main Page ---------- */
export default function TeamsPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState<string | null>(null);

  function fetchTeams() {
    setLoading(true);
    fetch("/api/teams")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setTeams(data);
        else throw new Error("Unexpected API response");
      })
      .catch((err) => {
        console.error("Failed to load teams:", err);
        setError(err.message || "Error loading teams");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchTeams();
  }, []);

  // Quick template creation — creates team from template with all agents instantly
  async function createFromTemplate(templateKey: string) {
    setCreatingTemplate(templateKey);
    try {
      const tpl = QUICK_TEMPLATES.find((t) => t.key === templateKey);
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tpl?.label || "New Team",
          template: templateKey,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const team = await res.json();
      router.push(`/dashboard/teams/${team.id}`);
    } catch (err) {
      console.error("Template creation failed:", err);
      setError(err instanceof Error ? err.message : "Failed to create team");
    } finally {
      setCreatingTemplate(null);
    }
  }

  /* Loading state */
  if (loading) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="skeleton h-9 w-48 rounded-lg" />
            <div className="skeleton mt-3 h-4 w-64 rounded" />
          </div>
          <div className="skeleton h-9 w-32 rounded-lg" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl text-foreground">Agent Teams</h1>
          <p className="mt-2 text-muted-foreground">
            Coordinate groups of AI agents working toward shared goals.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Team
        </Button>
      </div>

      {/* Quick Templates */}
      <div className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Quick Start Templates
        </h2>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          {QUICK_TEMPLATES.map((tpl) => {
            const isCreating = creatingTemplate === tpl.key;
            return (
              <button
                key={tpl.key}
                onClick={() => createFromTemplate(tpl.key)}
                disabled={creatingTemplate !== null}
                className={cn(
                  "group flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200",
                  tpl.border,
                  tpl.hoverBorder,
                  "bg-card/50 hover:bg-card",
                  creatingTemplate !== null && !isCreating && "opacity-50"
                )}
              >
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                    tpl.bg
                  )}
                >
                  {isCreating ? (
                    <Loader2
                      className={cn("h-5 w-5 animate-spin", tpl.color)}
                    />
                  ) : (
                    <tpl.icon className={cn("h-5 w-5", tpl.color)} />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {tpl.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {tpl.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Error state */}
      {error ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 py-12">
          <p className="mb-2 text-sm font-medium text-destructive">
            Error: {error}
          </p>
          <button
            onClick={() => {
              setError(null);
              fetchTeams();
            }}
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Reload page
          </button>
        </div>
      ) : teams.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 py-16">
          <div className="relative mb-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-kiln-orange/10">
              <Users className="h-10 w-10 text-kiln-orange" />
            </div>
            <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-kiln-orange shadow-lg">
              <Plus className="h-3.5 w-3.5 text-white" />
            </div>
          </div>
          <h2 className="mb-2 text-xl font-semibold text-foreground">
            No agent teams yet
          </h2>
          <p className="mb-6 max-w-md text-center text-sm text-muted-foreground">
            Use a Quick Start Template above, or create a custom team with
            AI-generated structure.
          </p>
          <Button onClick={() => setShowCreate(true)}>
            <Sparkles className="mr-2 h-4 w-4" />
            Create Custom Team
          </Button>
        </div>
      ) : (
        /* Team cards grid */
        <>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Your Teams
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {teams.map((team) => {
              const taskCount = team._count?.tasks ?? 0;

              return (
                <Link
                  key={team.id}
                  href={`/dashboard/teams/${team.id}`}
                  className="group relative flex flex-col rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:border-kiln-orange/30"
                >
                  {/* Header row */}
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-kiln-orange/10 transition-colors group-hover:bg-kiln-orange/15">
                      <Users className="h-5 w-5 text-kiln-orange" />
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        team.status === "ACTIVE"
                          ? "bg-kiln-green/10 text-kiln-green"
                          : "bg-amber-500/10 text-amber-500"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {team.status === "ACTIVE" ? (
                          <Play className="h-2.5 w-2.5" />
                        ) : (
                          <Pause className="h-2.5 w-2.5" />
                        )}
                        {team.status === "ACTIVE" ? "Active" : "Paused"}
                      </span>
                    </span>
                  </div>

                  {/* Name + Goal */}
                  <h3 className="mb-1 font-semibold text-foreground group-hover:text-kiln-orange transition-colors">
                    {team.name}
                  </h3>
                  <p className="mb-auto text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">
                    {team.goal || team.description || "No goal set"}
                  </p>

                  {/* Stats */}
                  <div className="mt-4 space-y-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3 w-3" />
                      <span>{roleCounts(team.members)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Target className="h-3 w-3" />
                        <span>
                          {taskCount} task{taskCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{formatDate(team.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}

            {/* New Team card */}
            <button
              onClick={() => setShowCreate(true)}
              className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/30 p-5 text-muted-foreground transition-all duration-200 hover:border-kiln-orange/30 hover:text-foreground hover:bg-card/50 min-h-[220px]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-3">
                <Plus className="h-6 w-6" />
              </div>
              <span className="text-sm font-medium">Custom Team</span>
            </button>
          </div>
        </>
      )}

      {/* Create Team Modal */}
      <CreateTeamModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={fetchTeams}
      />
    </div>
  );
}
