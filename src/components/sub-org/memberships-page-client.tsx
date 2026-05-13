"use client";

/**
 * Sprint 19.7.6.1 — orchestrator for /dashboard/sub-org/[id]/memberships.
 *
 * Replaces the broken Sprint-19.7.3 "Mitglied einladen" link that
 * redirected through the agency-mode layout and bounced sub-org-mode
 * users to /dashboard. Owns the member list state + invite modal so
 * the whole flow stays inside the sub-org context.
 *
 * Server-rendered initial list is passed in via `initialMembers`; we
 * re-fetch /api/sub-orgs/[id]/memberships after a successful invite
 * to pick up the new row.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PermissionSet, SubOrgRole } from "@prisma/client";
import { Lock, UserPlus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { InviteSubOrgMemberModal } from "@/components/sub-org/invite-sub-org-member-modal";

export type MembershipRow = {
  id: string;
  userId: string;
  role: SubOrgRole;
  permissionSet: PermissionSet;
  displayName: string;
  email: string | null;
  pending: boolean;
};

export function MembershipsPageClient({
  subOrgId,
  subOrgName,
  canManage,
  members,
}: {
  subOrgId: string;
  subOrgName: string;
  canManage: boolean;
  members: MembershipRow[];
}) {
  const router = useRouter();
  const [showInvite, setShowInvite] = useState(false);

  return (
    <div data-testid="sub-org-memberships-client">
      <div className="mb-4 flex items-center justify-end">
        {canManage ? (
          <button
            type="button"
            onClick={() => setShowInvite(true)}
            className={cn(buttonVariants({ variant: "default" }))}
            data-testid="sub-org-memberships-invite-cta"
          >
            <UserPlus className="mr-1 h-4 w-4" /> Mitglied einladen
          </button>
        ) : (
          <span
            data-testid="sub-org-memberships-readonly-badge"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card/40 px-3 py-1.5 text-xs text-muted-foreground"
          >
            <Lock className="h-3 w-3" /> Nur Lesen
          </span>
        )}
      </div>

      {members.length === 0 ? (
        <div
          className="rounded-xl border border-dashed border-border bg-card/30 p-10 text-center"
          data-testid="sub-org-memberships-empty"
        >
          <p className="text-base font-medium text-foreground">Noch keine Members.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage
              ? `Lade Team-Members ein, damit sie an ${subOrgName} arbeiten können.`
              : "Kontaktiere deine Agency, um Members hinzuzufügen."}
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="sub-org-memberships-list">
          {members.map((m) => (
            <div key={m.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{m.displayName}</p>
                  {m.email && (
                    <p className="mt-1 text-xs text-muted-foreground">{m.email}</p>
                  )}
                  {m.pending && (
                    <span className="mt-1 inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                      Einladung ausstehend
                    </span>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-medium text-foreground">{m.role}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {m.permissionSet.replace(/_/g, " ").toLowerCase()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showInvite && (
        <InviteSubOrgMemberModal
          subOrgId={subOrgId}
          onClose={() => setShowInvite(false)}
          onInvited={() => {
            setShowInvite(false);
            // Server component re-renders + fresh getSubOrgMemberships
            // result re-flows through props on next paint.
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
