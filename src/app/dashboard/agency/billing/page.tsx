"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  Plug,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

/**
 * Agency Billing — Stripe Connect onboarding + status surface.
 *
 * Three states:
 *   - Not connected:       big "Connect Stripe Account" CTA.
 *   - Connected, pending:  status card listing what Stripe still needs
 *                          + "Resume onboarding" button.
 *   - Connected, ready:    status card with the green check, account ID,
 *                          last sync time, "Refresh" + "Disconnect".
 */
type ConnectStatus = {
  connected: boolean;
  stripeAccountId?: string;
  onboardingComplete?: boolean;
  detailsSubmitted?: boolean;
  payoutsEnabled?: boolean;
  chargesEnabled?: boolean;
  lastSyncedAt?: string | null;
  requirements?: unknown;
};

export default function AgencyBillingPage() {
  const searchParams = useSearchParams();
  const onboarded = searchParams.get("onboarded") === "1";
  const refresh = searchParams.get("refresh") === "1";

  const { toast } = useToast();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"connect" | "refresh" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agency/stripe-connect/status");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Status load failed");
      }
      setStatus(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // After Stripe sends the user back to this page (returnUrl with
  // ?onboarded=1) trigger one server-side refresh so the UI flips out
  // of "pending" without the operator having to click Refresh.
  useEffect(() => {
    if (!onboarded) return;
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboarded]);

  async function startOnboarding() {
    setWorking("connect");
    try {
      const res = await fetch("/api/agency/stripe-connect/onboard", {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Onboarding failed");
      window.location.href = body.url;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Onboarding failed", "error");
      setWorking(null);
    }
  }

  async function refreshStatus() {
    setWorking("refresh");
    try {
      const res = await fetch("/api/agency/stripe-connect/refresh", {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Refresh failed");
      await loadStatus();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Refresh failed", "error");
    } finally {
      setWorking(null);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect Stripe? Active sub-org subscriptions will keep running in Stripe but cannot be managed from KILN until you reconnect.")) {
      return;
    }
    setWorking("disconnect");
    try {
      const res = await fetch("/api/agency/stripe-connect/disconnect", {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Disconnect failed");
      }
      toast("Stripe disconnected.", "success");
      await loadStatus();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Disconnect failed", "error");
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 font-serif text-2xl text-foreground">
          <CreditCard className="h-5 w-5 text-kiln-orange" />
          Agency Billing
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your Stripe account to monetize your sub-organizations.
          KILN charges no application fee — your agency keeps 100% of the
          revenue.
        </p>
      </header>

      {refresh && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="text-xs text-amber-700">
            Stripe asked us to refresh the onboarding link. Click
            &quot;Resume onboarding&quot; to continue.
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-card/60 p-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="text-sm text-destructive">{error}</div>
        </div>
      ) : !status?.connected ? (
        <NotConnected onConnect={startOnboarding} working={working === "connect"} />
      ) : (
        <Connected
          status={status}
          onResume={startOnboarding}
          onRefresh={refreshStatus}
          onDisconnect={disconnect}
          working={working}
        />
      )}
    </div>
  );
}

function NotConnected({
  onConnect,
  working,
}: {
  onConnect: () => void;
  working: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-kiln-orange/10">
        <Plug className="h-6 w-6 text-kiln-orange" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">
        Connect Stripe to monetize your sub-organizations
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Stripe Connect Express handles KYC, payouts, and tax reporting for
        you. Your sub-org clients pay your agency directly; KILN only
        mediates onboarding.
      </p>
      <Button onClick={onConnect} disabled={working} size="lg" className="mt-6 gap-2">
        {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
        Connect Stripe Account
        {!working && <ExternalLink className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function Connected({
  status,
  onResume,
  onRefresh,
  onDisconnect,
  working,
}: {
  status: ConnectStatus;
  onResume: () => void;
  onRefresh: () => void;
  onDisconnect: () => void;
  working: "connect" | "refresh" | "disconnect" | null;
}) {
  const ready = Boolean(status.onboardingComplete);
  return (
    <div className="space-y-4">
      <div
        className={cn(
          "rounded-xl border p-5",
          ready
            ? "border-emerald-500/30 bg-emerald-500/5"
            : "border-amber-500/30 bg-amber-500/5"
        )}
      >
        <div className="flex items-start gap-3">
          {ready ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          )}
          <div className="flex-1">
            <h2 className="text-base font-semibold text-foreground">
              {ready ? "Stripe is fully connected" : "Stripe onboarding pending"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {ready
                ? "You can now configure pricing for sub-orgs and accept payments."
                : "Stripe still needs more information before payouts are enabled."}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Account
        </h3>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Account ID"
            value={
              <span className="font-mono text-xs text-foreground">
                {status.stripeAccountId}
              </span>
            }
          />
          <Field
            label="Last sync"
            value={
              status.lastSyncedAt
                ? new Date(status.lastSyncedAt).toLocaleString()
                : "Never"
            }
          />
          <Field label="Details submitted" value={booleanPill(status.detailsSubmitted)} />
          <Field label="Payouts enabled" value={booleanPill(status.payoutsEnabled)} />
          <Field label="Charges enabled" value={booleanPill(status.chargesEnabled)} />
        </dl>
      </div>

      <div className="flex flex-wrap gap-2">
        {!ready && (
          <Button onClick={onResume} disabled={working !== null} className="gap-2">
            {working === "connect" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plug className="h-4 w-4" />
            )}
            Resume onboarding
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          onClick={onRefresh}
          disabled={working !== null}
          variant="outline"
          className="gap-2"
        >
          {working === "refresh" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh status
        </Button>
        <Button
          onClick={onDisconnect}
          disabled={working !== null}
          variant="outline"
          className="gap-2 text-destructive hover:text-destructive"
        >
          {working === "disconnect" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Unplug className="h-4 w-4" />
          )}
          Disconnect
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}

function booleanPill(value: boolean | undefined) {
  if (value) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
        <CheckCircle2 className="h-3 w-3" />
        Yes
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      No
    </span>
  );
}
