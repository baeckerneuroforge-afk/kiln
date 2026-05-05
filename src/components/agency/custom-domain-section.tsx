"use client";

/**
 * CustomDomainSection — bolt-on for the agency branding page that drives
 * /api/agency/branding/domain (CRUD) + /status + /verify.
 *
 * Three states the operator can be in:
 *
 *   1. No domain configured           → Form to add one. Shows DNS
 *                                        instructions after save.
 *   2. Domain pending                 → Lists the verification records
 *                                        Vercel returned, refresh-status
 *                                        button, manual verify button,
 *                                        remove button.
 *   3. Domain active (verified+SSL)   → Shows the live URL with a green
 *                                        check + a remove button.
 *
 * The DNS instruction we surface is intentionally generic: Vercel's
 * verification.value field gives us the exact CNAME / TXT entry the user
 * needs, so we just print what Vercel says rather than guessing.
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Globe,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

type Verification = {
  type: string;
  domain: string;
  value: string;
  reason?: string;
};

type DomainStatus = {
  domain: string | null;
  verified: boolean;
  ssl?: boolean;
  verification?: Verification[];
  error?: string | null;
};

interface Props {
  isInherited: boolean;
}

export function CustomDomainSection({ isInherited }: Props) {
  const { toast } = useToast();
  const [status, setStatus] = useState<DomainStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [newDomain, setNewDomain] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/agency/branding/domain/status");
      const body = await res.json();
      if (!res.ok && res.status !== 502) {
        // 502 still gives us a useful body (Vercel error surfaced in
        // body.error). Anything else is a client-side problem.
        setStatus({ domain: null, verified: false, error: body.error });
        return;
      }
      setStatus(body);
    } catch (err) {
      setStatus({
        domain: null,
        verified: false,
        error: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isInherited) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [isInherited, refresh]);

  async function handleAdd() {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;
    setAdding(true);
    try {
      const res = await fetch("/api/agency/branding/domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast(body.error || "Failed to add domain", "error");
        return;
      }
      setNewDomain("");
      setStatus({
        domain: body.domain,
        verified: body.verified,
        verification: body.verification,
      });
      toast("Domain added — set the DNS record below to verify.");
    } finally {
      setAdding(false);
    }
  }

  async function handleVerify() {
    setVerifying(true);
    try {
      const res = await fetch("/api/agency/branding/domain/verify", {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) {
        toast(body.error || "Verification failed", "error");
        return;
      }
      if (body.verified) {
        toast("Domain verified!");
      } else {
        toast("Still pending — DNS not propagated yet.", "error");
      }
      await refresh();
    } finally {
      setVerifying(false);
    }
  }

  async function handleRemove() {
    if (!confirm("Remove this domain? Visitors will lose access immediately.")) {
      return;
    }
    setRemoving(true);
    try {
      const res = await fetch("/api/agency/branding/domain", {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast(body.error || "Remove failed", "error");
        return;
      }
      setStatus({ domain: null, verified: false });
      toast("Domain removed");
    } finally {
      setRemoving(false);
    }
  }

  if (isInherited) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Globe className="h-4 w-4" />
          Custom domain settings are managed by the parent agency.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
          <Globe className="h-3.5 w-3.5 text-kiln-orange" />
          Custom domain
        </h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Point your own hostname at this workspace. Clients see your
          brand in the URL bar instead of kilnbase.com.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading domain status…
        </div>
      ) : status?.domain ? (
        <DomainPanel
          status={status}
          verifying={verifying}
          removing={removing}
          onVerify={handleVerify}
          onRemove={handleRemove}
        />
      ) : (
        <AddDomainForm
          value={newDomain}
          onChange={setNewDomain}
          onSubmit={handleAdd}
          submitting={adding}
        />
      )}
    </div>
  );
}

function AddDomainForm({
  value,
  onChange,
  onSubmit,
  submitting,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  return (
    <div className="space-y-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="kunde-portal.agentur.de"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-kiln-orange/40 focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim() && !submitting) onSubmit();
        }}
      />
      <p className="text-[11px] text-muted-foreground">
        Use a subdomain you control. We&apos;ll register it with our hosting
        and show you the DNS record to set.
      </p>
      <Button onClick={onSubmit} disabled={submitting || !value.trim()}>
        {submitting ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : null}
        Add domain
      </Button>
    </div>
  );
}

function DomainPanel({
  status,
  verifying,
  removing,
  onVerify,
  onRemove,
}: {
  status: DomainStatus;
  verifying: boolean;
  removing: boolean;
  onVerify: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3">
        <div className="flex items-start gap-2">
          {status.verified ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          )}
          <div>
            <p className="font-mono text-sm text-foreground">{status.domain}</p>
            <p
              className={cn(
                "mt-0.5 text-[11px]",
                status.verified ? "text-green-400" : "text-amber-400"
              )}
            >
              {status.verified
                ? "Active — SSL provisioned and DNS verified."
                : "Pending — set the DNS record below, then click Refresh status."}
            </p>
            {status.error && (
              <p className="mt-1 text-[11px] text-red-400">
                Vercel reported: {status.error}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {status.verified && (
            <a
              href={`https://${status.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-foreground hover:bg-muted"
            >
              Open
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {!status.verified && (
            <Button
              size="sm"
              variant="outline"
              onClick={onVerify}
              disabled={verifying}
            >
              {verifying ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3 w-3" />
              )}
              Refresh status
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={onRemove}
            disabled={removing}
          >
            {removing ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="mr-1 h-3 w-3" />
            )}
            Remove
          </Button>
        </div>
      </div>

      {!status.verified &&
        status.verification &&
        status.verification.length > 0 && (
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-[11px] font-semibold text-foreground">
              Set this DNS record in your provider:
            </p>
            <div className="mt-2 space-y-1.5">
              {status.verification.map((v, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-center gap-2 rounded border border-border bg-card px-2 py-1.5 font-mono text-[11px] text-foreground"
                >
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                    {v.type}
                  </span>
                  <span>{v.domain}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-kiln-orange">{v.value}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Propagation usually takes a few minutes. SSL is issued
              automatically once DNS resolves.
            </p>
          </div>
        )}
    </div>
  );
}
