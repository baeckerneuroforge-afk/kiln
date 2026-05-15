"use client";

/**
 * Sprint 19.8.1 — agency-domain settings client.
 *
 * Renders one of four states based on the AgencyDomain row's status:
 *
 *   - none      (no row)     → hero + CTA opens setup modal
 *   - PENDING   / VERIFYING  → status card with DNS instructions + verify button
 *   - ACTIVE                 → success card with SSL info + edit/delete
 *   - FAILED                 → error card with retry CTA
 *
 * The setup modal is a 3-step wizard:
 *   1. Hostname input (live validation)
 *   2. DNS records display (delegated to DnsSetupInstructions)
 *   3. Verify trigger + transition to PENDING/VERIFYING state
 *
 * Permission gating is server-authoritative: canManage / canVerify
 * come from the parent server component. The API also enforces.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ExternalLink,
  Globe,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  DnsSetupInstructions,
  type DnsHint,
} from "@/components/agency/dns-setup-instructions";

export interface AgencyDomainRow {
  id: string;
  hostname: string;
  status: "PENDING" | "VERIFYING" | "ACTIVE" | "FAILED";
  sslStatus: string | null;
  sslIssuedAt: string | null;
  isPrimary: boolean;
  createdAt: string;
}

export function AgencyDomainSettingsClient({
  initialDomain,
  canManage,
  canVerify,
}: {
  initialDomain: AgencyDomainRow | null;
  canManage: boolean;
  canVerify: boolean;
}) {
  const router = useRouter();
  const [showSetup, setShowSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agency/domain/${id}/verify`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Verify failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verify failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Domain wirklich entfernen? Deine Customers landen danach wieder auf kilnbase.com.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agency/domain/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Delete failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  if (!initialDomain) {
    return (
      <>
        <EmptyHero canManage={canManage} onSetup={() => setShowSetup(true)} />
        {showSetup && (
          <SetupModal
            onClose={() => setShowSetup(false)}
            onCreated={() => {
              setShowSetup(false);
              router.refresh();
            }}
          />
        )}
      </>
    );
  }

  if (initialDomain.status === "ACTIVE") {
    return (
      <ActiveCard
        domain={initialDomain}
        canManage={canManage}
        onRemove={() => remove(initialDomain.id)}
        busy={busy}
        error={error}
      />
    );
  }
  if (initialDomain.status === "FAILED") {
    return (
      <FailedCard
        domain={initialDomain}
        canVerify={canVerify}
        onRetry={() => verify(initialDomain.id)}
        onRemove={canManage ? () => remove(initialDomain.id) : null}
        busy={busy}
        error={error}
      />
    );
  }

  // PENDING / VERIFYING
  return (
    <SetupInProgressCard
      domain={initialDomain}
      canVerify={canVerify}
      canManage={canManage}
      onVerify={() => verify(initialDomain.id)}
      onRemove={canManage ? () => remove(initialDomain.id) : null}
      busy={busy}
      error={error}
    />
  );
}

function EmptyHero({
  canManage,
  onSetup,
}: {
  canManage: boolean;
  onSetup: () => void;
}) {
  return (
    <section
      className="rounded-2xl border border-border bg-card p-8"
      data-testid="agency-domain-empty"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-kiln-orange/10">
          <Globe className="h-6 w-6 text-kiln-orange" />
        </div>
        <div className="flex-1">
          <h2 className="font-serif text-xl text-foreground">
            Whitelabel-Custom-Domain für deine Agency
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Deine Customers landen auf <span className="font-mono">deine-marke.de</span>{" "}
            statt auf <span className="font-mono">kilnbase.com</span>. Logo, Farben,
            Login-Page — alles auf deine Marke gebrandet. KILN unsichtbar im
            Hintergrund.
          </p>

          <BeforeAfterDiagram />

          {canManage ? (
            <button
              type="button"
              onClick={onSetup}
              className={cn(buttonVariants({ variant: "default" }), "mt-6")}
              data-testid="agency-domain-setup-cta"
            >
              Domain konfigurieren
              <ArrowRight className="ml-2 h-4 w-4" />
            </button>
          ) : (
            <p className="mt-4 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              Nur der Agency-OWNER kann eine Whitelabel-Domain konfigurieren.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function BeforeAfterDiagram() {
  return (
    <div
      className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2"
      data-testid="agency-domain-before-after"
    >
      <div className="rounded-lg border border-border bg-background p-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Vorher
        </p>
        <p className="mt-1 font-mono text-sm text-muted-foreground">
          kilnbase.com/dashboard/sub-org/cmp...
        </p>
      </div>
      <div className="rounded-lg border border-kiln-orange/40 bg-kiln-orange/5 p-3">
        <p className="text-xs uppercase tracking-wide text-kiln-orange">
          Nachher
        </p>
        <p className="mt-1 font-mono text-sm text-foreground">
          ai.deine-agentur.de
        </p>
      </div>
    </div>
  );
}

function ActiveCard({
  domain,
  canManage,
  onRemove,
  busy,
  error,
}: {
  domain: AgencyDomainRow;
  canManage: boolean;
  onRemove: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <section
      className="rounded-2xl border border-green-500/30 bg-green-500/5 p-8"
      data-testid="agency-domain-active"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20">
          <Check className="h-5 w-5 text-green-400" />
        </div>
        <div className="flex-1">
          <h2 className="font-serif text-xl text-foreground">
            Deine Whitelabel-Domain ist live
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Customers landen auf deiner Marke. KILN unsichtbar.
          </p>
          <p className="mt-4 font-mono text-base text-foreground">
            {domain.hostname}
          </p>
          {domain.sslIssuedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              SSL-Zertifikat ausgestellt am{" "}
              {new Date(domain.sslIssuedAt).toLocaleDateString("de-DE")}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <a
              href={`https://${domain.hostname}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              data-testid="agency-domain-open"
            >
              Domain öffnen
              <ExternalLink className="ml-1 h-3 w-3" />
            </a>
            {canManage && (
              <button
                type="button"
                onClick={onRemove}
                disabled={busy}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "text-red-400 hover:text-red-300",
                )}
                data-testid="agency-domain-remove"
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Entfernen
              </button>
            )}
          </div>
          {error && (
            <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function SetupInProgressCard({
  domain,
  canVerify,
  canManage,
  onVerify,
  onRemove,
  busy,
  error,
}: {
  domain: AgencyDomainRow;
  canVerify: boolean;
  canManage: boolean;
  onVerify: () => void;
  onRemove: (() => void) | null;
  busy: boolean;
  error: string | null;
}) {
  const dnsHint: DnsHint = hostnameLooksApex(domain.hostname)
    ? { type: "A", name: "@", value: "76.76.21.21" }
    : { type: "CNAME", name: leftmostLabel(domain.hostname), value: "cname.vercel-dns.com" };

  return (
    <section
      className="space-y-6"
      data-testid="agency-domain-setup-in-progress"
    >
      <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
          <div>
            <p className="text-xs uppercase tracking-wide text-blue-300">
              {domain.status === "PENDING" ? "Ausstehend" : "Wird verifiziert"}
            </p>
            <p className="mt-0.5 font-mono text-base text-foreground">
              {domain.hostname}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          DNS-Record setzen, dann Verify klicken — meist 5–30 Minuten.
        </p>
      </div>

      <DnsSetupInstructions dnsHint={dnsHint} />

      {error && (
        <p
          className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          data-testid="agency-domain-error"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canVerify && (
          <button
            type="button"
            onClick={onVerify}
            disabled={busy}
            className={cn(buttonVariants({ variant: "default" }))}
            data-testid="agency-domain-verify"
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            DNS prüfen
          </button>
        )}
        {canManage && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "text-red-400 hover:text-red-300",
            )}
            data-testid="agency-domain-cancel"
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Setup abbrechen
          </button>
        )}
      </div>
    </section>
  );
}

function FailedCard({
  domain,
  canVerify,
  onRetry,
  onRemove,
  busy,
  error,
}: {
  domain: AgencyDomainRow;
  canVerify: boolean;
  onRetry: () => void;
  onRemove: (() => void) | null;
  busy: boolean;
  error: string | null;
}) {
  return (
    <section
      className="space-y-6"
      data-testid="agency-domain-failed"
    >
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <div>
            <p className="text-xs uppercase tracking-wide text-red-300">
              Verifizierung fehlgeschlagen
            </p>
            <p className="mt-0.5 font-mono text-base text-foreground">
              {domain.hostname}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Wir konnten den DNS-Record nicht finden. Prüfe ob du den CNAME-Record
          beim richtigen Provider gesetzt hast, und ob (bei Cloudflare) der Proxy
          deaktiviert ist (graue Wolke).
        </p>
        {error && (
          <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {canVerify && (
            <button
              type="button"
              onClick={onRetry}
              disabled={busy}
              className={cn(buttonVariants({ variant: "default" }))}
              data-testid="agency-domain-retry"
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Erneut versuchen
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              data-testid="agency-domain-remove-failed"
            >
              Domain entfernen
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function SetupModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [hostname, setHostname] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    hostname: string;
    dnsHint: DnsHint;
  } | null>(null);

  const isHostnameValid = looksLikeValidHostname(hostname);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/agency/domain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostname }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        hostname?: string;
        dnsHint?: DnsHint;
      };
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      if (body.hostname && body.dnsHint) {
        setCreated({ hostname: body.hostname, dnsHint: body.dnsHint });
        setStep(2);
      } else {
        onCreated();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      data-testid="agency-domain-setup-modal"
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-lg text-foreground">
            {step === 1 ? "Whitelabel-Domain einrichten" : "DNS einrichten"}
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

        {step === 1 && (
          <div className="space-y-4">
            <label
              htmlFor="agency-hostname"
              className="block text-xs text-muted-foreground"
            >
              Welche Domain soll deine Agency nutzen?
            </label>
            <input
              id="agency-hostname"
              type="text"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="ai.deine-agentur.de"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
              data-testid="agency-domain-hostname-input"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              z.B. ai.deine-agentur.de oder app.deine-domain.com — eine Subdomain
              funktioniert am besten.
            </p>
            {error && (
              <p
                className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
                data-testid="agency-domain-setup-error"
              >
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
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
                disabled={submitting || !isHostnameValid}
                className={cn(buttonVariants({ variant: "default" }))}
                data-testid="agency-domain-setup-submit"
              >
                {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Weiter
              </button>
            </div>
          </div>
        )}

        {step === 2 && created && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Lege den folgenden DNS-Record bei deinem Provider an und klick
              danach unten auf Fertig. Wir prüfen die Domain dann automatisch.
            </p>
            <DnsSetupInstructions dnsHint={created.dnsHint} />
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onCreated}
                className={cn(buttonVariants({ variant: "default" }))}
                data-testid="agency-domain-setup-done"
              >
                Fertig
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function looksLikeValidHostname(value: string): boolean {
  if (!value) return false;
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(
    value.trim().toLowerCase(),
  );
}

function hostnameLooksApex(hostname: string): boolean {
  return hostname.split(".").length <= 2;
}

function leftmostLabel(hostname: string): string {
  return hostname.split(".")[0] ?? hostname;
}
