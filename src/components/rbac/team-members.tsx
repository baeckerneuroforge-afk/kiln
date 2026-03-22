"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Plus,
  Trash2,
  Loader2,
  Mail,
  Shield,
  Clock,
  Check,
  AlertTriangle,
  Send,
  X,
  Crown,
  Eye,
  Wrench,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  userId: string | null;
  email: string;
  role: string;
  status: string;
  joinedAt: string | null;
  createdAt: string;
}

const ROLE_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  OWNER: { label: "Owner", icon: Crown, color: "text-kiln-orange" },
  ADMIN: { label: "Admin", icon: Shield, color: "text-kiln-blue" },
  BUILDER: { label: "Builder", icon: Wrench, color: "text-kiln-green" },
  VIEWER: { label: "Viewer", icon: Eye, color: "text-stone-400" },
  APPROVER: { label: "Approver", icon: UserCheck, color: "text-purple-400" },
};

const ASSIGNABLE_ROLES = ["ADMIN", "BUILDER", "VIEWER", "APPROVER"];

// ── Main Component ───────────────────────────────────────────

export function TeamMembersManager() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/team/members");
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      }
    } catch {
      setError("Mitglieder konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleRoleChange = async (memberId: string, newRole: string) => {
    try {
      const res = await fetch(`/api/team/members/${memberId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        await fetchMembers();
      } else {
        const data = await res.json();
        setError(data.error || "Rolle konnte nicht geändert werden");
      }
    } catch {
      setError("Netzwerkfehler");
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!confirm("Mitglied wirklich entfernen?")) return;
    try {
      const res = await fetch(`/api/team/members/${memberId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.id !== memberId));
      } else {
        const data = await res.json();
        setError(data.error || "Mitglied konnte nicht entfernt werden");
      }
    } catch {
      setError("Netzwerkfehler");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-stone-500" />
      </div>
    );
  }

  const activeMembers = members.filter((m) => m.status === "active");
  const pendingInvites = members.filter((m) => m.status === "invited");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-kiln-orange" />
          <h2 className="text-lg font-serif text-white">Team-Mitglieder</h2>
          <span className="text-sm text-stone-500">{activeMembers.length} aktiv</span>
        </div>
        <Button
          onClick={() => setShowInvite(true)}
          className="bg-kiln-orange hover:bg-kiln-orange/90 text-white"
          size="sm"
        >
          <Plus className="w-4 h-4 mr-1" />
          Einladen
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 p-3 rounded-lg">
          <AlertTriangle className="w-4 h-4" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Invite Form */}
      {showInvite && (
        <InviteForm
          onInvited={() => {
            setShowInvite(false);
            fetchMembers();
          }}
          onCancel={() => setShowInvite(false)}
        />
      )}

      {/* Active Members */}
      <div>
        <h3 className="text-sm font-medium text-stone-400 mb-3">Aktive Mitglieder</h3>
        <div className="space-y-2">
          {activeMembers.map((member) => {
            const config = ROLE_CONFIG[member.role] || ROLE_CONFIG.VIEWER;
            const RoleIcon = config.icon;
            return (
              <div
                key={member.id}
                className="flex items-center justify-between p-4 rounded-lg border border-stone-800 bg-stone-900/30"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-stone-800 flex items-center justify-center">
                    <span className="text-xs text-stone-400 uppercase">
                      {member.email.slice(0, 2)}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm text-white">{member.email}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <RoleIcon className={cn("w-3 h-3", config.color)} />
                      <span className={cn("text-xs", config.color)}>{config.label}</span>
                      {member.joinedAt && (
                        <span className="text-xs text-stone-600 ml-2">
                          seit {new Date(member.joinedAt).toLocaleDateString("de-DE")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {member.role !== "OWNER" && (
                  <div className="flex items-center gap-2">
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.id, e.target.value)}
                      className="text-xs bg-stone-800 border border-stone-700 rounded px-2 py-1 text-white focus:outline-none focus:border-kiln-orange"
                    >
                      {ASSIGNABLE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_CONFIG[role]?.label || role}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(member.id)}
                      className="text-stone-400 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-stone-400 mb-3">
            Offene Einladungen ({pendingInvites.length})
          </h3>
          <div className="space-y-2">
            {pendingInvites.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-4 rounded-lg border border-stone-800/50 bg-stone-900/20"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-stone-800/50 flex items-center justify-center">
                    <Mail className="w-3.5 h-3.5 text-stone-500" />
                  </div>
                  <div>
                    <div className="text-sm text-stone-300">{member.email}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3 text-stone-500" />
                      <span className="text-xs text-stone-500">
                        Eingeladen am {new Date(member.createdAt).toLocaleDateString("de-DE")}
                      </span>
                      <span className="text-xs text-stone-600 ml-1">
                        als {ROLE_CONFIG[member.role]?.label || member.role}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-stone-400 hover:text-white text-xs"
                    onClick={() => {
                      // TODO: Resend invite email
                    }}
                  >
                    <Send className="w-3.5 h-3.5 mr-1" />
                    Erneut senden
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(member.id)}
                    className="text-stone-400 hover:text-red-400"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Invite Form ──────────────────────────────────────────────

function InviteForm({
  onInvited,
  onCancel,
}: {
  onInvited: () => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("BUILDER");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email) {
      setError("E-Mail ist erforderlich");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/team/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Einladung fehlgeschlagen");
        return;
      }

      onInvited();
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-kiln-orange/30 bg-stone-900/50 p-6 space-y-4">
      <h3 className="text-lg font-serif text-white">Mitglied einladen</h3>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 p-3 rounded">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-stone-400 mb-1">E-Mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="mitglied@beispiel.de"
            className="w-full px-3 py-2 rounded-md bg-stone-900 border border-stone-700 text-white placeholder:text-stone-600 focus:border-kiln-orange focus:outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-stone-400 mb-1">Rolle</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-stone-900 border border-stone-700 text-white focus:border-kiln-orange focus:outline-none text-sm"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_CONFIG[r]?.label || r}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          onClick={handleSubmit}
          disabled={saving}
          className="bg-kiln-orange hover:bg-kiln-orange/90 text-white"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
          Einladen
        </Button>
        <Button variant="ghost" onClick={onCancel} className="text-stone-400">
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
