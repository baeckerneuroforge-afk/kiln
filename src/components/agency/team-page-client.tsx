"use client";

/**
 * Sprint 19.7.6 — orchestrator for /dashboard/agency/team.
 *
 * Owns the list state + modals. Re-fetches the member list whenever an
 * invite/update/delete completes so the table stays in sync without a
 * full page navigation.
 */
import { useCallback, useEffect, useState } from "react";
import type { AgencyRole, PermissionSet } from "@prisma/client";
import { UserPlus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { InviteMemberModal } from "@/components/agency/invite-member-modal";
import { MemberDetailModal } from "@/components/agency/member-detail-modal";

export type TeamMemberRow = {
  id: string;
  userId: string;
  role: AgencyRole;
  name: string | null;
  email: string | null;
  invitedAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
  assignedSubOrgCount: number;
  subOrgAccess: { id: string; subOrgId: string; permissionOverride: PermissionSet | null }[];
  hasAllSubOrgs: boolean;
};

export type AgencySubOrgOption = { id: string; name: string };

const ROLE_BADGE: Record<AgencyRole, string> = {
  OWNER: "bg-kiln-orange/15 text-kiln-orange",
  ADMIN: "bg-purple-500/15 text-purple-400",
  CONSULTANT: "bg-sky-500/15 text-sky-400",
  VIEWER: "bg-muted text-muted-foreground",
};

export function TeamPageClient({
  callerUserId,
  callerRole,
  subOrgs,
}: {
  callerUserId: string;
  callerRole: AgencyRole;
  subOrgs: AgencySubOrgOption[];
}) {
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [selected, setSelected] = useState<TeamMemberRow | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agency/team", { cache: "no-store" });
      if (!res.ok) {
        setError(`Konnte Mitglieder nicht laden (${res.status})`);
        setMembers([]);
        return;
      }
      const data = (await res.json()) as { members: TeamMemberRow[] };
      setMembers(data.members ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Netzwerkfehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div data-testid="agency-team-client">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Mitglieder werden geladen…"
            : `${members.length} ${members.length === 1 ? "Mitglied" : "Mitglieder"}`}
        </p>
        <button
          type="button"
          onClick={() => setShowInvite(true)}
          className={cn(buttonVariants({ variant: "default" }))}
          data-testid="agency-team-invite-button"
        >
          <UserPlus className="mr-1 h-4 w-4" /> Mitglied einladen
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {!loading && members.length === 0 && !error ? (
        <div
          className="rounded-xl border border-dashed border-border bg-card/30 p-10 text-center"
          data-testid="agency-team-empty"
        >
          <p className="text-base font-medium text-foreground">Noch keine Mitglieder.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Lade Teamkollegen ein, damit sie Sub-Orgs verwalten können.
          </p>
        </div>
      ) : (
        <ul className="space-y-2" data-testid="agency-team-list">
          {members.map((m) => {
            const displayName = m.name ?? m.email ?? m.userId;
            const pending = !m.acceptedAt;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setSelected(m)}
                  className="w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-kiln-orange/40"
                  data-testid={`agency-team-row-${m.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{displayName}</p>
                      {m.email && <p className="mt-1 text-xs text-muted-foreground">{m.email}</p>}
                      {pending && (
                        <span className="mt-1 inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                          Einladung ausstehend
                        </span>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          ROLE_BADGE[m.role],
                        )}
                      >
                        {m.role}
                      </span>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {m.hasAllSubOrgs
                          ? "alle Sub-Orgs"
                          : m.assignedSubOrgCount === 0
                            ? "keine Sub-Orgs zugewiesen"
                            : `${m.assignedSubOrgCount} Sub-Org${
                                m.assignedSubOrgCount === 1 ? "" : "s"
                              }`}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {showInvite && (
        <InviteMemberModal
          subOrgs={subOrgs}
          callerRole={callerRole}
          onClose={() => setShowInvite(false)}
          onInvited={() => {
            setShowInvite(false);
            void reload();
          }}
        />
      )}

      {selected && (
        <MemberDetailModal
          member={selected}
          subOrgs={subOrgs}
          callerUserId={callerUserId}
          callerRole={callerRole}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}
