"use client";

/**
 * Sprint 19.7.6 — invite a teammate to the agency.
 *
 * Email + role + (optional) sub-org assignments. OWNER/ADMIN invitations
 * skip the sub-org multi-select because those roles always see every
 * sub-org. CONSULTANT/VIEWER must pick at least one sub-org if they're
 * meant to be useful — but we don't enforce that here, the agency owner
 * can intentionally invite a member with no access yet.
 */
import { useState } from "react";
import type { AgencyRole } from "@prisma/client";
import { X, Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import type { AgencySubOrgOption } from "@/components/agency/team-page-client";

const ROLE_OPTIONS: { value: AgencyRole; label: string; hint: string }[] = [
  { value: "OWNER", label: "Owner", hint: "Vollzugriff inkl. Billing." },
  { value: "ADMIN", label: "Admin", hint: "Alles außer Billing." },
  {
    value: "CONSULTANT",
    label: "Consultant",
    hint: "Bearbeitet zugewiesene Sub-Orgs.",
  },
  {
    value: "VIEWER",
    label: "Viewer",
    hint: "Nur Lesezugriff auf zugewiesene Sub-Orgs.",
  },
];

function isAssignableScope(role: AgencyRole): boolean {
  return role === "CONSULTANT" || role === "VIEWER";
}

export function InviteMemberModal({
  subOrgs,
  callerRole,
  onClose,
  onInvited,
}: {
  subOrgs: AgencySubOrgOption[];
  callerRole: AgencyRole;
  onClose: () => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AgencyRole>("VIEWER");
  const [selectedSubOrgIds, setSelectedSubOrgIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Non-OWNERs cannot invite an OWNER.
  const allowedRoles = ROLE_OPTIONS.filter(
    (r) => r.value !== "OWNER" || callerRole === "OWNER",
  );

  function toggleSubOrg(id: string) {
    setSelectedSubOrgIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !email.includes("@")) {
      setError("Bitte eine gültige E-Mail-Adresse eingeben.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/agency/team", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          role,
          subOrgIds: isAssignableScope(role) ? Array.from(selectedSubOrgIds) : [],
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Einladung fehlgeschlagen (${res.status})`);
        return;
      }
      onInvited();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Netzwerkfehler");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-member-title"
      data-testid="agency-team-invite-modal"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 id="invite-member-title" className="font-serif text-lg text-foreground">
            Mitglied einladen
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

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              E-Mail
            </span>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-kiln-orange focus:outline-none"
              placeholder="kollege@agency.de"
              data-testid="agency-team-invite-email"
            />
          </label>

          <fieldset>
            <legend className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Rolle
            </legend>
            <div className="space-y-1.5">
              {allowedRoles.map((r) => (
                <label
                  key={r.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition-colors",
                    role === r.value
                      ? "border-kiln-orange/60 bg-kiln-orange/5"
                      : "border-border hover:bg-muted/30",
                  )}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r.value}
                    checked={role === r.value}
                    onChange={() => setRole(r.value)}
                    className="mt-0.5 accent-kiln-orange"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">{r.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{r.hint}</p>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>

          {isAssignableScope(role) && (
            <fieldset>
              <legend className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sub-Org-Zugriff
              </legend>
              {subOrgs.length === 0 ? (
                <p className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Du hast noch keine Sub-Orgs. Lege zuerst eine an, dann kannst du Zugriff verteilen.
                </p>
              ) : (
                <div
                  className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border bg-background/40 p-2"
                  data-testid="agency-team-invite-suborg-list"
                >
                  {subOrgs.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 rounded px-2 py-1 text-sm text-foreground hover:bg-muted/40"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSubOrgIds.has(s.id)}
                        onChange={() => toggleSubOrg(s.id)}
                        className="accent-kiln-orange"
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          )}

          {error && (
            <p
              className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
              data-testid="agency-team-invite-error"
            >
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
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
              data-testid="agency-team-invite-submit"
            >
              {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Einladen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
