"use client";

/**
 * Pricing tab — billing-mode configuration + active subscription view
 * + invoice history. Combines what the previous v1 page split across
 * Pricing/Subscription tabs into a single coherent screen.
 *
 * Stripe Connect status is fetched alongside so we can render the
 * "Connect required" warning when FIXED is selected before onboarding
 * is complete. All POST/DELETE handlers preserve the v1 behaviour.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FileText,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

type Pricing = {
  id: string;
  childOrgId: string;
  subOrgName: string;
  pricingMode: "NONE" | "FIXED" | "CUSTOM";
  monthlyPriceCents: number | null;
  setupFeeCents: number | null;
  trialDays: number | null;
  pricingCurrency: string | null;
  stripeProductId: string | null;
  stripeMonthlyPriceId: string | null;
  stripeSetupPriceId: string | null;
  stripePending?: boolean;
};

type ConnectStatus = {
  connected: boolean;
  onboardingComplete?: boolean;
};

type Subscription = {
  id: string;
  status:
    | "INCOMPLETE"
    | "ACTIVE"
    | "PAST_DUE"
    | "CANCELED"
    | "UNPAID"
    | "TRIALING";
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  priceAmount: number;
  priceCurrency: string;
  priceInterval: string;
} | null;

type InvoiceRow = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  type: "SUBSCRIPTION" | "SETUP";
  invoiceDate: string;
  paidAt: string | null;
  hostedInvoiceUrl: string | null;
  pdfUrl: string | null;
};

interface PricingTabProps {
  relationshipId: string;
  readOnly: boolean;
}

export function PricingTab({ relationshipId, readOnly }: PricingTabProps) {
  const { toast } = useToast();
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [connect, setConnect] = useState<ConnectStatus | null>(null);
  const [subscription, setSubscription] = useState<Subscription>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [p, s, c, i] = await Promise.allSettled([
      fetch(`/api/agency/sub-orgs/${relationshipId}/pricing`),
      fetch(`/api/agency/sub-orgs/${relationshipId}/subscription`),
      fetch(`/api/agency/stripe-connect/status`),
      fetch(`/api/agency/sub-orgs/${relationshipId}/invoices`),
    ]);
    if (p.status === "fulfilled" && p.value.ok) setPricing(await p.value.json());
    if (s.status === "fulfilled" && s.value.ok) {
      const body = await s.value.json();
      setSubscription(body.subscription ?? null);
    }
    if (c.status === "fulfilled" && c.value.ok)
      setConnect(await c.value.json());
    if (i.status === "fulfilled" && i.value.ok) {
      const body = await i.value.json();
      setInvoices(body.items || []);
    }
    setLoading(false);
  }, [relationshipId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const connectComplete = Boolean(
    connect?.connected && connect?.onboardingComplete,
  );

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-border bg-card/60">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="pricing-tab">
      {/* Stripe Connect status row */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
          connectComplete
            ? "border-green-500/30 bg-green-500/5 text-green-400"
            : "border-amber-500/30 bg-amber-500/5 text-amber-300",
        )}
      >
        {connectComplete ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5" />
        )}
        <span>
          Stripe Connect{" "}
          {connectComplete ? "connected" : "not yet onboarded"}
        </span>
        {!connectComplete && (
          <Link
            href="/dashboard/agency/billing"
            className="ml-auto inline-flex items-center gap-0.5 underline"
          >
            Connect →
          </Link>
        )}
      </div>

      <PricingForm
        relationshipId={relationshipId}
        pricing={pricing}
        connectComplete={connectComplete}
        readOnly={readOnly}
        onSaved={(next) => {
          setPricing(next);
          toast(
            next.stripePending
              ? "Pricing saved (Stripe sync pending)"
              : "Pricing updated",
          );
        }}
        onError={(m) => toast(m, "error")}
      />

      {/* Active subscription block */}
      <SubscriptionBlock
        relationshipId={relationshipId}
        subscription={subscription}
        readOnly={readOnly}
        onCanceled={() => {
          toast("Cancellation scheduled at period end");
          void loadAll();
        }}
        onError={(m) => toast(m, "error")}
      />

      {/* Invoice history */}
      <InvoiceList items={invoices} />
    </div>
  );
}

function PricingForm({
  relationshipId,
  pricing,
  connectComplete,
  readOnly,
  onSaved,
  onError,
}: {
  relationshipId: string;
  pricing: Pricing | null;
  connectComplete: boolean;
  readOnly: boolean;
  onSaved: (next: Pricing) => void;
  onError: (msg: string) => void;
}) {
  const [mode, setMode] = useState<Pricing["pricingMode"]>(
    pricing?.pricingMode ?? "NONE",
  );
  const [monthlyEuros, setMonthlyEuros] = useState("");
  const [setupEuros, setSetupEuros] = useState("");
  const [trialEnabled, setTrialEnabled] = useState(false);
  const [trialDays, setTrialDays] = useState(14);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!pricing) return;
    setMode(pricing.pricingMode);
    setMonthlyEuros(
      pricing.monthlyPriceCents
        ? (pricing.monthlyPriceCents / 100).toFixed(2)
        : "",
    );
    setSetupEuros(
      pricing.setupFeeCents ? (pricing.setupFeeCents / 100).toFixed(2) : "",
    );
    setTrialEnabled(Boolean(pricing.trialDays && pricing.trialDays > 0));
    setTrialDays(pricing.trialDays ?? 14);
  }, [pricing]);

  const monthlyCents = Math.round(parseFloat(monthlyEuros || "0") * 100) || 0;
  const setupCents = Math.round(parseFloat(setupEuros || "0") * 100) || 0;

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { mode };
      if (mode === "FIXED" || mode === "CUSTOM") {
        body.currency = "eur";
        if (monthlyCents > 0) body.monthlyPriceCents = monthlyCents;
        if (setupCents > 0) body.setupFeeCents = setupCents;
      }
      if (mode === "FIXED") {
        if (monthlyCents === 0 && setupCents === 0) {
          throw new Error("Set a monthly price, a setup fee, or both.");
        }
        if (trialEnabled && trialDays > 0) body.trialDays = trialDays;
      }
      const res = await fetch(
        `/api/agency/sub-orgs/${relationshipId}/pricing`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      onSaved(data);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Billing mode</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          KILN never sees the customer&apos;s money — payments flow directly
          into your connected Stripe account.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <ModeRadio
            mode="NONE"
            label="Free"
            description="No charge. Sub-org has full access at no cost."
            current={mode}
            onChange={setMode}
            disabled={readOnly}
          />
          <ModeRadio
            mode="FIXED"
            label="Stripe Subscription"
            description="Setup fee + monthly recurring via Stripe Connect."
            current={mode}
            onChange={setMode}
            disabled={readOnly}
          />
          <ModeRadio
            mode="CUSTOM"
            label="Custom invoice"
            description="You bill the client outside KILN."
            current={mode}
            onChange={setMode}
            disabled={readOnly}
          />
        </div>
      </div>

      {mode === "FIXED" && !connectComplete && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="text-xs text-amber-300">
            <p>
              Stripe Connect is not yet onboarded. Pricing will be saved
              locally; the Stripe-side product and prices are provisioned the
              next time you save here, after your account is fully connected.
            </p>
            <Link
              href="/dashboard/agency/billing"
              className="mt-2 inline-flex items-center gap-1 underline"
            >
              Connect Stripe account →
            </Link>
          </div>
        </div>
      )}

      {mode === "FIXED" && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h4 className="text-sm font-semibold text-foreground">
            Stripe Subscription
          </h4>
          <PriceField
            label="Setup fee (one-time, optional)"
            value={setupEuros}
            onChange={setSetupEuros}
            placeholder="4900.00"
            suffix="EUR"
            disabled={readOnly}
          />
          <PriceField
            label="Monthly recurring"
            value={monthlyEuros}
            onChange={setMonthlyEuros}
            placeholder="197.00"
            suffix="EUR / month"
            disabled={readOnly}
          />
          <label className="mt-4 flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={trialEnabled}
              onChange={(e) => setTrialEnabled(e.target.checked)}
              disabled={readOnly}
              className="h-3.5 w-3.5 rounded border-border accent-kiln-orange"
            />
            <span>Trial period before billing starts</span>
            {trialEnabled && (
              <span className="inline-flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={730}
                  value={trialDays}
                  onChange={(e) =>
                    setTrialDays(parseInt(e.target.value, 10) || 0)
                  }
                  disabled={readOnly}
                  className="ml-2 w-16 rounded-md border border-border bg-background px-2 py-0.5 text-sm text-foreground focus:border-kiln-orange focus:outline-none"
                />
                <span>days</span>
              </span>
            )}
          </label>

          {pricing?.stripeMonthlyPriceId && connectComplete && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-500">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Stripe price configured ({pricing.stripeMonthlyPriceId.slice(0, 14)}…)
            </p>
          )}
        </div>
      )}

      {mode === "CUSTOM" && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h4 className="text-sm font-semibold text-foreground">
            Custom billing
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Display these numbers to the client on their onboarding page.
            Payment is collected outside KILN — Stripe is not involved.
          </p>
          <PriceField
            label="Setup fee (optional)"
            value={setupEuros}
            onChange={setSetupEuros}
            placeholder="4900.00"
            suffix="EUR"
            disabled={readOnly}
          />
          <PriceField
            label="Monthly (optional)"
            value={monthlyEuros}
            onChange={setMonthlyEuros}
            placeholder="197.00"
            suffix="EUR / month"
            disabled={readOnly}
          />
        </div>
      )}

      {mode === "NONE" && (
        <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          This sub-org has full access at no charge. Existing Stripe prices
          will be archived on save.
        </div>
      )}

      {!readOnly && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save pricing
          </Button>
        </div>
      )}
    </div>
  );
}

function ModeRadio({
  mode,
  label,
  description,
  current,
  onChange,
  disabled,
}: {
  mode: Pricing["pricingMode"];
  label: string;
  description: string;
  current: Pricing["pricingMode"];
  onChange: (next: Pricing["pricingMode"]) => void;
  disabled?: boolean;
}) {
  const active = current === mode;
  return (
    <button
      type="button"
      onClick={() => onChange(mode)}
      disabled={disabled}
      className={cn(
        "flex flex-col gap-1 rounded-lg border p-3 text-left transition disabled:opacity-50 disabled:cursor-not-allowed",
        active
          ? "border-kiln-orange bg-kiln-orange/5"
          : "border-border bg-card hover:border-foreground/20",
      )}
    >
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );
}

function PriceField({
  label,
  value,
  onChange,
  placeholder,
  suffix,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  suffix: string;
  disabled?: boolean;
}) {
  return (
    <div className="mt-4">
      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <div className="mt-1.5 inline-flex items-center gap-2">
        <span className="text-base text-muted-foreground">€</span>
        <input
          type="number"
          min={0}
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-40 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-kiln-orange focus:outline-none disabled:opacity-50"
          placeholder={placeholder}
        />
        <span className="text-xs text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );
}

function SubscriptionBlock({
  relationshipId,
  subscription,
  readOnly,
  onCanceled,
  onError,
}: {
  relationshipId: string;
  subscription: Subscription;
  readOnly: boolean;
  onCanceled: () => void;
  onError: (m: string) => void;
}) {
  const [working, setWorking] = useState(false);

  if (!subscription) {
    return (
      <div className="rounded-xl border border-border bg-card/40 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Subscription
        </p>
        <div className="mt-3 flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No active subscription
          </p>
        </div>
      </div>
    );
  }

  const formattedAmount = (subscription.priceAmount / 100).toLocaleString(
    undefined,
    {
      style: "currency",
      currency: subscription.priceCurrency.toUpperCase(),
    },
  );
  const periodEnd = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
    : "—";

  async function cancel() {
    if (!confirm("Cancel subscription at the end of the current period?"))
      return;
    setWorking(true);
    try {
      const res = await fetch(
        `/api/agency/sub-orgs/${relationshipId}/subscription`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Cancel failed");
      onCanceled();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Status
          </p>
          <p className="mt-1 text-base font-semibold text-foreground">
            {subscription.status}
            {subscription.cancelAtPeriodEnd && (
              <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                Canceling at period end
              </span>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Amount
          </p>
          <p className="mt-1 text-base font-semibold text-foreground">
            {formattedAmount} / {subscription.priceInterval}
          </p>
        </div>
      </div>
      <div className="mt-4 text-xs text-muted-foreground">
        Current period ends:{" "}
        <span className="text-foreground">{periodEnd}</span>
      </div>
      {!readOnly && !subscription.cancelAtPeriodEnd && (
        <div className="mt-4 flex justify-end">
          <Button
            onClick={cancel}
            disabled={working}
            variant="outline"
            className="gap-2 text-destructive hover:text-destructive"
          >
            {working && <Loader2 className="h-4 w-4 animate-spin" />}
            Cancel at period end
          </Button>
        </div>
      )}
    </div>
  );
}

function InvoiceList({ items }: { items: InvoiceRow[] }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Invoices (last 12 months)
        </h3>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-muted-foreground">
          No invoices yet.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((i) => (
            <li
              key={i.id}
              className="flex items-center gap-3 px-4 py-2.5 text-xs"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="w-24 shrink-0 text-muted-foreground tabular-nums">
                {new Date(i.invoiceDate).toLocaleDateString()}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 w-20">
                {i.type}
              </span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                  i.status === "paid"
                    ? "bg-green-500/15 text-green-400"
                    : i.status === "open"
                      ? "bg-amber-500/15 text-amber-400"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {i.status}
              </span>
              <span className="ml-auto font-mono text-foreground tabular-nums">
                {(i.amount / 100).toLocaleString(undefined, {
                  style: "currency",
                  currency: i.currency.toUpperCase(),
                })}
              </span>
              {i.hostedInvoiceUrl && (
                <a
                  href={i.hostedInvoiceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Open in Stripe"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
