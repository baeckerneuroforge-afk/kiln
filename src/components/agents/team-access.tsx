"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Trash2,
  UserPlus,
  Mail,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";

interface TeamMember {
  id: string;
  email: string;
  role: "VIEWER" | "EDITOR";
  invitedAt: string;
  acceptedAt: string | null;
}

export function TeamAccess({ agentId }: { agentId: string }) {
  const { toast } = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"VIEWER" | "EDITOR">("VIEWER");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/team`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMembers(data.members || []);
    } catch {
      // Failed to load
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const inviteMember = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError("");

    try {
      const res = await fetch(`/api/agents/${agentId}/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      toast("Invitation sent!");
      setMembers((prev) => [data.member, ...prev]);
      setInviteEmail("");
    } catch {
      setError("Failed to send invitation. Please try again.");
    } finally {
      setInviting(false);
    }
  };

  const removeMember = async (memberId: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/team`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast("Member removed");
    } catch {
      toast("Failed to remove member", "error");
    }
  };

  return (
    <div className="mt-4 space-y-4">
      {/* Invite form */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Invite Team Member
        </label>
        <div className="flex gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => { setInviteEmail(e.target.value); setError(""); }}
            placeholder="colleague@company.com"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/30 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/20"
            onKeyDown={(e) => { if (e.key === "Enter") inviteMember(); }}
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as "VIEWER" | "EDITOR")}
            className="rounded-lg border border-border bg-background px-2 py-2 text-xs text-foreground focus:border-purple-500 focus:outline-none"
          >
            <option value="VIEWER">Viewer</option>
            <option value="EDITOR">Editor</option>
          </select>
          <button
            onClick={inviteMember}
            disabled={inviting || !inviteEmail.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-purple-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-purple-500/90 disabled:opacity-50"
          >
            {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            Invite
          </button>
        </div>
        {error && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Members list */}
      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : members.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground py-3">
          No team members yet. Invite colleagues to give them access.
        </p>
      ) : (
        <div className="space-y-1.5">
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-500/10">
                <Mail className="h-3.5 w-3.5 text-purple-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate">{member.email}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                    member.role === "EDITOR" ? "bg-blue-500/10 text-blue-400" : "bg-muted text-muted-foreground"
                  )}>
                    {member.role}
                  </span>
                  {member.acceptedAt ? (
                    <span className="flex items-center gap-1 text-[9px] text-kiln-green">
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      Accepted
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                      <Clock className="h-2.5 w-2.5" />
                      Pending
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => removeMember(member.id)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
