"use client";

/**
 * Sub-Org detail page — the main "manage one client workspace"
 * surface for agency users.
 *
 * Layout: top bar (back link, name, status, quick actions) + 7 tabs
 * (Overview, Agents, Workflows, Members, Pricing, Branding, Activity).
 * The page parallel-loads metadata, stats, branding, and the
 * pricing/subscription/connect triplet on mount so tabs feel instant
 * after the initial open.
 *
 * Pricing + Subscription tabs are hosted from sub-pages (kept in
 * separate files to keep this one focused on the cross-tab shell).
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import {
  Activity as ActivityIcon,
  ArrowLeft,
  Archive,
  BarChart3,
  Bot,
  Building2,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  GitBranch,
  Loader2,
  LogIn,
  Mail,
  Palette,
  Settings,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import { OverviewTab } from "./_tabs/overview-tab";
import { AgentsTab } from "./_tabs/agents-tab";
import { WorkflowsTab } from "./_tabs/workflows-tab";
import { MembersTab } from "./_tabs/members-tab";
import { PricingTab } from "./_tabs/pricing-tab";
import { BrandingTab } from "./_tabs/branding-tab";
import { ActivityTab } from "./_tabs/activity-tab";

export type SubOrgMeta = {
  id: string;
  childOrgId: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  createdAt: string;
  pricingMode: "NONE" | "FIXED" | "CUSTOM";
};

type TabKey =
  | "overview"
  | "agents"
  | "workflows"
  | "members"
  | "pricing"
  | "branding"
  | "activity";

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "agents", label: "Agents", icon: Bot },
  { key: "workflows", label: "Workflows", icon: GitBranch },
  { key: "members", label: "Members", icon: Users },
  { key: "pricing", label: "Pricing", icon: CreditCard },
  { key: "branding", label: "Branding", icon: Palette },
  { key: "activity", label: "Activity", icon: ActivityIcon },
];

export default function SubOrgDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const router = useRouter();
  const { setActive } = useClerk();
  const { toast } = useToast();

  const [tab, setTab] = useState<TabKey>("overview");
  const [meta, setMeta] = useState<SubOrgMeta | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    setError(null);
    try {
      const res = await fetch(`/api/agency/sub-orgs/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to load (${res.status})`);
      }
      setMeta(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sub-org");
    } finally {
      setLoadingMeta(false);
    }
  }, [id]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const handleCopyOrgId = useCallback(async () => {
    if (!meta) return;
    try {
      await navigator.clipboard.writeText(meta.childOrgId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast("Could not copy to clipboard", "error");
    }
  }, [meta, toast]);

  const handleLoginAsClient = useCallback(async () => {
    if (!meta || meta.status !== "ACTIVE") return;
    const res = await fetch("/api/agency/login-as-client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subOrgId: id }),
    });
    const body = await res.json();
    if (!res.ok) {
      toast(body.error || "Login failed", "error");
      return;
    }
    if (setActive) {
      try {
        await setActive({ organization: body.childOrgId });
        router.push("/dashboard");
      } catch (err) {
        toast(
          err instanceof Error ? err.message : "Could not switch org",
          "error",
        );
      }
    }
  }, [id, meta, router, setActive, toast]);

  const handleArchive = useCallback(async () => {
    if (!meta || meta.status !== "ACTIVE") return;
    if (!confirm(`Archive "${meta.name}"? Their login will be disabled.`)) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/agency/sub-orgs/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast(body.error || "Archive failed", "error");
        return;
      }
      toast("Sub-org archived");
      void loadMeta();
    } finally {
      setArchiving(false);
    }
  }, [id, meta, toast, loadMeta]);

  // ─── render ────────────────────────────────────────────────
  if (loadingMeta) {
    return (
      <div className="mx-auto max-w-6xl">
        <Link
          href="/dashboard/agency/sub-orgs"
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sub-orgs
        </Link>
        <div className="flex h-48 items-center justify-center rounded-xl border border-border bg-card/60">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !meta) {
    return (
      <div className="mx-auto max-w-6xl">
        <Link
          href="/dashboard/agency/sub-orgs"
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sub-orgs
        </Link>
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-300">
          {error || "Sub-org not found"}
        </div>
      </div>
    );
  }

  const statusColor =
    meta.status === "ACTIVE"
      ? "bg-green-500/15 text-green-400"
      : meta.status === "SUSPENDED"
        ? "bg-amber-500/15 text-amber-400"
        : "bg-muted text-muted-foreground";

  const isArchived = meta.status === "ARCHIVED";
  const ageDays = Math.floor(
    (Date.now() - new Date(meta.createdAt).getTime()) / (24 * 60 * 60 * 1000),
  );
  const ageLabel =
    ageDays === 0
      ? "Created today"
      : ageDays === 1
        ? "Created 1 day ago"
        : `Created ${ageDays} days ago`;

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/dashboard/agency/sub-orgs"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to sub-orgs
      </Link>

      {/* ─── Top bar ─── */}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card/40 p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <Building2 className="h-5 w-5 shrink-0 text-kiln-orange" />
            <h1 className="font-serif text-2xl text-foreground" data-testid="sub-org-name">
              {meta.name}
            </h1>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                statusColor,
              )}
              data-testid="sub-org-status"
            >
              {meta.status}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={handleCopyOrgId}
              className="inline-flex items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] transition-colors hover:border-foreground/30 hover:text-foreground"
              title="Copy org ID"
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {meta.childOrgId}
            </button>
            <span>{ageLabel}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {meta.status === "ACTIVE" && (
            <>
              <Button size="sm" onClick={handleLoginAsClient}>
                <LogIn className="mr-1 h-3 w-3" />
                Login as client
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setTab("members")}
              >
                <Mail className="mr-1 h-3 w-3" />
                Invite
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleArchive}
                disabled={archiving}
              >
                {archiving ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Archive className="mr-1 h-3 w-3" />
                )}
                Archive
              </Button>
            </>
          )}
        </div>
      </header>

      {isArchived && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
          <Archive className="h-3.5 w-3.5" />
          This sub-org is archived. All actions are read-only.
        </div>
      )}

      {/* ─── Tabs ─── */}
      <div
        className="mb-6 flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card/60 p-1"
        role="tablist"
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
        <Link
          href={`/dashboard/agency/sub-orgs/${id}#external`}
          className="ml-auto inline-flex items-center gap-1 px-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors opacity-60"
          aria-hidden
          tabIndex={-1}
        >
          <ExternalLink className="h-2.5 w-2.5" />
        </Link>
      </div>

      {tab === "overview" && (
        <OverviewTab subOrgId={id} meta={meta} onJumpTab={setTab} />
      )}
      {tab === "agents" && (
        <AgentsTab
          subOrgId={id}
          subOrgName={meta.name}
          readOnly={isArchived}
          onLoginAsClient={handleLoginAsClient}
        />
      )}
      {tab === "workflows" && (
        <WorkflowsTab
          subOrgId={id}
          subOrgName={meta.name}
          readOnly={isArchived}
          onLoginAsClient={handleLoginAsClient}
        />
      )}
      {tab === "members" && (
        <MembersTab subOrgId={id} subOrgName={meta.name} readOnly={isArchived} />
      )}
      {tab === "pricing" && (
        <PricingTab relationshipId={id} readOnly={isArchived} />
      )}
      {tab === "branding" && (
        <BrandingTab
          subOrgId={id}
          childOrgId={meta.childOrgId}
          readOnly={isArchived}
        />
      )}
      {tab === "activity" && <ActivityTab subOrgId={id} />}
    </div>
  );
}
