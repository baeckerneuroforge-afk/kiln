"use client";

/**
 * Sprint 19.7.6.1 — invite a teammate into a single Sub-Org.
 *
 * Mirrors agency/InviteMemberModal but talks to the Sprint-19.7.1
 * endpoint POST /api/agency/sub-orgs/[id]/invite. Two axes:
 *   - SubOrgRole       (OWNER / ADMIN / MEMBER / VIEWER)
 *   - PermissionSet    (READ_ONLY / USE_AGENTS / ... / FULL_ACCESS)
 *
 * The endpoint maps SubOrgRole → Clerk org:admin/org:member and does
 * Path-A (existing user → direct attachment) vs Path-B (fresh email →
 * Clerk invitation), so this UI stays a thin POST + state shell.
 */
import { useState } from "react";
import type { PermissionSet, SubOrgRole } from "@prisma/client";
import { X, Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS: { value: SubOrgRole; label: string; hint: string }[] = [
  { value: "OWNER", label: "Owner", hint: "Vollzugriff. Kann Members verwalten." },
  { value: "ADMIN", label: "Admin", hint: "Vollzugriff, ohne Member-Management." },
  { value: "MEMBER", label: "Member", hint: "Standardrolle für Mitarbeitende." },
  { value: "VIEWER", label: "Viewer", hint: "Nur Lesezugriff." },
];

const PERMISSION_OPTIONS: { value: PermissionSet; label: string; hint: string }[] = [
  { value: "READ_ONLY", label: "Read only", hint: "Conversations + Analytics lesen." },
  { value: "USE_AGENTS", label: "Use agents", hint: "+ Agents lesen + ausführen." },
  {
    value: "USE_AGENTS_PLUS_KNOWLEDGE",
    label: "+ Knowledge",
    hint: "+ Knowledge-Base lesen + schreiben.",
  },
  {
    value: "FULL_ACCESS",
    label: "Full access",
    hint: "Alles inkl. Agents/Workflows/Integrations + Member-Mgmt.",
  },
];

export function InviteSubOrgMemberModal({
  subOrgId,
  onClose,
  onInvited,
}: {
  subOrgId: string;
  onClose: () => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<SubOrgRole>("MEMBER");
  const [permissionSet, setPermissionSet] = useState<PermissionSet>("USE_AGENTS");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !email.includes("@")) {
      setError("Bitte eine gültige E-Mail-Adresse eingeben.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/agency/sub-orgs/${subOrgId}/invite`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role, permissionSet }),
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
      aria-labelledby="sub-org-invite-title"
      data-testid="sub-org-memberships-invite-modal"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 id="sub-org-invite-title" className="font-serif text-lg text-foreground">
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
              placeholder="member@kunde.de"
              data-testid="sub-org-memberships-invite-email"
            />
          </label>

          <fieldset>
            <legend className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Rolle
            </legend>
            <div className="space-y-1.5" data-testid="sub-org-memberships-invite-roles">
              {ROLE_OPTIONS.map((r) => (
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

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Berechtigungs-Set
            </span>
            <select
              value={permissionSet}
              onChange={(e) => setPermissionSet(e.target.value as PermissionSet)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-kiln-orange focus:outline-none"
              data-testid="sub-org-memberships-invite-permission-set"
            >
              {PERMISSION_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label} — {p.hint}
                </option>
              ))}
            </select>
          </label>

          {error && (
            <p
              className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
              data-testid="sub-org-memberships-invite-error"
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
              data-testid="sub-org-memberships-invite-submit"
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
