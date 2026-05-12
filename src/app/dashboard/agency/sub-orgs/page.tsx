"use client";

/**
 * Agency → Sub-Orgs management page.
 *
 * Lists every sub-org owned by the active agency, with create / archive
 * / login-as-client controls. Read-only for non-agency callers — the
 * page renders a "plan upgrade required" message instead of the list.
 *
 * Server endpoints used:
 *   - GET    /api/agency/sub-orgs               list
 *   - POST   /api/agency/sub-orgs               create
 *   - DELETE /api/agency/sub-orgs/[id]          archive
 *   - POST   /api/agency/login-as-client        switch into a sub-org
 *   - POST   /api/agency/sub-orgs/[id]/invite   invite member by email
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Archive,
  Building2,
  ChevronRight,
  Loader2,
  LogIn,
  Mail,
  Plus,
  Users,
} from "lucide-react";
import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

type SubOrg = {
  id: string;
  childOrgId: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  createdAt: string;
  agentCount: number;
};

export default function AgencySubOrgsPage() {
  const router = useRouter();
  const { setActive } = useClerk();
  const { toast } = useToast();

  const [subOrgs, setSubOrgs] = useState<SubOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const [inviteOpenFor, setInviteOpenFor] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"org:admin" | "org:member">(
    "org:member"
  );
  const [inviting, setInviting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agency/sub-orgs");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to load sub-orgs");
      setSubOrgs(body.subOrgs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sub-orgs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/agency/sub-orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast(body.error || "Failed to create sub-org", "error");
        return;
      }
      setSubOrgs((prev) => [body, ...prev]);
      setNewName("");
      setCreateOpen(false);
      toast("Sub-org created");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Network error", "error");
    } finally {
      setCreating(false);
    }
  }

  async function handleArchive(id: string) {
    if (!confirm("Archive this sub-org? Its login will be disabled.")) return;
    const res = await fetch(`/api/agency/sub-orgs/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast(body.error || "Archive failed", "error");
      return;
    }
    setSubOrgs((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "ARCHIVED" } : s))
    );
    toast("Sub-org archived");
  }

  async function handleLoginAsClient(subOrgId: string) {
    const res = await fetch("/api/agency/login-as-client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subOrgId }),
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
          "error"
        );
      }
    }
  }

  async function handleInvite() {
    if (!inviteOpenFor) return;
    setInviting(true);
    try {
      const res = await fetch(
        `/api/agency/sub-orgs/${inviteOpenFor}/invite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
        }
      );
      const body = await res.json();
      if (!res.ok) {
        toast(body.error || "Invite failed", "error");
        return;
      }
      toast(`Invitation sent to ${inviteEmail}`);
      setInviteOpenFor(null);
      setInviteEmail("");
      setInviteRole("org:member");
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-2xl text-foreground">
            <Building2 className="h-5 w-5 text-kiln-orange" />
            Client workspaces
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Provision a separate workspace for each client. They get their own
            agents and knowledge bases; you stay the billing owner and can
            jump in as a client at any time.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/onboarding" className={buttonVariants()}>
            <Plus className="h-4 w-4" />
            Add Customer
          </Link>
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New sub-org
          </Button>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-32 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading sub-orgs…
        </div>
      ) : subOrgs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/30 p-10 text-center">
          <Building2 className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <p className="text-base font-medium text-foreground">
            Noch keine Sub-Orgs.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Lege deine erste an um zu starten.
          </p>
          <div className="mt-5 flex justify-center">
            <Button onClick={() => setCreateOpen(true)} data-testid="sub-orgs-empty-cta">
              <Plus className="mr-1.5 h-4 w-4" />
              Create your first Sub-Org
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {subOrgs.map((s) => (
            <div
              key={s.id}
              className={cn(
                "group rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20",
                s.status !== "ACTIVE" && "opacity-60"
              )}
            >
              <div className="flex items-start justify-between gap-4">
                {/* Title block — clickable navigation to detail page.
                    Quick-action buttons live in their own div outside
                    the link so clicking them doesn't navigate. */}
                <Link
                  href={`/dashboard/agency/sub-orgs/${s.id}`}
                  className="flex min-w-0 flex-1 items-start gap-2 -m-1 rounded-lg p-1 transition-colors hover:bg-muted/30"
                  data-testid="sub-org-card-link"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 text-sm font-semibold text-foreground group-hover:text-kiln-orange transition-colors">
                      {s.name}
                      <ChevronRight className="h-3.5 w-3.5 -ml-0.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-muted-foreground" />
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          s.status === "ACTIVE"
                            ? "bg-green-500/15 text-green-400"
                            : s.status === "SUSPENDED"
                              ? "bg-amber-500/15 text-amber-400"
                              : "bg-muted text-muted-foreground"
                        )}
                      >
                        {s.status}
                      </span>
                      <span>{s.agentCount} agents</span>
                      <span className="font-mono text-[10px]">
                        {s.childOrgId}
                      </span>
                    </div>
                  </div>
                </Link>
                <div className="flex shrink-0 gap-1.5">
                  {s.status === "ACTIVE" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLoginAsClient(s.id);
                        }}
                        title="Switch into this workspace as a client"
                      >
                        <LogIn className="mr-1 h-3 w-3" />
                        Login as User
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInviteOpenFor(s.id);
                        }}
                      >
                        <Mail className="mr-1 h-3 w-3" />
                        Invite
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleArchive(s.id);
                        }}
                      >
                        <Archive className="mr-1 h-3 w-3" />
                        Archive
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {inviteOpenFor === s.id && (
                <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <Users className="h-3 w-3" />
                    Invite a member to {s.name}
                  </p>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="email@client.com"
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                  />
                  <div className="flex items-center gap-2">
                    <select
                      value={inviteRole}
                      onChange={(e) =>
                        setInviteRole(
                          e.target.value as "org:admin" | "org:member"
                        )
                      }
                      className="rounded border border-border bg-background px-2 py-1.5 text-xs"
                    >
                      <option value="org:member">Member</option>
                      <option value="org:admin">Admin</option>
                    </select>
                    <Button
                      size="sm"
                      onClick={handleInvite}
                      disabled={inviting || !inviteEmail.trim()}
                    >
                      {inviting ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : null}
                      Send invite
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setInviteOpenFor(null);
                        setInviteEmail("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
            <h2 className="font-serif text-lg text-foreground">
              Create a new client workspace
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              The new org appears in the org switcher. You&apos;ll be added as
              its admin automatically.
            </p>
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Acme Corp"
              maxLength={100}
              className="mt-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-kiln-orange/40 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim() && !creating) {
                  void handleCreate();
                }
              }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
              >
                {creating ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : null}
                Create
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
