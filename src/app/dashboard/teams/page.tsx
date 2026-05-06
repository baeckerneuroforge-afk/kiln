"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Users,
  Plus,
  Loader2,
  Target,
  Clock,
  Sparkles,
  X,
  Briefcase,
  CalendarDays,
  Headphones,
  PenTool,
  ArrowLeft,
  ArrowRight,
  Trash2,
  Edit3,
  ChevronDown,
  ChevronUp,
  Wand2,
  Wrench,
  Check,
  Heart,
  TrendingUp,
  TrendingDown,
  Upload,
  FileText,
  Eye,
  AlertCircle,
  Hammer,
  Building2,
  GraduationCap,
  CookingPot,
  GitFork,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { SkeletonCard } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import {
  PROVIDERS,
  getModelsForProvider,
  type ProviderKey,
} from "@/lib/ai";

/* ---------- Types ---------- */
interface TeamMember {
  id: string;
  role: "HEAD" | "COORDINATOR" | "EXECUTOR" | "REPORTER" | "APPROVAL_GATE";
}

interface RunStats {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  successRate: number | null;
  avgDurationMs: number | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
}

interface Team {
  id: string;
  name: string;
  description: string | null;
  goal: string | null;
  scheduleSummary?: string | null;
  parentTeamId?: string | null;
  isOwner?: boolean;
  sharedRole?: string | null;
  status: "ACTIVE" | "PAUSED";
  members: TeamMember[];
  _count: { tasks: number };
  createdAt: string;
  runStats?: RunStats | null;
}

interface SuggestedRole {
  name: string;
  role: "HEAD" | "COORDINATOR" | "EXECUTOR" | "REPORTER";
  mode?: "CHAT" | "TASK";
  responsibilities: string;
  systemPrompt: string;
  suggestedModel?: string;
  suggestedProvider?: string;
  reportsTo?: string;
  enabledActions?: string[];
}

type RoleType = "HEAD" | "COORDINATOR" | "EXECUTOR" | "REPORTER";
type AgentMode = "CHAT" | "TASK";
type TriggerType = "MANUAL" | "SCHEDULE" | "WEBHOOK" | "EVENT";
type OutputType = "NEXT_AGENT" | "EMAIL" | "HTTP" | "WEBHOOK" | "LOG";

interface ManualMember {
  id: string;
  name: string;
  role: RoleType;
  mode: AgentMode;
  provider: ProviderKey;
  model: string;
  systemPrompt: string;
  reportsTo: string; // name of another member
  trigger: TriggerType;
  output: OutputType;
  outputTarget: string; // agent name or URL etc.
  expanded: boolean;
}

/* ---------- Template configs ---------- */
const QUICK_TEMPLATES = [
  {
    key: "sales",
    label: "Sales Workflow",
    description: "Lead gen, outreach, qualification & meeting booking",
    icon: Briefcase,
    color: "text-orange-300/50 group-hover:text-orange-300/70",
    bg: "bg-orange-500/[0.08] group-hover:bg-orange-500/[0.12]",
    border: "border-border",
    hoverBorder: "hover:border-foreground/20",
  },
  {
    key: "support",
    label: "Support Workflow",
    description: "Triage, technical support, billing & onboarding",
    icon: Headphones,
    color: "text-orange-300/50 group-hover:text-orange-300/70",
    bg: "bg-orange-500/[0.08] group-hover:bg-orange-500/[0.12]",
    border: "border-border",
    hoverBorder: "hover:border-foreground/20",
  },
  {
    key: "content",
    label: "Content Workflow",
    description: "Blog, social media, newsletters, SEO & analytics",
    icon: PenTool,
    color: "text-orange-300/50 group-hover:text-orange-300/70",
    bg: "bg-orange-500/[0.08] group-hover:bg-orange-500/[0.12]",
    border: "border-border",
    hoverBorder: "hover:border-foreground/20",
  },
];

const TEAM_TEMPLATES = [
  { value: "", label: "Custom (no template)" },
  { value: "sales", label: "Sales Workflow" },
  { value: "support", label: "Support Workflow" },
  { value: "content", label: "Content Workflow" },
];

const TEAM_TEMPLATE_SHOWCASE = [
  {
    id: "sales-pipeline",
    label: "Sales Pipeline",
    description: "Qualifier routes hot leads through a human approval gate before Closer, while colder leads go to Follow-Up.",
    agents: "3 agents + gate",
    flow: "Qualifier → Approval → Closer / Follow-Up",
    icon: Briefcase,
    color: "text-muted-foreground",
    bg: "bg-muted",
    border: "border-border",
  },
  {
    id: "customer-support-tiers",
    label: "Customer Support Tiers",
    description: "Tier 1 handles first contact, then deeper support and escalation.",
    agents: "3 agents",
    flow: "Tier 1 → Tier 2 → Escalation",
    icon: Headphones,
    color: "text-muted-foreground",
    bg: "bg-muted",
    border: "border-border",
  },
  {
    id: "content-creation-pipeline",
    label: "Content Creation Pipeline",
    description: "Research, drafting, and editing run as a sequential production line.",
    agents: "3 agents",
    flow: "Researcher → Writer → Editor",
    icon: PenTool,
    color: "text-muted-foreground",
    bg: "bg-muted",
    border: "border-border",
  },
  {
    id: "lead-qualification-booking",
    label: "Lead Qualification & Booking",
    description: "BANT qualification hands off qualified prospects into booking.",
    agents: "2 agents",
    flow: "Qualifier → Booker",
    icon: CalendarDays,
    color: "text-muted-foreground",
    bg: "bg-muted",
    border: "border-border",
  },
  {
    id: "shk-betrieb-lead-pipeline",
    label: "SHK-Betrieb Pipeline",
    description: "Qualifies HVAC service inquiries with urgency scoring.",
    agents: "3 agents",
    flow: "Qualifier → Booker / Follow-Up",
    icon: Hammer,
    color: "text-muted-foreground",
    bg: "bg-muted",
    border: "border-border",
    industry: "Trades",
  },
  {
    id: "immobilienmakler-pipeline",
    label: "Immobilienmakler Pipeline",
    description: "Qualifies leads, matches listings, and books viewings.",
    agents: "3 agents",
    flow: "Qualifier → Matcher → Booker",
    icon: Building2,
    color: "text-muted-foreground",
    bg: "bg-muted",
    border: "border-border",
    industry: "Immobilien",
  },
  {
    id: "coach-erstgespraech-pipeline",
    label: "Coach Erstgespräch",
    description: "Qualifiziert Coaching-Interessenten und bucht Erstgespräche.",
    agents: "2 agents",
    flow: "Qualifier → Scheduler",
    icon: GraduationCap,
    color: "text-muted-foreground",
    bg: "bg-muted",
    border: "border-border",
    industry: "Beratung",
  },
  {
    id: "kuechenstudio-pipeline",
    label: "Küchenstudio Pipeline",
    description: "Erfasst Küchenwünsche, präsentiert Konzepte, bucht Showroom-Besuche.",
    agents: "3 agents",
    flow: "Berater → Designer → Booker",
    icon: CookingPot,
    color: "text-muted-foreground",
    bg: "bg-muted",
    border: "border-border",
    industry: "Trades",
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

function formatRelativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

function formatDurationMs(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = ms / 60_000;
  if (minutes < 60) return `${minutes.toFixed(1)}m`;
  return `${(minutes / 60).toFixed(1)}h`;
}

function roleCounts(members: TeamMember[]): string {
  const heads = members.filter((m) => m.role === "HEAD").length;
  const coordinators = members.filter((m) => m.role === "COORDINATOR").length;
  const approvalGates = members.filter((m) => m.role === "APPROVAL_GATE").length;
  const executors = members.filter((m) => m.role === "EXECUTOR").length;
  const reporters = members.filter((m) => m.role === "REPORTER").length;
  const parts: string[] = [];
  if (heads > 0) parts.push(`${heads} Head`);
  if (coordinators > 0) parts.push(`${coordinators} Coord.`);
  if (approvalGates > 0) parts.push(`${approvalGates} Gate`);
  if (executors > 0) parts.push(`${executors} Exec.`);
  if (reporters > 0) parts.push(`${reporters} Reporter`);
  return parts.join(" · ") || "No members";
}

const roleColors: Record<string, { bg: string; text: string }> = {
  HEAD: { bg: "bg-muted", text: "text-foreground" },
  COORDINATOR: { bg: "bg-muted", text: "text-foreground" },
  APPROVAL_GATE: { bg: "bg-muted", text: "text-foreground" },
  EXECUTOR: { bg: "bg-muted", text: "text-foreground" },
  REPORTER: { bg: "bg-muted", text: "text-foreground" },
};

const CHAT_ROLE_KEYWORDS = ["support", "chat", "customer", "website"];

function defaultAgentMode(role: RoleType, name?: string): AgentMode {
  if (role === "HEAD" || role === "COORDINATOR" || role === "REPORTER") return "TASK";
  // EXECUTOR: Task by default, Chat only if name suggests customer-facing
  if (name && CHAT_ROLE_KEYWORDS.some((kw) => name.toLowerCase().includes(kw))) return "CHAT";
  return "TASK";
}

function defaultMemberName(role: RoleType): string {
  const names: Record<string, string> = {
    HEAD: "Team Lead",
    COORDINATOR: "Task Coordinator",
    EXECUTOR: "",
    REPORTER: "Report Writer",
    APPROVAL_GATE: "Quality Reviewer",
  };
  return names[role] ?? "";
}

function generateMemberPrompt(role: string, taskDescription: string, teamGoal: string): string {
  const roleInstructions: Record<string, string> = {
    HEAD: `You are the team lead. Your job is to coordinate the team and ensure the overall goal is met.\n\nTeam Goal: ${teamGoal}\n\nYour specific responsibility: ${taskDescription}\n\nDelegate tasks to team members and synthesize their results.`,
    COORDINATOR: `You coordinate tasks between team members.\n\nTeam Goal: ${teamGoal}\n\nYour responsibility: ${taskDescription}\n\nPlan the execution order and ensure smooth handoffs between members.`,
    EXECUTOR: `You are a specialist executor. Complete your assigned task thoroughly and accurately.\n\nTeam Goal: ${teamGoal}\n\nYour specific task: ${taskDescription}\n\nUse your available tools to accomplish this task. Write findings to the shared context when done.`,
    REPORTER: `You synthesize and summarize results from the team.\n\nTeam Goal: ${teamGoal}\n\nYour responsibility: ${taskDescription}\n\nCreate a clear, structured summary of all findings and results.`,
    APPROVAL_GATE: `You review work before it proceeds. Check for quality, accuracy and completeness.\n\nTeam Goal: ${teamGoal}\n\nReview criteria: ${taskDescription}`,
  };
  return roleInstructions[role] || `Team Goal: ${teamGoal}\n\nYour task: ${taskDescription}`;
}

function newManualMember(overrides: Partial<ManualMember> = {}): ManualMember {
  const role = overrides.role || "EXECUTOR";
  return {
    id: Math.random().toString(36).slice(2),
    name: defaultMemberName(role),
    role,
    mode: defaultAgentMode(role, overrides.name),
    provider: "ANTHROPIC",
    model: "claude-sonnet-4-6",
    systemPrompt: "",
    reportsTo: "",
    trigger: "MANUAL",
    output: "LOG",
    outputTarget: "",
    expanded: true,
    ...overrides,
  };
}

/* ---------- Step Indicator ---------- */
function StepIndicator({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <div className="flex items-center gap-0 px-6 py-3 bg-muted/30">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === current;
        const isDone = stepNum < current;
        return (
          <div key={label} className="flex items-center">
            <div
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium",
                isActive
                  ? "text-muted-foreground"
                  : isDone
                  ? "text-muted-foreground"
                  : "text-muted-foreground/50"
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shrink-0",
                  isActive
                    ? "bg-kiln-orange text-white"
                    : isDone
                    ? "bg-kiln-orange/30 text-muted-foreground"
                    : "bg-muted text-muted-foreground/50"
                )}
              >
                {isDone ? <Check className="h-3 w-3" /> : stepNum}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "mx-2 h-px flex-1 w-8",
                  isDone ? "bg-kiln-orange/30" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Role Badge ---------- */
function RoleBadge({ role }: { role: RoleType }) {
  const rc = roleColors[role] || roleColors.EXECUTOR;
  return (
    <span
      className={cn(
        "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap",
        rc.bg,
        rc.text
      )}
    >
      {role}
    </span>
  );
}

/* ---------- Model Badge ---------- */
function ModelBadge({ provider, model }: { provider: ProviderKey; model: string }) {
  const models = getModelsForProvider(provider);
  const modelDef = models.find((m) => m.id === model);
  return (
    <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-mono whitespace-nowrap">
      {modelDef?.shortLabel ?? model}
    </span>
  );
}

/* ---------- Auto-Generate Step 1: Name & Goal ---------- */
function AutoStep1({
  name,
  goal,
  onNameChange,
  onGoalChange,
}: {
  name: string;
  goal: string;
  onNameChange: (v: string) => void;
  onGoalChange: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Workflow Name <span className="text-muted-foreground">*</span>
        </label>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Growth Squad"
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/30"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Workflow Goal <span className="text-muted-foreground">*</span>
        </label>
        <textarea
          value={goal}
          onChange={(e) => onGoalChange(e.target.value)}
          placeholder="Describe what this workflow should accomplish. KILN will design the optimal agent structure..."
          rows={4}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/30 resize-none"
        />
      </div>
      <p className="text-xs text-muted-foreground/70 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground/70" />
        Claude will suggest an optimal workflow structure based on your goal.
      </p>
    </div>
  );
}

/* ---------- Shared Review/Edit Step (auto step 2, manual step 4) ---------- */
function ReviewStep({
  roles,
  onUpdate,
  onRemove,
  onAdd,
  editingIdx,
  setEditingIdx,
}: {
  roles: SuggestedRole[];
  onUpdate: (idx: number, field: keyof SuggestedRole, value: string) => void;
  onRemove: (idx: number) => void;
  onAdd: () => void;
  editingIdx: number | null;
  setEditingIdx: (idx: number | null) => void;
}) {
  return (
    <div className="space-y-3">
      {roles.map((role, idx) => {
        const isEditing = editingIdx === idx;

        return (
          <div
            key={idx}
            className="rounded-lg border border-border bg-background p-3 group"
          >
            {isEditing ? (
              <div className="space-y-2">
                {/* Name + Role */}
                <div className="flex gap-2">
                  <input
                    value={role.name}
                    onChange={(e) => onUpdate(idx, "name", e.target.value)}
                    className="flex-1 rounded border border-border bg-card px-2 py-1 text-sm text-foreground outline-none focus:border-kiln-orange"
                    placeholder="Agent name"
                  />
                  <select
                    value={role.role}
                    onChange={(e) => onUpdate(idx, "role", e.target.value)}
                    className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground outline-none"
                  >
                    <option value="HEAD">HEAD</option>
                    <option value="COORDINATOR">COORDINATOR</option>
                    <option value="EXECUTOR">EXECUTOR</option>
                    <option value="REPORTER">REPORTER</option>
                  </select>
                </div>
                {/* Agent Mode */}
                <div>
                  <div className="flex gap-2 items-center">
                    <span className="text-xs text-muted-foreground min-w-[60px]">Mode:</span>
                    <select
                      value={role.mode ?? "TASK"}
                      onChange={(e) => onUpdate(idx, "mode", e.target.value)}
                      className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground outline-none"
                    >
                      <option value="TASK">Task Agent</option>
                      <option value="CHAT">Chat Agent</option>
                    </select>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 ml-[68px]">Task = autonomous. Chat = customer-facing only.</p>
                </div>
                {/* Provider + Model */}
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-muted-foreground min-w-[60px]">Model:</span>
                  <select
                    value={role.suggestedProvider ?? "ANTHROPIC"}
                    onChange={(e) => {
                      const prov = e.target.value as ProviderKey;
                      const models = getModelsForProvider(prov);
                      onUpdate(idx, "suggestedProvider", prov);
                      onUpdate(idx, "suggestedModel", models[0]?.id ?? "");
                    }}
                    className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground outline-none"
                  >
                    {(Object.keys(PROVIDERS) as ProviderKey[]).map((p) => (
                      <option key={p} value={p}>
                        {PROVIDERS[p].label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={role.suggestedModel ?? ""}
                    onChange={(e) => onUpdate(idx, "suggestedModel", e.target.value)}
                    className="flex-1 rounded border border-border bg-card px-2 py-1 text-xs text-foreground outline-none"
                  >
                    {getModelsForProvider((role.suggestedProvider as ProviderKey) ?? "ANTHROPIC").map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Responsibilities */}
                <input
                  value={role.responsibilities}
                  onChange={(e) => onUpdate(idx, "responsibilities", e.target.value)}
                  className="w-full rounded border border-border bg-card px-2 py-1 text-xs text-muted-foreground outline-none focus:border-kiln-orange"
                  placeholder="Responsibilities"
                />
                {/* System Prompt */}
                <textarea
                  value={role.systemPrompt}
                  onChange={(e) => onUpdate(idx, "systemPrompt", e.target.value)}
                  rows={3}
                  className="w-full rounded border border-border bg-card px-2 py-1 text-xs text-muted-foreground outline-none focus:border-kiln-orange resize-none"
                  placeholder="System prompt (optional)"
                />
                {/* Reports to */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground min-w-[60px]">
                    Reports to:
                  </span>
                  <select
                    value={role.reportsTo || ""}
                    onChange={(e) => onUpdate(idx, "reportsTo", e.target.value || "")}
                    className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground outline-none"
                  >
                    <option value="">None (HEAD)</option>
                    {roles
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
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <RoleBadge role={role.role} />
                    <span className="text-sm font-medium text-foreground truncate">
                      {role.name || <span className="text-muted-foreground italic">Unnamed</span>}
                    </span>
                    {(role.suggestedProvider || role.mode) && (
                      <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-mono">
                        {role.mode === "TASK" ? "Task" : "Chat"}
                      </span>
                    )}
                    {role.suggestedModel && (
                      <ModelBadge
                        provider={(role.suggestedProvider as ProviderKey) ?? "ANTHROPIC"}
                        model={role.suggestedModel}
                      />
                    )}
                    {role.reportsTo && (
                      <span className="text-[10px] text-muted-foreground">
                        → {role.reportsTo}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {role.responsibilities || (
                      <span className="italic">No responsibilities set</span>
                    )}
                  </p>
                  {role.systemPrompt && (
                    <p className="text-[10px] text-muted-foreground/60 line-clamp-1 mt-0.5 font-mono">
                      {role.systemPrompt.slice(0, 80)}
                      {role.systemPrompt.length > 80 ? "…" : ""}
                    </p>
                  )}
                  {role.enabledActions && role.enabledActions.length > 0 && (
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      <span className="text-[10px] text-muted-foreground/50">Tools:</span>
                      {role.enabledActions.map((tool) => (
                        <span key={tool} className="text-[9px] bg-kiln-orange/10 text-kiln-orange px-1.5 py-0.5 rounded font-mono">
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditingIdx(idx)}
                    className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onRemove(idx)}
                    className="p-1 text-muted-foreground hover:text-muted-foreground rounded transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <button
        onClick={onAdd}
        className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background/50 px-3 py-2 text-xs text-muted-foreground hover:border-kiln-orange/40 hover:text-foreground transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Agent
      </button>
    </div>
  );
}

/* ---------- Manual Step 1: Workflow Basics ---------- */
function ManualStep1({
  name,
  goal,
  teamTemplate,
  onNameChange,
  onGoalChange,
  onTemplateChange,
}: {
  name: string;
  goal: string;
  teamTemplate: string;
  onNameChange: (v: string) => void;
  onGoalChange: (v: string) => void;
  onTemplateChange: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Workflow Name <span className="text-muted-foreground">*</span>
        </label>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Growth Squad"
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/30"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Goal / Description <span className="text-muted-foreground">*</span>
        </label>
        <textarea
          value={goal}
          onChange={(e) => onGoalChange(e.target.value)}
          placeholder="What should this workflow accomplish?"
          rows={3}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/30 resize-none"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Workflow Template <span className="text-muted-foreground/50">(optional)</span>
        </label>
        <select
          value={teamTemplate}
          onChange={(e) => onTemplateChange(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/30"
        >
          {TEAM_TEMPLATES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/* ---------- Manual Step 2: Define Roles ---------- */
function ManualStep2({
  members,
  teamGoal,
  onUpdate,
  onAdd,
  onRemove,
  onToggleExpand,
}: {
  members: ManualMember[];
  teamGoal: string;
  onUpdate: (id: string, field: keyof ManualMember, value: string | boolean) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onToggleExpand: (id: string) => void;
}) {
  const [enhancingIds, setEnhancingIds] = useState<Set<string>>(new Set());
  const [taskDescs, setTaskDescs] = useState<Record<string, string>>({});
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Define the agents that will be part of this workflow. Each agent has a role, model, and system prompt.
        You can also skip this step — agents are optional when using the visual canvas editor.
      </p>
      {members.map((member, idx) => {
        const providerModels = getModelsForProvider(member.provider);
        const currentModelInProvider = providerModels.find((m) => m.id === member.model);
        const displayModel = currentModelInProvider ?? providerModels[0];

        return (
          <div
            key={member.id}
            className="rounded-lg border border-border bg-background overflow-hidden"
          >
            {/* Collapsed header */}
            <div
              className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => onToggleExpand(member.id)}
            >
              <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                <RoleBadge role={member.role} />
                <span className="text-sm font-medium text-foreground truncate">
                  {member.name || <span className="text-muted-foreground italic">Unnamed Agent {idx + 1}</span>}
                </span>
                {!member.expanded && displayModel && (
                  <ModelBadge provider={member.provider} model={displayModel.id} />
                )}
                {!member.expanded && member.mode && (
                  <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                    {member.mode === "TASK" ? "Task" : "Chat"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {members.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(member.id);
                    }}
                    className="p-1 text-muted-foreground hover:text-muted-foreground rounded transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                {member.expanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>

            {/* Expanded fields */}
            {member.expanded && (
              <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                {/* Name */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Role Name <span className="text-muted-foreground">*</span>
                  </label>
                  <input
                    type="text"
                    value={member.name}
                    onChange={(e) => onUpdate(member.id, "name", e.target.value)}
                    placeholder="e.g. Sales Lead Agent"
                    className="w-full rounded border border-border bg-card px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-kiln-orange focus:outline-none"
                  />
                </div>

                {/* Role type + Agent mode */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Role Type
                    </label>
                    <select
                      value={member.role}
                      onChange={(e) => onUpdate(member.id, "role", e.target.value)}
                      className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:border-kiln-orange focus:outline-none"
                    >
                      <option value="HEAD">HEAD</option>
                      <option value="COORDINATOR">COORDINATOR</option>
                      <option value="EXECUTOR">EXECUTOR</option>
                      <option value="REPORTER">REPORTER</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Agent Type
                    </label>
                    <select
                      value={member.mode}
                      onChange={(e) => onUpdate(member.id, "mode", e.target.value)}
                      className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:border-kiln-orange focus:outline-none"
                    >
                      <option value="TASK">Task Agent</option>
                      <option value="CHAT">Chat Agent</option>
                    </select>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Task = autonomous. Chat = customer-facing only.</p>
                  </div>
                </div>

                {/* Provider + Model */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      LLM Provider
                    </label>
                    <select
                      value={member.provider}
                      onChange={(e) => {
                        const prov = e.target.value as ProviderKey;
                        const models = getModelsForProvider(prov);
                        onUpdate(member.id, "provider", prov);
                        onUpdate(member.id, "model", models[0]?.id ?? "");
                      }}
                      className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:border-kiln-orange focus:outline-none"
                    >
                      {(Object.keys(PROVIDERS) as ProviderKey[]).map((p) => (
                        <option key={p} value={p}>
                          {PROVIDERS[p].label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Model
                    </label>
                    <select
                      value={member.model}
                      onChange={(e) => onUpdate(member.id, "model", e.target.value)}
                      className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:border-kiln-orange focus:outline-none"
                    >
                      {providerModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                          {m.badge ? ` — ${m.badge}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Reports To */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Reports To
                  </label>
                  <select
                    value={member.reportsTo}
                    onChange={(e) => onUpdate(member.id, "reportsTo", e.target.value)}
                    className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:border-kiln-orange focus:outline-none"
                  >
                    <option value="">None (top-level)</option>
                    {members
                      .filter((m) => m.id !== member.id)
                      .map((m) => (
                        <option key={m.id} value={m.name || m.id}>
                          {m.name || `Unnamed Agent ${members.indexOf(m) + 1}`}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Task Description + Auto-generate prompt */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Task Description <span className="text-muted-foreground">*</span>
                  </label>
                  <input
                    type="text"
                    value={taskDescs[member.id] ?? ""}
                    placeholder="e.g. Reads emails and extracts action items"
                    onChange={(e) => {
                      const taskDesc = e.target.value;
                      setTaskDescs((prev) => ({ ...prev, [member.id]: taskDesc }));
                      const prompt = taskDesc.trim()
                        ? generateMemberPrompt(member.role, taskDesc, teamGoal)
                        : "";
                      onUpdate(member.id, "systemPrompt", prompt);
                      // Auto-fill name for executors based on task description
                      if (member.role === "EXECUTOR" && !member.name && taskDesc.trim()) {
                        const words = taskDesc.trim().split(/\s+/).slice(0, 3).join(" ");
                        onUpdate(member.id, "name", words);
                      }
                    }}
                    className="w-full rounded border border-border bg-card px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-kiln-orange focus:outline-none"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Briefly describe what this agent does — a system prompt will be generated automatically.
                  </p>
                </div>

                {/* System Prompt (generated or manual) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      System Prompt
                    </label>
                    <button
                      type="button"
                      disabled={!member.name && !member.systemPrompt || enhancingIds.has(member.id)}
                      onClick={async () => {
                        setEnhancingIds((prev) => new Set(prev).add(member.id));
                        try {
                          const res = await fetch("/api/teams/suggest-structure", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              goal: `Generate ONLY a detailed system prompt for a single ${member.role} agent named "${member.name || "Agent"}" in a team. The team goal is: ${teamGoal || "General purpose"}. The agent's task: ${member.systemPrompt || member.name || "General tasks"}. Return JSON with a single roles array containing one object with a systemPrompt field.`,
                              teamName: "prompt-gen",
                            }),
                          });
                          if (res.ok) {
                            const data = await res.json();
                            const enhanced = data.roles?.[0]?.systemPrompt;
                            if (enhanced) onUpdate(member.id, "systemPrompt", enhanced);
                          }
                        } catch { /* ignore */ }
                        setEnhancingIds((prev) => {
                          const next = new Set(prev);
                          next.delete(member.id);
                          return next;
                        });
                      }}
                      className="flex items-center gap-1 text-[10px] text-kiln-orange hover:text-kiln-orange/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Sparkles className="h-3 w-3" />
                      {enhancingIds.has(member.id) ? "Generating..." : "Enhance with AI"}
                    </button>
                  </div>
                  <textarea
                    value={member.systemPrompt}
                    onChange={(e) => onUpdate(member.id, "systemPrompt", e.target.value)}
                    rows={4}
                    placeholder="Auto-generated from task description, or write your own..."
                    className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-kiln-orange focus:outline-none resize-none"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}

      <button
        onClick={onAdd}
        className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background/50 px-3 py-2.5 text-xs text-muted-foreground hover:border-kiln-orange/40 hover:text-foreground transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Member
      </button>
    </div>
  );
}

/* ---------- Manual Step 3: I/O Config ---------- */
function ManualStep3({
  members,
  onUpdate,
}: {
  members: ManualMember[];
  onUpdate: (id: string, field: keyof ManualMember, value: string) => void;
}) {
  const taskAgents = members.filter((m) => m.mode === "TASK");
  const chatAgents = members.filter((m) => m.mode === "CHAT");

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Configure triggers and outputs for Task Agents. Chat Agents respond to conversations and don&apos;t need I/O config.
      </p>

      {taskAgents.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/20 p-4 text-center">
          <p className="text-sm text-muted-foreground">
            No Task Agents defined. All members are Chat Agents — no I/O config needed.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Go back to Step 2 to change an agent type to &quot;Task Agent&quot; if needed.
          </p>
        </div>
      ) : (
        taskAgents.map((member) => (
          <div key={member.id} className="rounded-lg border border-border bg-background p-3 space-y-3">
            <div className="flex items-center gap-2">
              <RoleBadge role={member.role} />
              <span className="text-sm font-medium text-foreground">{member.name || "Unnamed"}</span>
              <span className="text-[10px] bg-green-500/15 text-muted-foreground px-1.5 py-0.5 rounded">Task Agent</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Trigger
                </label>
                <select
                  value={member.trigger}
                  onChange={(e) => onUpdate(member.id, "trigger", e.target.value)}
                  className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:border-kiln-orange focus:outline-none"
                >
                  <option value="MANUAL">Manual</option>
                  <option value="SCHEDULE">Schedule</option>
                  <option value="WEBHOOK">Webhook</option>
                  <option value="EVENT">Event</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Output
                </label>
                <select
                  value={member.output}
                  onChange={(e) => onUpdate(member.id, "output", e.target.value)}
                  className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:border-kiln-orange focus:outline-none"
                >
                  <option value="NEXT_AGENT">Next Agent</option>
                  <option value="EMAIL">Email</option>
                  <option value="HTTP">HTTP Request</option>
                  <option value="WEBHOOK">Webhook</option>
                  <option value="LOG">Log Only</option>
                </select>
              </div>
            </div>

            {member.output === "NEXT_AGENT" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Pass to Agent
                </label>
                <select
                  value={member.outputTarget}
                  onChange={(e) => onUpdate(member.id, "outputTarget", e.target.value)}
                  className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:border-kiln-orange focus:outline-none"
                >
                  <option value="">Select agent...</option>
                  {members
                    .filter((m) => m.id !== member.id)
                    .map((m) => (
                      <option key={m.id} value={m.name || m.id}>
                        {m.name || "Unnamed"}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {(member.output === "EMAIL" || member.output === "HTTP" || member.output === "WEBHOOK") && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {member.output === "EMAIL" ? "Email Address" : "URL"}
                </label>
                <input
                  type="text"
                  value={member.outputTarget}
                  onChange={(e) => onUpdate(member.id, "outputTarget", e.target.value)}
                  placeholder={member.output === "EMAIL" ? "you@example.com" : "https://..."}
                  className="w-full rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-kiln-orange focus:outline-none"
                />
              </div>
            )}
          </div>
        ))
      )}

      {chatAgents.length > 0 && taskAgents.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/10 p-2.5">
          <p className="text-xs text-muted-foreground">
            Chat Agents (no I/O config needed):{" "}
            {chatAgents.map((m) => m.name || "Unnamed").join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}

/* ---------- Create Workflow Modal ---------- */
type ModalMode = "pick" | "auto" | "manual";
type AutoStep = 1 | 2;
type ManualStep = 1 | 2 | 3 | 4;

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

  // Mode selection
  const [mode, setMode] = useState<ModalMode>("pick");

  // Shared state
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Auto-generate state
  const [autoStep, setAutoStep] = useState<AutoStep>(1);
  const [suggestedRoles, setSuggestedRoles] = useState<SuggestedRole[]>([]);
  const [generating, setGenerating] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  // Manual state
  const [manualStep, setManualStep] = useState<ManualStep>(1);
  const [teamTemplate, setTeamTemplate] = useState("");
  const [manualMembers, setManualMembers] = useState<ManualMember[]>([newManualMember()]);

  function reset() {
    setMode("pick");
    setName("");
    setGoal("");
    setError(null);
    setSubmitting(false);
    setAutoStep(1);
    setSuggestedRoles([]);
    setGenerating(false);
    setEditingIdx(null);
    setManualStep(1);
    setTeamTemplate("");
    setManualMembers([newManualMember()]);
  }

  function handleClose() {
    reset();
    onClose();
  }

  // ---- Auto: Step 1 → Step 2 ----
  async function handleAutoNext() {
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
        console.warn("[TEAMS] Generate error:", data);
        if (data.rawResponse) {
          throw new Error(`Parse error: ${data.parseError}\n\nRaw LLM response:\n${data.rawResponse.slice(0, 500)}`);
        }
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      // Ensure suggested roles have mode and model fields
      const roles: SuggestedRole[] = (data.roles || []).map((r: SuggestedRole) => ({
        suggestedProvider: "ANTHROPIC",
        suggestedModel: "claude-sonnet-4-6",
        ...r,
        // Default to Task unless Claude already set it or role name is customer-facing
        mode: r.mode || defaultAgentMode(r.role, r.name),
      }));
      setSuggestedRoles(roles);
      setAutoStep(2);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to generate structure";
      setError(message);
    } finally {
      setGenerating(false);
    }
  }

  // ---- Shared: Create team with roles ----
  async function handleCreate(roles: SuggestedRole[]) {
    setSubmitting(true);
    setError(null);

    try {
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

      // Generate members only if roles are provided
      if (roles.length > 0) {
        const membersRes = await fetch(`/api/teams/${team.id}/generate-members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roles }),
        });

        if (!membersRes.ok) {
          const data = await membersRes.json().catch(() => ({}));
          console.warn("[TEAMS] Generate members error:", data);
          if (data.rawResponse) {
            throw new Error(`Parse error: ${data.parseError}\n\nRaw LLM response:\n${data.rawResponse.slice(0, 500)}`);
          }
          throw new Error(data.error || `HTTP ${membersRes.status}`);
        }
      }

      handleClose();
      onCreated();
      router.push(`/dashboard/teams/${team.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create workflow";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  // ---- Quick Start: Create minimal workflow and go straight to canvas ----
  async function handleQuickStart() {
    if (!name.trim() || !goal.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
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
      handleClose();
      onCreated();
      router.push(`/dashboard/teams/${team.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create workflow";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  // ---- Auto review helpers ----
  function removeRole(idx: number) {
    setSuggestedRoles((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateRole(idx: number, field: keyof SuggestedRole, value: string) {
    setSuggestedRoles((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );
  }

  function addEmptyRole() {
    setSuggestedRoles((prev) => [
      ...prev,
      {
        name: "",
        role: "EXECUTOR",
        mode: "TASK",
        responsibilities: "",
        systemPrompt: "",
        suggestedProvider: "ANTHROPIC",
        suggestedModel: "claude-sonnet-4-6",
      },
    ]);
  }

  // ---- Manual member helpers ----
  const updateMember = useCallback(
    (id: string, field: keyof ManualMember, value: string | boolean) => {
      setManualMembers((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m;
          const updated = { ...m, [field]: value };
          // Auto-adjust mode and name when role changes
          if (field === "role") {
            const newRole = value as RoleType;
            updated.mode = defaultAgentMode(newRole, m.name);
            // Pre-fill name if empty or was a default name
            const prevDefault = defaultMemberName(m.role);
            if (!m.name || m.name === prevDefault) {
              updated.name = defaultMemberName(newRole);
            }
          }
          return updated;
        })
      );
    },
    []
  );

  function addMember() {
    setManualMembers((prev) => [...prev, newManualMember()]);
  }

  function removeMember(id: string) {
    setManualMembers((prev) => prev.filter((m) => m.id !== id));
  }

  function toggleExpand(id: string) {
    setManualMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, expanded: !m.expanded } : m))
    );
  }

  // Convert manual members to SuggestedRole[] for the API
  function manualMembersToRoles(): SuggestedRole[] {
    return manualMembers.map((m) => ({
      name: m.name || `Agent ${manualMembers.indexOf(m) + 1}`,
      role: m.role,
      mode: m.mode,
      suggestedModel: m.model,
      suggestedProvider: m.provider,
      responsibilities: m.systemPrompt,
      systemPrompt: m.systemPrompt,
      reportsTo: m.reportsTo || undefined,
    }));
  }

  if (!open) return null;

  /* ---- Determine header title & subtitle ---- */
  let headerTitle = "Create Workflow";
  let headerSub = "Choose how you want to build your workflow.";

  if (mode === "auto") {
    headerTitle = autoStep === 1 ? "Auto-Generate Workflow" : "Review Workflow Structure";
    headerSub =
      autoStep === 1
        ? "Define your workflow's name and goal. KILN will design the optimal agent structure."
        : `${suggestedRoles.length} agents suggested. Review, edit, then create.`;
  } else if (mode === "manual") {
    const manualStepLabels: Record<number, string> = { 1: "Workflow Basics", 2: "Define Roles", 4: "Review" };
    headerTitle = `Build Manually — ${manualStepLabels[manualStep] || "Review"}`;
    const manualStepSubs: Record<number, string> = {
      1: "Set the name, goal, and optional template for your workflow.",
      2: "Add and configure each agent member. Tools and data flow are auto-configured.",
      4: "Review the full workflow structure before creating.",
    };
    headerSub = manualStepSubs[manualStep] || "Review your workflow.";
  }

  /* ---- Validation helpers ---- */
  const autoStep1Valid = name.trim().length > 0 && goal.trim().length > 0;
  const manualStep1Valid = name.trim().length > 0 && goal.trim().length > 0;
  const manualStep2Valid = manualMembers.length === 0 || manualMembers.every((m) => m.name.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div className="relative z-10 w-full max-w-3xl rounded-xl border border-border bg-card shadow-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-border">
          <div>
            <h2 className="font-serif text-2xl text-foreground">{headerTitle}</h2>
            <p className="text-sm text-muted-foreground mt-1">{headerSub}</p>
          </div>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground transition-colors mt-0.5"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step Indicator (not shown on pick screen) */}
        {mode === "auto" && (
          <StepIndicator
            steps={["Name & Goal", "Review Structure"]}
            current={autoStep}
          />
        )}
        {mode === "manual" && (
          <StepIndicator
            steps={["Basics", "Roles", "Review"]}
            current={manualStep <= 2 ? manualStep : 3}
          />
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Mode picker */}
          {mode === "pick" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                How do you want to create your workflow?
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Auto-Generate card */}
                <button
                  onClick={() => setMode("auto")}
                  className="group flex flex-col gap-3 rounded-xl border border-border bg-background p-5 text-left transition-all hover:border-foreground/20 hover:bg-muted/40"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted group-hover:bg-muted transition-colors">
                    <Wand2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Auto-Generate</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Describe your goal. Claude suggests the optimal workflow structure with agents, roles, and prompts.
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium mt-auto">
                    Get started <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </button>

                {/* Build Manually card */}
                <button
                  onClick={() => setMode("manual")}
                  className="group flex flex-col gap-3 rounded-xl border border-border bg-background p-5 text-left transition-all hover:border-blue-500/50 hover:bg-blue-500/5"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted group-hover:bg-blue-500/20 transition-colors">
                    <Wrench className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Build Manually</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Define each agent yourself: role, model, system prompt, triggers, and outputs — step by step.
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium mt-auto">
                    4-step wizard <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Auto — Step 1 */}
          {mode === "auto" && autoStep === 1 && (
            <AutoStep1
              name={name}
              goal={goal}
              onNameChange={setName}
              onGoalChange={setGoal}
            />
          )}

          {/* Auto — Step 2 (review) */}
          {mode === "auto" && autoStep === 2 && (
            <ReviewStep
              roles={suggestedRoles}
              onUpdate={updateRole}
              onRemove={removeRole}
              onAdd={addEmptyRole}
              editingIdx={editingIdx}
              setEditingIdx={setEditingIdx}
            />
          )}

          {/* Manual — Step 1 */}
          {mode === "manual" && manualStep === 1 && (
            <ManualStep1
              name={name}
              goal={goal}
              teamTemplate={teamTemplate}
              onNameChange={setName}
              onGoalChange={setGoal}
              onTemplateChange={setTeamTemplate}
            />
          )}

          {/* Manual — Step 2 */}
          {mode === "manual" && manualStep === 2 && (
            <ManualStep2
              members={manualMembers}
              teamGoal={goal}
              onUpdate={updateMember}
              onAdd={addMember}
              onRemove={removeMember}
              onToggleExpand={toggleExpand}
            />
          )}

          {/* Manual — Step 3 */}
          {mode === "manual" && manualStep === 3 && (
            <ManualStep3
              members={manualMembers}
              onUpdate={(id, field, value) => updateMember(id, field, value)}
            />
          )}

          {/* Manual — Step 4 (review) */}
          {mode === "manual" && manualStep === 4 && (
            <ReviewStep
              roles={manualMembersToRoles()}
              onUpdate={(idx, field, value) => {
                // Sync back to manualMembers on edit
                const member = manualMembers[idx];
                if (!member) return;
                const fieldMap: Partial<Record<keyof SuggestedRole, keyof ManualMember>> = {
                  name: "name",
                  role: "role",
                  mode: "mode",
                  suggestedModel: "model",
                  suggestedProvider: "provider",
                  systemPrompt: "systemPrompt",
                  reportsTo: "reportsTo",
                };
                const manualField = fieldMap[field];
                if (manualField) {
                  updateMember(member.id, manualField, value);
                }
              }}
              onRemove={(idx) => {
                const member = manualMembers[idx];
                if (member) removeMember(member.id);
              }}
              onAdd={addMember}
              editingIdx={editingIdx}
              setEditingIdx={setEditingIdx}
            />
          )}

          {error && (
            <pre className="mt-4 text-sm text-destructive whitespace-pre-wrap break-all max-h-48 overflow-y-auto font-mono bg-destructive/5 rounded p-2">{error}</pre>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          {/* Left: back button */}
          <div>
            {mode === "auto" && autoStep === 2 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAutoStep(1)}
                className="text-muted-foreground"
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            )}
            {mode === "manual" && manualStep > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setManualStep((s) => (s === 4 ? 2 : (s - 1)) as ManualStep)}
                className="text-muted-foreground"
                disabled={submitting}
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            )}
            {(mode === "auto" || mode === "manual") && (mode === "auto" ? autoStep === 1 : manualStep === 1) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMode("pick")}
                className="text-muted-foreground"
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> Change Mode
              </Button>
            )}
          </div>

          {/* Right: cancel + primary action */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={generating || submitting}
            >
              Cancel
            </Button>

            {/* Pick screen — no primary CTA, both options are clickable cards */}
            {mode === "pick" && null}

            {/* Auto step 1 */}
            {mode === "auto" && autoStep === 1 && (
              <Button
                size="sm"
                onClick={handleAutoNext}
                disabled={generating || !autoStep1Valid}
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Designing workflow...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Structure
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </>
                )}
              </Button>
            )}

            {/* Auto step 2 */}
            {mode === "auto" && autoStep === 2 && (
              <Button
                size="sm"
                onClick={() => handleCreate(suggestedRoles)}
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
                    Create Workflow ({suggestedRoles.length} agents)
                  </>
                )}
              </Button>
            )}

            {/* Manual step 1: Skip to Canvas shortcut */}
            {mode === "manual" && manualStep === 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleQuickStart}
                disabled={submitting || !manualStep1Valid}
                className="border-foreground/20 text-muted-foreground hover:bg-muted"
              >
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <GitFork className="mr-2 h-4 w-4" />
                )}
                Skip to Canvas
              </Button>
            )}

            {/* Manual steps 1–2: Next (skip step 3 — I/O is auto-configured) */}
            {mode === "manual" && manualStep < 4 && manualStep !== 3 && (
              <Button
                size="sm"
                onClick={() => setManualStep((s) => (s === 2 ? 4 : (s + 1)) as ManualStep)}
                disabled={
                  (manualStep === 1 && !manualStep1Valid) ||
                  (manualStep === 2 && !manualStep2Valid)
                }
              >
                {manualStep === 2 ? "Review" : "Next"}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            )}

            {/* Manual step 4: Create */}
            {mode === "manual" && manualStep === 4 && (
              <Button
                size="sm"
                onClick={() => handleCreate(manualMembersToRoles())}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating workflow...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Workflow{manualMembers.length > 0 ? ` (${manualMembers.length} agents)` : ""}
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
  const [healthScores, setHealthScores] = useState<Record<string, { overall: number; color: "green" | "yellow" | "red"; direction: "up" | "down" | "stable" }>>({});

  // Phase A polish: list-page filters + search. Defaults to "all" so the
  // grid renders unchanged on first load; flipping the segmented control
  // narrows the list client-side without re-fetching.
  type StatusFilter = "all" | "active" | "paused";
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Import YAML state
  const [showImport, setShowImport] = useState(false);
  const [importYaml, setImportYaml] = useState("");
  const [importPreview, setImportPreview] = useState<{
    name: string;
    description?: string;
    agentCount: number;
    agents: { name: string; role: string; model: string }[];
    orchestrationRules: number;
  } | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

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
        if (Array.isArray(data)) {
          setTeams(data);
          // Fetch health scores for all teams
          for (const t of data as Team[]) {
            fetch(`/api/teams/${t.id}/health`)
              .then((r) => (r.ok ? r.json() : null))
              .then((hs) => {
                if (hs && typeof hs.overall === "number") {
                  setHealthScores((prev) => ({
                    ...prev,
                    [t.id]: { overall: hs.overall, color: hs.color, direction: hs.trend?.direction || "stable" },
                  }));
                }
              })
              .catch(() => {});
          }
        } else throw new Error("Unexpected API response");
      })
      .catch((err) => {
        console.error("Failed to load teams:", err);
        setError(err.message || "Error loading workflows");
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
          name: tpl?.label || "New Workflow",
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
      setError(err instanceof Error ? err.message : "Failed to create workflow");
    } finally {
      setCreatingTemplate(null);
    }
  }

  /* Loading state */
  async function previewImport() {
    if (!importYaml.trim()) return;
    setImportLoading(true);
    setImportError(null);
    try {
      const res = await fetch("/api/teams/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml: importYaml, preview: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Preview failed");
      setImportPreview(data);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setImportLoading(false);
    }
  }

  async function executeImport() {
    if (!importYaml.trim()) return;
    setImportLoading(true);
    setImportError(null);
    try {
      const res = await fetch("/api/teams/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml: importYaml }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setShowImport(false);
      setImportYaml("");
      setImportPreview(null);
      router.push(data.detailUrl || `/dashboard/teams/${data.teamId}`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImportLoading(false);
    }
  }

  function handleYamlFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setImportYaml(content);
      setImportPreview(null);
      setImportError(null);
    };
    reader.readAsText(file);
  }

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
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-foreground">Workflows</h1>
          <p className="mt-1.5 text-sm text-foreground">
            Coordinate groups of AI agents working toward shared goals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import YAML
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Workflow
          </Button>
        </div>
      </div>

      {/* Templates showcase — only rendered when the operator already has
          at least one workflow. The brand-new empty state renders its own
          quick-start cards below; showing both would double the surface
          for the same templates. */}
      {teams.length > 0 && (
      <div className="mb-8 rounded-2xl border border-border bg-card/60 p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Templates
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Deploy complete multi-agent workflows with industry customization in one flow.
            </p>
          </div>
          <Link
            href="/dashboard/teams/new"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-muted-foreground/80"
          >
            Browse all templates
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid gap-3 lg:grid-cols-4">
          {TEAM_TEMPLATE_SHOWCASE.map((template) => {
            const Icon = template.icon;

            return (
              <Link
                key={template.id}
                href={`/dashboard/teams/new?template=${template.id}`}
                className="rounded-xl border border-border bg-card p-4 transition-all duration-150 hover:bg-muted/40 hover:border-foreground/20"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {"industry" in template && template.industry && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-medium text-muted-foreground">
                        {template.industry}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {template.agents}
                    </span>
                  </div>
                </div>
                <h3 className="text-sm font-medium text-foreground">
                  {template.label}
                </h3>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                  {template.description}
                </p>
                <div className="mt-3 rounded-lg border border-border bg-card px-3 py-2 text-xs font-mono text-muted-foreground">
                  {template.flow}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
      )}

      {/* Quick Templates — also gated on having at least one workflow.
          Brand-new accounts see the rich empty state below, not these
          starter pills. */}
      {teams.length > 0 && (
      <div className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-orange-400/60">
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
      )}

      {/* Error state */}
      {error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            fetchTeams();
          }}
        />
      ) : teams.length === 0 ? (
        /* Rich empty state — three quick-start template cards above a
           "Build from scratch" CTA. Templates link straight into the
           one-click deploy flow at /dashboard/teams/new?template=…. */
        <div className="mx-auto flex max-w-3xl flex-col items-center py-10 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-muted/50">
            <Users className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="font-serif text-2xl text-foreground">
            Create your first workflow
          </h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Workflows orchestrate multiple AI agents to handle multi-step
            jobs — qualifying leads, processing documents, customer
            triage. Start from a template or build from scratch.
          </p>

          <p className="mt-8 mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Start with a template
          </p>
          <div className="grid w-full gap-3 sm:grid-cols-3">
            {TEAM_TEMPLATE_SHOWCASE.slice(0, 3).map((tpl) => {
              const Icon = tpl.icon;
              return (
                <Link
                  key={tpl.id}
                  href={`/dashboard/teams/new?template=${tpl.id}`}
                  className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-kiln-orange/40 hover:shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {tpl.agents}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {tpl.label}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {tpl.description}
                  </p>
                  <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-kiln-orange transition-transform group-hover:translate-x-0.5">
                    Use <ArrowRight className="h-3 w-3" />
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="my-8 flex w-full items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              or
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" size="sm" onClick={() => setShowCreate(true)} className="gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            Build from scratch
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        /* Team cards grid */
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-orange-400/60">
              Your Workflows
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search workflows…"
                  className="w-48 rounded-md border border-border bg-card pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-orange-500/60"
                />
              </div>
              <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
                {(["all", "active", "paused"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setStatusFilter(f)}
                    className={cn(
                      "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                      statusFilter === f
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {f === "all" ? "All" : f === "active" ? "Active" : "Paused"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(() => {
              const q = searchQuery.trim().toLowerCase();
              const filtered = teams
                .filter((t) => t.isOwner !== false)
                .filter((t) => {
                  if (statusFilter === "active") return t.status === "ACTIVE";
                  if (statusFilter === "paused") return t.status !== "ACTIVE";
                  return true;
                })
                .filter((t) => {
                  if (!q) return true;
                  return (
                    t.name.toLowerCase().includes(q) ||
                    (t.description ?? "").toLowerCase().includes(q) ||
                    (t.goal ?? "").toLowerCase().includes(q)
                  );
                });
              if (filtered.length === 0) {
                return (
                  <div className="col-span-full rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
                    <p className="text-sm text-foreground">No workflows match.</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Adjust the filter or search query.
                    </p>
                  </div>
                );
              }
              return filtered.map((team) => {
              const taskCount = team._count?.tasks ?? 0;
              const stats = team.runStats;
              const successRatePct =
                stats && stats.totalRuns > 0 && stats.successRate !== null
                  ? Math.round(stats.successRate * 100)
                  : null;
              const lastRunRelative = formatRelativeTime(stats?.lastRunAt);
              const avgDurationStr = formatDurationMs(stats?.avgDurationMs ?? null);

              return (
                <Link
                  key={team.id}
                  href={`/dashboard/teams/${team.id}`}
                  className="group relative flex flex-col rounded-xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition-all duration-150 hover:bg-muted/40 hover:border-foreground/20 hover:shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
                >
                  {/* Header row */}
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/[0.08] group-hover:bg-orange-500/[0.12] transition-colors">
                      <Users className="h-5 w-5 text-orange-300/50 group-hover:text-orange-300/70 transition-colors" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      {healthScores[team.id] && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Heart className="h-2.5 w-2.5" />
                          {healthScores[team.id].overall}%
                          {healthScores[team.id].direction === "up" && <TrendingUp className="h-2.5 w-2.5" />}
                          {healthScores[team.id].direction === "down" && <TrendingDown className="h-2.5 w-2.5" />}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        {team.status === "ACTIVE" ? (
                          <><span className="h-2 w-2 rounded-full bg-green-500" /><span>Active</span></>
                        ) : (
                          <><span className="h-2 w-2 rounded-full bg-amber-500/70" /><span>Paused</span></>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Name + Goal */}
                  <h3 className="mb-1 text-base font-medium text-foreground group-hover:text-orange-100 transition-colors flex items-center gap-2">
                    {team.name}
                    {team.parentTeamId && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground border border-border/50 font-normal">
                        <GitFork className="h-2.5 w-2.5" />
                        {team.name.includes("(Copy)") ? "Copy" : "Fork"}
                      </span>
                    )}
                  </h3>
                  <p className="mb-auto text-sm text-foreground line-clamp-2 min-h-[2rem]">
                    {team.goal || team.description || "No goal set"}
                  </p>

                  {/* Stats */}
                  <div className="mt-4 space-y-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3 w-3" />
                      <span>{roleCounts(team.members)}</span>
                    </div>
                    {team.scheduleSummary ? (
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="h-3 w-3" />
                        <span>{team.scheduleSummary}</span>
                      </div>
                    ) : null}
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

                    {/* Run-stats row. Surfaces only after the first
                        execution — empty workflows don't get a "0 runs"
                        line that would just take up vertical space. */}
                    {stats && stats.totalRuns > 0 && (
                      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                        <div className="flex items-center gap-1.5">
                          {successRatePct !== null ? (
                            <span
                              className={
                                successRatePct >= 90
                                  ? "inline-flex items-center gap-1 text-green-400"
                                  : successRatePct >= 60
                                    ? "inline-flex items-center gap-1 text-amber-400"
                                    : "inline-flex items-center gap-1 text-red-400"
                              }
                              title={`${stats.completedRuns} of ${stats.totalRuns} runs succeeded`}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-current" />
                              {successRatePct}%
                            </span>
                          ) : null}
                          <span className="text-muted-foreground">
                            · {stats.totalRuns} run{stats.totalRuns !== 1 ? "s" : ""}
                          </span>
                          {avgDurationStr && (
                            <span className="text-muted-foreground" title="Average duration of completed runs">
                              · {avgDurationStr} avg
                            </span>
                          )}
                        </div>
                        {lastRunRelative && (
                          <span
                            className="truncate"
                            title={
                              stats.lastRunAt
                                ? `Last run: ${new Date(stats.lastRunAt).toLocaleString()}`
                                : undefined
                            }
                          >
                            {lastRunRelative}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </Link>
              );
            });
            })()}

            {/* New Team card */}
            <button
              onClick={() => setShowCreate(true)}
              className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/30 p-5 text-muted-foreground transition-all duration-200 hover:border-orange-500/20 hover:text-foreground hover:bg-card/60 min-h-[220px]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/[0.06] mb-3">
                <Plus className="h-6 w-6" />
              </div>
              <span className="text-sm font-medium">Custom Workflow</span>
            </button>
          </div>

          {/* Shared with Me */}
          {teams.some((t) => t.isOwner === false) && (
            <>
              <h2 className="mt-8 mb-3 text-xs font-semibold uppercase tracking-widest text-orange-400/60">
                Shared with Me
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {teams.filter((t) => t.isOwner === false).map((team) => {
                  const taskCount = team._count?.tasks ?? 0;
                  const roleBadge = team.sharedRole || "VIEWER";
                  const roleStyle =
                    roleBadge === "EDITOR" ? "text-muted-foreground bg-muted border-blue-500/20"
                    : roleBadge === "APPROVER" ? "text-muted-foreground bg-muted border-purple-500/20"
                    : "text-muted-foreground bg-muted border-green-500/20";

                  return (
                    <Link
                      key={team.id}
                      href={`/dashboard/teams/${team.id}`}
                      className="group relative flex flex-col rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:border-foreground/20"
                    >
                      <div className="mb-3 flex items-start justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted transition-colors group-hover:bg-muted">
                          <Users className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", roleStyle)}>
                          {roleBadge}
                        </span>
                      </div>
                      <h3 className="mb-1 font-semibold text-foreground group-hover:text-muted-foreground transition-colors">
                        {team.name}
                      </h3>
                      <p className="mb-auto text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">
                        {team.goal || team.description || "No goal set"}
                      </p>
                      <div className="mt-4 space-y-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3 w-3" />
                          <span>{roleCounts(team.members)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Target className="h-3 w-3" />
                            <span>{taskCount} task{taskCount !== 1 ? "s" : ""}</span>
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
              </div>
            </>
          )}
        </>
      )}

      {/* Create Team Modal */}
      <CreateTeamModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={fetchTeams}
      />

      {/* Import YAML Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Import Workflow from YAML</h2>
                  <p className="text-sm text-muted-foreground">Upload a .yaml file or paste YAML content</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowImport(false);
                  setImportYaml("");
                  setImportPreview(null);
                  setImportError(null);
                }}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-6">
              {/* File upload */}
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-background/50 px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground">
                <FileText className="h-4 w-4" />
                <span>Drop or click to upload .yaml file</span>
                <input
                  type="file"
                  accept=".yaml,.yml"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleYamlFile(file);
                  }}
                />
              </label>

              {/* YAML editor */}
              <textarea
                value={importYaml}
                onChange={(e) => {
                  setImportYaml(e.target.value);
                  setImportPreview(null);
                  setImportError(null);
                }}
                placeholder={`name: My Workflow\ndescription: Workflow description\nagents:\n  - name: Qualifier\n    role: COORDINATOR\n    model: claude-sonnet-4-6\n    systemPrompt: |\n      You are a lead qualifier...`}
                rows={10}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/30 focus:border-kiln-orange focus:outline-none focus:ring-1 focus:ring-kiln-orange/30"
              />

              {/* Error */}
              {importError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {importError}
                </div>
              )}

              {/* Preview */}
              {importPreview && (
                <div className="rounded-xl border border-border bg-background/60 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    Import Preview
                  </div>
                  <div className="space-y-2 text-sm">
                    <p className="text-foreground">
                      <span className="text-muted-foreground">Workflow:</span>{" "}
                      <span className="font-medium">{importPreview.name}</span>
                    </p>
                    {importPreview.description && (
                      <p className="text-muted-foreground">{importPreview.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                        {importPreview.agentCount} Agents
                      </span>
                      <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                        {importPreview.orchestrationRules} Orchestration Rules
                      </span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {importPreview.agents.map((agent) => (
                        <div
                          key={agent.name}
                          className="flex items-center gap-2 rounded-lg border border-border/70 bg-card/70 px-3 py-2 text-xs"
                        >
                          <span className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                            roleColors[agent.role]?.bg || "bg-muted/60",
                            roleColors[agent.role]?.text || "text-muted-foreground"
                          )}>
                            {agent.role}
                          </span>
                          <span className="font-medium text-foreground">{agent.name}</span>
                          <span className="ml-auto text-muted-foreground">{agent.model}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between border-t border-border px-6 py-4">
              <button
                onClick={() => {
                  setShowImport(false);
                  setImportYaml("");
                  setImportPreview(null);
                  setImportError(null);
                }}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <div className="flex items-center gap-2">
                {!importPreview ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={previewImport}
                    disabled={!importYaml.trim() || importLoading}
                  >
                    {importLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="mr-2 h-4 w-4" />
                    )}
                    Preview
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={executeImport}
                    disabled={importLoading}
                  >
                    {importLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    Import Workflow
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
