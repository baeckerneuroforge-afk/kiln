"use client";

/**
 * Members tab — list users with access to the sub-org. Supports
 * inviting via the existing /api/agency/sub-orgs/[id]/invite endpoint
 * and removing members through the new DELETE membership endpoint.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, Shield, Trash2, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

type Member = {
  membershipId: string;
  userId: string | null;
  name: string;
  email: string | null;
  role: string;
  imageUrl: string | null;
  joinedAt: string;
};

interface MembersTabProps {
  subOrgId: string;
  subOrgName: string;
  readOnly: boolean;
}

export function MembersTab({ subOrgId, subOrgName, readOnly }: MembersTabProps) {
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"org:admin" | "org:member">(
    "org:member",
  );
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/agency/sub-orgs/${subOrgId}/members`);
    if (res.ok) {
      const body = await res.json();
      setMembers(body.items || []);
    }
    setLoading(false);
  }, [subOrgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await fetch(`/api/agency/sub-orgs/${subOrgId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast(body.error || "Invite failed", "error");
        return;
      }
      toast(`Invitation sent to ${inviteEmail}`);
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("org:member");
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (m: Member) => {
    if (!confirm(`Remove ${m.name} from ${subOrgName}?`)) return;
    setRemoving(m.membershipId);
    try {
      const res = await fetch(
        `/api/agency/sub-orgs/${subOrgId}/members/${m.membershipId}`,
        { method: "DELETE" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(body.error || "Remove failed", "error");
        return;
      }
      toast("Member removed");
      setMembers((prev) =>
        prev.filter((x) => x.membershipId !== m.membershipId),
      );
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-3" data-testid="members-tab">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {loading
            ? "Loading members…"
            : `${members.length} ${members.length === 1 ? "member" : "members"}`}
        </div>
        {!readOnly && (
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-1.5 h-3 w-3" />
            Invite member
          </Button>
        )}
      </div>

      {inviteOpen && !readOnly && (
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Mail className="h-3 w-3" />
            Invite a member to {subOrgName}
          </p>
          <input
            type="email"
            value={inviteEmail}
            autoFocus
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="email@client.com"
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={inviteRole}
              onChange={(e) =>
                setInviteRole(e.target.value as "org:admin" | "org:member")
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
                setInviteOpen(false);
                setInviteEmail("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-32 items-center justify-center rounded-xl border border-border bg-card/60">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : members.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/30 p-8 text-center">
          <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-foreground">No members yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Invite the first user to give them access.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {members.map((m) => {
            const isAdmin = m.role === "org:admin";
            return (
              <li
                key={m.membershipId}
                className="flex items-center gap-3 px-4 py-3 text-xs hover:bg-muted/30 transition-colors"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
                  {m.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.imageUrl}
                      alt=""
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    initials(m.name)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {m.name}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {m.email || m.userId || "—"}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                    isAdmin
                      ? "bg-kiln-orange/15 text-kiln-orange"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {isAdmin && <Shield className="h-2.5 w-2.5" />}
                  {isAdmin ? "Admin" : "Member"}
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => handleRemove(m)}
                    disabled={removing === m.membershipId}
                    className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-40"
                    title="Remove from sub-org"
                    aria-label={`Remove ${m.name}`}
                  >
                    {removing === m.membershipId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}
