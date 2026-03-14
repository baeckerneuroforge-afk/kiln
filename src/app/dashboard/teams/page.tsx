"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Users, Plus, Play, Pause, Loader2, Target, Clock } from "lucide-react";
import { useRouter } from "next/navigation";

/* ---------- Types ---------- */
interface TeamMember {
  id: string;
  role: "HEAD" | "COORDINATOR" | "EXECUTOR";
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

interface TemplateOption {
  key: string;
  label: string;
  name: string;
  goal: string;
}

const TEMPLATES: TemplateOption[] = [
  {
    key: "sales",
    label: "Sales Team",
    name: "Sales Team",
    goal: "Generate and qualify leads, book meetings, and close deals",
  },
  {
    key: "support",
    label: "Support Team",
    name: "Support Team",
    goal: "Triage and resolve customer support requests efficiently",
  },
  {
    key: "content",
    label: "Content Team",
    name: "Content Team",
    goal: "Create, optimize, and distribute content across channels",
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
  const parts: string[] = [];
  if (heads > 0) parts.push(`${heads} Head`);
  if (coordinators > 0) parts.push(`${coordinators} Coordinator${coordinators > 1 ? "s" : ""}`);
  if (executors > 0) parts.push(`${executors} Executor${executors > 1 ? "s" : ""}`);
  return parts.join(" · ") || "No members";
}

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

/* ---------- Create Team Modal ---------- */
function CreateTeamModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectTemplate(tpl: TemplateOption | null) {
    if (tpl) {
      setSelectedTemplate(tpl.key);
      setName(tpl.name);
      setGoal(tpl.goal);
    } else {
      setSelectedTemplate("blank");
      setName("");
      setGoal("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          goal: goal.trim() || undefined,
          template: selectedTemplate === "blank" ? undefined : selectedTemplate,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const team = await res.json();
      onClose();
      router.push(`/dashboard/teams/${team.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create team";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl mx-4">
        <h2 className="font-serif text-2xl text-foreground mb-1">
          Create Team
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Set up a new agent team to work together on a shared goal.
        </p>

        {/* Template selector */}
        <div className="mb-5">
          <label className="mb-2 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Template
          </label>
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.key}
                type="button"
                onClick={() => selectTemplate(tpl)}
                className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  selectedTemplate === tpl.key
                    ? "border-kiln-orange bg-kiln-orange/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-kiln-orange/30 hover:text-foreground"
                }`}
              >
                {tpl.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => selectTemplate(null)}
              className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                selectedTemplate === "blank"
                  ? "border-kiln-orange bg-kiln-orange/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-kiln-orange/30 hover:text-foreground"
              }`}
            >
              Blank Team
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Team Name <span className="text-kiln-orange">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Growth Squad"
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/30"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short description of this team..."
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/30 resize-none"
            />
          </div>

          {/* Goal */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Goal
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Describe what this team should accomplish..."
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/30 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting || !name.trim()}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Team
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------- Main Page ---------- */
export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
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
  }, []);

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

      {/* Error state */}
      {error ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 py-12">
          <p className="mb-2 text-sm font-medium text-destructive">
            Error: {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Reload page
          </button>
        </div>
      ) : teams.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 py-20">
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
          <p className="mb-8 max-w-md text-center text-sm text-muted-foreground">
            Agent teams let multiple AI agents collaborate on complex tasks.
            Create your first team to get started.
          </p>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create your first Agent Team
          </Button>
        </div>
      ) : (
        /* Team cards grid */
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
            <span className="text-sm font-medium">New Team</span>
          </button>
        </div>
      )}

      {/* Create Team Modal */}
      <CreateTeamModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </div>
  );
}
