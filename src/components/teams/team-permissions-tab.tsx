"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Crown,
  Edit3,
  Eye,
  Loader2,
  Mail,
  Shield,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PermissionEntry {
  id: string;
  email: string;
  role: "EDITOR" | "VIEWER" | "APPROVER";
  status: "PENDING" | "ACTIVE" | "REVOKED";
  userId: string | null;
  invitedAt: string;
  acceptedAt: string | null;
}

interface OwnerInfo {
  userId: string;
  email: string;
  name: string | null;
}

interface TeamPermissionsTabProps {
  teamId: string;
  isOwner: boolean;
}

const ROLE_CONFIG: Record<string, { label: string; description: string; icon: React.ReactNode; color: string }> = {
  OWNER: {
    label: "Owner",
    description: "Volle Kontrolle",
    icon: <Crown className="h-3.5 w-3.5" />,
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
  EDITOR: {
    label: "Editor",
    description: "Agents & Prompts bearbeiten, Ausführungen starten",
    icon: <Edit3 className="h-3.5 w-3.5" />,
    color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  },
  VIEWER: {
    label: "Viewer",
    description: "Nur lesen: Ausführungen & Analytics",
    icon: <Eye className="h-3.5 w-3.5" />,
    color: "text-green-400 bg-green-500/10 border-green-500/20",
  },
  APPROVER: {
    label: "Approver",
    description: "Approval-Gate-Anfragen genehmigen/ablehnen",
    icon: <ShieldCheck className="h-3.5 w-3.5" />,
    color: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  },
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
  ACTIVE: "border-green-500/30 bg-green-500/10 text-green-300",
  REVOKED: "border-red-500/30 bg-red-500/10 text-red-300",
};

export function TeamPermissionsTab({ teamId, isOwner }: TeamPermissionsTabProps) {
  const [owner, setOwner] = useState<OwnerInfo | null>(null);
  const [permissions, setPermissions] = useState<PermissionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"EDITOR" | "VIEWER" | "APPROVER">("VIEWER");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const fetchPermissions = useCallback(async () => {
    try {
      const res = await fetch(`/api/teams/${teamId}/permissions`);
      if (res.ok) {
        const data = await res.json();
        setOwner(data.owner);
        setPermissions(data.permissions.filter((p: PermissionEntry) => p.status !== "REVOKED"));
      }
    } catch {
      // Fehler still behandeln
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError("");
    setInviteSuccess("");

    try {
      const res = await fetch(`/api/teams/${teamId}/permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Einladung fehlgeschlagen");
      }

      setInviteEmail("");
      setInviteSuccess(`Einladung an ${inviteEmail.trim()} gesendet.`);
      fetchPermissions();
      setTimeout(() => setInviteSuccess(""), 4000);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setInviting(false);
    }
  }

  async function handleChangeRole(permId: string, newRole: string) {
    setChangingRole(permId);
    try {
      await fetch(`/api/teams/${teamId}/permissions/${permId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      fetchPermissions();
    } catch {
      // Fehler still behandeln
    } finally {
      setChangingRole(null);
    }
  }

  async function handleRevoke(permId: string) {
    if (!confirm("Zugriff wirklich widerrufen?")) return;
    setRevoking(permId);
    try {
      await fetch(`/api/teams/${teamId}/permissions/${permId}`, {
        method: "DELETE",
      });
      fetchPermissions();
    } catch {
      // Fehler still behandeln
    } finally {
      setRevoking(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10">
          <Shield className="h-4 w-4 text-orange-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Workflow-Mitglieder & Berechtigungen</h3>
          <p className="text-xs text-muted-foreground">Verwalte, wer Zugriff auf diesen Workflow hat.</p>
        </div>
      </div>

      {/* Invite Form — only for owners */}
      {isOwner && (
        <div className="rounded-xl border border-border bg-card/50 p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <UserPlus className="h-4 w-4 text-orange-400" />
            <h4 className="text-xs font-semibold text-foreground">Neues Mitglied einladen</h4>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">E-Mail-Adresse</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => { setInviteEmail(e.target.value); setInviteError(""); }}
                placeholder="email@example.com"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-orange-500/50 focus:outline-none"
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Rolle</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "EDITOR" | "VIEWER" | "APPROVER")}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-orange-500/50 focus:outline-none"
              >
                <option value="VIEWER">Viewer</option>
                <option value="EDITOR">Editor</option>
                <option value="APPROVER">Approver</option>
              </select>
            </div>
            <Button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
              size="sm"
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4 mr-1.5" />}
              Einladen
            </Button>
          </div>
          {inviteError && <p className="text-xs text-red-400">{inviteError}</p>}
          {inviteSuccess && <p className="text-xs text-green-400">{inviteSuccess}</p>}
        </div>
      )}

      {/* Members List */}
      <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
        {/* Owner row */}
        {owner && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10">
                <Crown className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {owner.name || owner.email}
                </p>
                {owner.name && <p className="text-[11px] text-muted-foreground">{owner.email}</p>}
              </div>
            </div>
            <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase", ROLE_CONFIG.OWNER.color)}>
              Owner
            </span>
          </div>
        )}

        {/* Permission rows */}
        {permissions.map((perm) => {
          const roleConf = ROLE_CONFIG[perm.role] || ROLE_CONFIG.VIEWER;
          return (
            <div key={perm.id} className="flex items-center justify-between px-5 py-4 border-b border-border last:border-b-0">
              <div className="flex items-center gap-3">
                <div className={cn("flex h-8 w-8 items-center justify-center rounded-full", roleConf.color.split(" ")[1])}>
                  {roleConf.icon}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{perm.email}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase", STATUS_STYLES[perm.status])}>
                      {perm.status === "PENDING" ? "Ausstehend" : perm.status === "ACTIVE" ? "Aktiv" : "Widerrufen"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {perm.status === "PENDING"
                        ? `Eingeladen ${new Date(perm.invitedAt).toLocaleDateString("de-DE")}`
                        : perm.acceptedAt
                          ? `Beigetreten ${new Date(perm.acceptedAt).toLocaleDateString("de-DE")}`
                          : ""}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isOwner ? (
                  <>
                    <select
                      value={perm.role}
                      onChange={(e) => handleChangeRole(perm.id, e.target.value)}
                      disabled={changingRole === perm.id}
                      className="rounded-lg border border-border bg-card px-2 py-1 text-[11px] text-foreground focus:border-orange-500/50 focus:outline-none"
                    >
                      <option value="VIEWER">Viewer</option>
                      <option value="EDITOR">Editor</option>
                      <option value="APPROVER">Approver</option>
                    </select>
                    <button
                      onClick={() => handleRevoke(perm.id)}
                      disabled={revoking === perm.id}
                      className="rounded-lg p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Zugriff widerrufen"
                    >
                      {revoking === perm.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </>
                ) : (
                  <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase", roleConf.color)}>
                    {roleConf.label}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {permissions.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            Noch keine weiteren Mitglieder.
            {isOwner && " Lade jemanden ein, um loszulegen."}
          </div>
        )}
      </div>

      {/* Role Legend */}
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(ROLE_CONFIG).filter(([k]) => k !== "OWNER").map(([key, conf]) => (
          <div key={key} className="rounded-lg border border-border bg-card/30 px-4 py-3 flex items-start gap-2.5">
            <div className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md", conf.color.split(" ")[1])}>
              {conf.icon}
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">{conf.label}</p>
              <p className="text-[10px] text-muted-foreground">{conf.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
