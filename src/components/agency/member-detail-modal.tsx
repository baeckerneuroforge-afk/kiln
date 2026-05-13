"use client";

/**
 * Sprint 19.7.6 — edit one agency-membership.
 *
 * Three actions:
 *   1. Change role (gated to OWNER if touching another OWNER)
 *   2. Change which Sub-Orgs this member can see — only for the two
 *      roles that aren't auto-granted everything (CONSULTANT, VIEWER)
 *   3. Remove the membership (gated: cannot remove self, cannot remove
 *      last OWNER)
 */
import { useState } from "react";
import type { AgencyRole, PermissionSet } from "@prisma/client";
import { X, Loader2, Trash2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import type {
  AgencySubOrgOption,
  TeamMemberRow,
} from "@/components/agency/team-page-client";

const ROLE_OPTIONS: { value: AgencyRole; label: string }[] = [
  { value: "OWNER", label: "Owner" },
  { value: "ADMIN", label: "Admin" },
  { value: "CONSULTANT", label: "Consultant" },
  { value: "VIEWER", label: "Viewer" },
];

const PERMISSION_OPTIONS: { value: PermissionSet; label: string }[] = [
  { value: "READ_ONLY", label: "Read only" },
  { value: "USE_AGENTS", label: "Use agents" },
  { value: "USE_AGENTS_PLUS_KNOWLEDGE", label: "+ Knowledge" },
  { value: "FULL_ACCESS", label: "Full access" },
];

function isAssignableScope(role: AgencyRole): boolean {
  return role === "CONSULTANT" || role === "VIEWER";
}

export function MemberDetailModal({
  member,
  subOrgs,
  callerUserId,
  callerRole,
  onClose,
  onChanged,
}: {
  member: TeamMemberRow;
  subOrgs: AgencySubOrgOption[];
  callerUserId: string;
  callerRole: AgencyRole;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [role, setRole] = useState<AgencyRole>(member.role);
  const [selected, setSelected] = useState<Map<string, PermissionSet | null>>(() => {
    const map = new Map<string, PermissionSet | null>();
    for (const a of member.subOrgAccess) {
      map.set(a.subOrgId, a.permissionOverride);
    }
    return map;
  });
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSelf = member.userId === callerUserId;
  const canTouchOwner = callerRole === "OWNER";
  const targetIsOwner = member.role === "OWNER";
  const editingLocked = targetIsOwner && !canTouchOwner;

  // Role options shown — drop OWNER for non-OWNER callers.
  const allowedRoleOptions = ROLE_OPTIONS.filter(
    (r) => r.value !== "OWNER" || canTouchOwner,
  );

  function toggleSubOrg(id: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, null);
      return next;
    });
  }

  function setOverride(id: string, override: PermissionSet | "") {
    setSelected((prev) => {
      const next = new Map(prev);
      next.set(id, override === "" ? null : override);
      return next;
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { role };
      if (isAssignableScope(role)) {
        const ids = Array.from(selected.keys());
        body.subOrgIds = ids;
        const overrides: Record<string, PermissionSet> = {};
        for (const [id, override] of selected.entries()) {
          if (override) overrides[id] = override;
        }
        body.permissionOverrides = overrides;
      } else {
        // OWNER/ADMIN: clear assignments (they have implicit all-sub-orgs).
        body.subOrgIds = [];
      }

      const res = await fetch(`/api/agency/team/${member.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Speichern fehlgeschlagen (${res.status})`);
        return;
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Netzwerkfehler");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Mitglied "${member.email ?? member.userId}" wirklich entfernen?`)) {
      return;
    }
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/agency/team/${member.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Entfernen fehlgeschlagen (${res.status})`);
        return;
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Netzwerkfehler");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="member-detail-title"
      data-testid="agency-team-detail-modal"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 id="member-detail-title" className="font-serif text-lg text-foreground">
            {member.name ?? member.email ?? "Mitglied"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {editingLocked ? (
          <div className="px-5 py-6 text-sm text-muted-foreground" data-testid="agency-team-detail-locked">
            Nur ein OWNER kann andere OWNER bearbeiten.
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4 px-5 py-4">
            {member.email && (
              <div className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {member.email}
              </div>
            )}

            <fieldset>
              <legend className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Rolle
              </legend>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as AgencyRole)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-kiln-orange focus:outline-none"
                data-testid="agency-team-detail-role-select"
              >
                {allowedRoleOptions.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </fieldset>

            {isAssignableScope(role) && (
              <fieldset>
                <legend className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Sub-Org-Zugriff
                </legend>
                {subOrgs.length === 0 ? (
                  <p className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    Keine Sub-Orgs vorhanden.
                  </p>
                ) : (
                  <div
                    className="max-h-56 space-y-1.5 overflow-y-auto rounded-md border border-border bg-background/40 p-2"
                    data-testid="agency-team-detail-suborgs"
                  >
                    {subOrgs.map((s) => {
                      const checked = selected.has(s.id);
                      const override = selected.get(s.id) ?? "";
                      return (
                        <div
                          key={s.id}
                          className="flex items-center justify-between gap-2 rounded px-2 py-1.5"
                        >
                          <label className="flex flex-1 items-center gap-2 text-sm text-foreground">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSubOrg(s.id)}
                              className="accent-kiln-orange"
                            />
                            {s.name}
                          </label>
                          {checked && (
                            <select
                              value={override}
                              onChange={(e) =>
                                setOverride(s.id, e.target.value as PermissionSet | "")
                              }
                              className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground"
                              aria-label={`Permission override for ${s.name}`}
                            >
                              <option value="">Standard</option>
                              {PERMISSION_OPTIONS.map((p) => (
                                <option key={p.value} value={p.value}>
                                  {p.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </fieldset>
            )}

            {error && (
              <p
                className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
                data-testid="agency-team-detail-error"
              >
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {!isSelf && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "border-red-500/40 text-red-400 hover:bg-red-500/10",
                  )}
                  data-testid="agency-team-detail-delete"
                >
                  {deleting ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-1 h-4 w-4" />
                  )}
                  Entfernen
                </button>
              )}
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={cn(buttonVariants({ variant: "default" }))}
                  data-testid="agency-team-detail-save"
                >
                  {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Speichern
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
