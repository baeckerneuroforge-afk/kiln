"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Loader2,
  Settings,
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
  pricingCurrency: string | null;
  stripeProductId: string | null;
  stripeMonthlyPriceId: string | null;
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

export default function SubOrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { toast } = useToast();
  const [tab, setTab] = useState<"pricing" | "subscription">("pricing");

  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [subscription, setSubscription] = useState<Subscription>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [pricingRes, subRes] = await Promise.allSettled([
      fetch(`/api/agency/sub-orgs/${id}/pricing`),
      fetch(`/api/agency/sub-orgs/${id}/subscription`),
    ]);
    if (pricingRes.status === "fulfilled" && pricingRes.value.ok) {
      setPricing(await pricingRes.value.json());
    }
    if (subRes.status === "fulfilled" && subRes.value.ok) {
      const body = await subRes.value.json();
      setSubscription(body.subscription ?? null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/dashboard/agency/sub-orgs"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to sub-orgs
      </Link>

      <header className="mb-6">
        <h1 className="font-serif text-2xl text-foreground">
          {pricing?.subOrgName ?? "Sub-organization"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage pricing and subscription for this client workspace.
        </p>
      </header>

      <div className="mb-6 inline-flex items-center gap-1 rounded-lg border border-border bg-card/60 p-1">
        <TabButton
          active={tab === "pricing"}
          onClick={() => setTab("pricing")}
          icon={<Settings className="h-3.5 w-3.5" />}
          label="Pricing"
        />
        <TabButton
          active={tab === "subscription"}
          onClick={() => setTab("subscription")}
          icon={<CreditCard className="h-3.5 w-3.5" />}
          label="Subscription"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-card/60 p-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : tab === "pricing" ? (
        <PricingTab
          relationshipId={id}
          pricing={pricing}
          onSaved={(next) => {
            setPricing(next);
            toast("Pricing updated", "success");
          }}
          onError={(message) => toast(message, "error")}
        />
      ) : (
        <SubscriptionTab
          relationshipId={id}
          pricing={pricing}
          subscription={subscription}
          onCanceled={() => {
            toast("Cancellation scheduled at period end", "success");
            load();
          }}
          onError={(message) => toast(message, "error")}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function PricingTab({
  relationshipId,
  pricing,
  onSaved,
  onError,
}: {
  relationshipId: string;
  pricing: Pricing | null;
  onSaved: (next: Pricing) => void;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<Pricing["pricingMode"]>(
    pricing?.pricingMode ?? "NONE"
  );
  const [priceEuros, setPriceEuros] = useState(() =>
    pricing?.monthlyPriceCents ? (pricing.monthlyPriceCents / 100).toFixed(2) : ""
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!pricing) return;
    setMode(pricing.pricingMode);
    setPriceEuros(
      pricing.monthlyPriceCents ? (pricing.monthlyPriceCents / 100).toFixed(2) : ""
    );
  }, [pricing]);

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { mode };
      if (mode === "FIXED") {
        const cents = Math.round(parseFloat(priceEuros) * 100);
        if (!cents || cents < 50) {
          throw new Error("Monthly price must be at least €0.50");
        }
        body.monthlyPriceCents = cents;
        body.currency = "eur";
      }
      const res = await fetch(`/api/agency/sub-orgs/${relationshipId}/pricing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
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
          />
          <ModeRadio
            mode="FIXED"
            label="Fixed monthly"
            description="Recurring Stripe subscription on the connected account."
            current={mode}
            onChange={setMode}
          />
          <ModeRadio
            mode="CUSTOM"
            label="Custom invoice"
            description="You bill the client outside KILN."
            current={mode}
            onChange={setMode}
          />
        </div>
      </div>

      {mode === "FIXED" && (
        <div className="rounded-xl border border-border bg-card p-5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Monthly price (EUR)
          </label>
          <div className="mt-2 inline-flex items-center gap-2">
            <span className="text-base text-muted-foreground">€</span>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={priceEuros}
              onChange={(e) => setPriceEuros(e.target.value)}
              className="w-40 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-kiln-orange focus:outline-none"
              placeholder="297.00"
            />
            <span className="text-xs text-muted-foreground">/ month</span>
          </div>
          {pricing?.stripeMonthlyPriceId && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Stripe price configured ({pricing.stripeMonthlyPriceId.slice(0, 14)}…)
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save pricing
        </Button>
      </div>
    </div>
  );
}

function ModeRadio({
  mode,
  label,
  description,
  current,
  onChange,
}: {
  mode: Pricing["pricingMode"];
  label: string;
  description: string;
  current: Pricing["pricingMode"];
  onChange: (next: Pricing["pricingMode"]) => void;
}) {
  const active = current === mode;
  return (
    <button
      type="button"
      onClick={() => onChange(mode)}
      className={cn(
        "flex flex-col gap-1 rounded-lg border p-3 text-left transition",
        active
          ? "border-kiln-orange bg-kiln-orange/5"
          : "border-border bg-card hover:border-foreground/20"
      )}
    >
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );
}

function SubscriptionTab({
  relationshipId,
  pricing,
  subscription,
  onCanceled,
  onError,
}: {
  relationshipId: string;
  pricing: Pricing | null;
  subscription: Subscription;
  onCanceled: () => void;
  onError: (message: string) => void;
}) {
  const [working, setWorking] = useState(false);

  async function cancel() {
    if (!confirm("Cancel subscription at the end of the current period?")) return;
    setWorking(true);
    try {
      const res = await fetch(
        `/api/agency/sub-orgs/${relationshipId}/subscription`,
        { method: "DELETE" }
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

  if (!subscription) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <CreditCard className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-foreground">No active subscription</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {pricing?.pricingMode === "FIXED"
            ? "Sub-org owner has not yet activated their subscription."
            : "Configure a fixed-price billing mode to enable subscriptions."}
        </p>
      </div>
    );
  }

  const formattedAmount = (subscription.priceAmount / 100).toLocaleString(
    "de-DE",
    { style: "currency", currency: subscription.priceCurrency.toUpperCase() }
  );
  const periodEnd = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
    : "—";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Status
            </p>
            <p className="mt-1 text-base font-semibold text-foreground">
              {subscription.status}
              {subscription.cancelAtPeriodEnd && (
                <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
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
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="text-xs text-muted-foreground">
            Current period ends:{" "}
            <span className="text-foreground">{periodEnd}</span>
          </div>
        </div>
      </div>

      {!subscription.cancelAtPeriodEnd && (
        <div className="flex justify-end">
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
