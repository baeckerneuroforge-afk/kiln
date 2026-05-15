"use client";

/**
 * Sprint 19.8 — Custom-Domains settings client orchestrator.
 *
 * Renders the domain list, the "add domain" modal, and the
 * verify/delete affordances on each row. Communicates with three
 * server-side endpoints under /api/sub-orgs/[id]/domains/*.
 *
 * Permission-gating: the parent server component computes `canManage`
 * once (OWNER/ADMIN or memberships.manage). The client uses it to
 * hide the mutation CTAs for read-only members. The API also enforces
 * the same check — defense in depth.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Globe, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button-variants";

export interface DomainRow {
  id: string;
  hostname: string;
  status: "PENDING" | "VERIFYING" | "ACTIVE" | "FAILED";
  sslStatus: string | null;
  isPrimary: boolean;
  createdAt: string;
}

export function DomainsSettingsClient({
  subOrgId,
  canManage,
  initialDomains,
}: {
  subOrgId: string;
  canManage: boolean;
  initialDomains: DomainRow[];
}) {
  const router = useRouter();
  const [domains] = useState<DomainRow[]>(initialDomains);
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function verify(domainId: string) {
    setBusyId(domainId);
    setError(null);
    try {
      const res = await fetch(
        `/api/sub-orgs/${subOrgId}/domains/${domainId}/verify`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Verify failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verify failed");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(domainId: string) {
    const confirmed = window.confirm("Domain wirklich entfernen?");
    if (!confirmed) return;
    setBusyId(domainId);
    setError(null);
    try {
      const res = await fetch(`/api/sub-orgs/${subOrgId}/domains/${domainId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Delete failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-4" data-testid="domains-settings">
      {error && (
        <div
          className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          data-testid="domains-error"
        >
          {error}
        </div>
      )}

      {domains.length === 0 ? (
        <div
          className="rounded-xl border border-dashed border-border p-6 text-center"
          data-testid="domains-empty"
        >
          <Globe className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Noch keine Custom-Domain hinterlegt.
          </p>
        </div>
      ) : (
        <ul className="space-y-2" data-testid="domains-list">
          {domains.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
              data-testid={`domain-row-${d.id}`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {d.hostname}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Hinzugefügt {new Date(d.createdAt).toLocaleDateString("de-DE")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={d.status} />
                {canManage && d.status !== "ACTIVE" && (
                  <button
                    type="button"
                    onClick={() => verify(d.id)}
                    disabled={busyId === d.id}
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "sm" }),
                      "text-xs",
                    )}
                    data-testid={`domain-verify-${d.id}`}
                  >
                    {busyId === d.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Verify
                  </button>
                )}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => remove(d.id)}
                    disabled={busyId === d.id}
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "sm" }),
                      "text-xs text-red-400 hover:text-red-300",
                    )}
                    data-testid={`domain-remove-${d.id}`}
                    aria-label="Domain entfernen"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className={cn(buttonVariants({ variant: "default" }))}
            data-testid="domains-add-button"
          >
            Domain hinzufügen
          </button>
        </div>
      )}

      {showAdd && (
        <AddDomainModal
          subOrgId={subOrgId}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: DomainRow["status"] }) {
  const meta: Record<
    DomainRow["status"],
    { label: string; className: string; icon: React.ReactNode }
  > = {
    PENDING: {
      label: "Ausstehend",
      className: "bg-amber-500/20 text-amber-300 border-amber-500/30",
      icon: <Loader2 className="mr-1 h-3 w-3 animate-spin" />,
    },
    VERIFYING: {
      label: "Wird verifiziert",
      className: "bg-blue-500/20 text-blue-300 border-blue-500/30",
      icon: <Loader2 className="mr-1 h-3 w-3 animate-spin" />,
    },
    ACTIVE: {
      label: "Aktiv",
      className: "bg-green-500/20 text-green-300 border-green-500/30",
      icon: <Check className="mr-1 h-3 w-3" />,
    },
    FAILED: {
      label: "Fehlgeschlagen",
      className: "bg-red-500/20 text-red-300 border-red-500/30",
      icon: <X className="mr-1 h-3 w-3" />,
    },
  };
  const cfg = meta[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
        cfg.className,
      )}
      data-testid={`domain-status-${status}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function AddDomainModal({
  subOrgId,
  onClose,
  onCreated,
}: {
  subOrgId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [hostname, setHostname] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    hostname: string;
    dnsHint: { type: string; name: string; value: string };
  } | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sub-orgs/${subOrgId}/domains`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostname }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        hostname?: string;
        dnsHint?: { type: string; name: string; value: string };
      };
      if (!res.ok) {
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      // Show the DNS-hint screen so the user can copy the record.
      if (body.hostname && body.dnsHint) {
        setCreated({ hostname: body.hostname, dnsHint: body.dnsHint });
      } else {
        onCreated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  function copyValue(value: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(value);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      data-testid="add-domain-modal"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-lg text-foreground">
            {created ? "DNS-Eintrag setzen" : "Domain hinzufügen"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!created ? (
          <>
            <label className="block text-xs text-muted-foreground" htmlFor="hostname">
              Hostname
            </label>
            <input
              id="hostname"
              type="text"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="ai.deine-firma.de"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              data-testid="add-domain-hostname"
            />
            {error && (
              <p
                className="mt-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
                data-testid="add-domain-error"
              >
                {error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className={cn(buttonVariants({ variant: "ghost" }))}
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting || !hostname.trim()}
                className={cn(buttonVariants({ variant: "default" }))}
                data-testid="add-domain-submit"
              >
                {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Hinzufügen
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Lege den folgenden DNS-Eintrag bei deinem Domain-Provider an.
              Sobald er propagiert ist (1–60 Minuten), klick &quot;Verify&quot;
              auf der Domain-Karte.
            </p>
            <dl className="mt-4 space-y-2 rounded-md border border-border bg-background p-4 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Typ</dt>
                <dd className="font-mono">{created.dnsHint.type}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-mono">{created.dnsHint.name}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Wert</dt>
                <dd className="flex items-center gap-2 font-mono">
                  {created.dnsHint.value}
                  <button
                    type="button"
                    onClick={() => copyValue(created.dnsHint.value)}
                    className="text-xs text-kiln-orange hover:underline"
                  >
                    kopieren
                  </button>
                </dd>
              </div>
            </dl>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={onCreated}
                className={cn(buttonVariants({ variant: "default" }))}
              >
                Fertig
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
