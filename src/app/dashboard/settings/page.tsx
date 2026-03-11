"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CreditCard,
  Crown,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Zap,
  Building2,
  Sparkles,
  Gift,
  Copy,
  Check,
  Users,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface UserPlan {
  plan: "FREE" | "PRO" | "AGENCY" | "ADMIN";
  agentCount: number;
  chatCount: number;
  limits: { agents: number; chatsPerMonth: number };
}

const plans = [
  {
    id: "FREE" as const,
    name: "Free",
    price: "€0",
    icon: Zap,
    features: ["1 Agent", "50 conversations/month", "Basic Support"],
  },
  {
    id: "PRO" as const,
    name: "Pro",
    price: "€49",
    icon: Crown,
    popular: true,
    features: [
      "Unlimited Agents",
      "2,000 conversations/month",
      "Priority Support",
      "White-Label",
      "Custom Actions",
    ],
  },
  {
    id: "AGENCY" as const,
    name: "Agency",
    price: "€149",
    icon: Building2,
    features: [
      "Unlimited Agents",
      "10,000 conversations/month",
      "Dedicated Support",
      "White-Label",
      "Custom Actions",
      "API Access",
      "Multi-Client Management",
    ],
  },
];

function SettingsContent() {
  const searchParams = useSearchParams();
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referredUsers, setReferredUsers] = useState(0);
  const [creditsEarned, setCreditsEarned] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 5000);
    }
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/stripe/plan")
      .then((res) => res.json())
      .then((data) => setUserPlan(data))
      .catch(() => setUserPlan({ plan: "FREE", agentCount: 0, chatCount: 0, limits: { agents: 1, chatsPerMonth: 50 } }))
      .finally(() => setLoading(false));

    // Referral-Daten laden
    fetch("/api/referral")
      .then((res) => res.json())
      .then((data) => {
        setReferralCode(data.referralCode || null);
        setReferredUsers(data.referredUsers || 0);
        setCreditsEarned(data.creditsEarned || 0);
      })
      .catch(() => {});
  }, []);

  async function handleUpgrade(planId: string) {
    const priceId =
      planId === "PRO"
        ? process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID
        : process.env.NEXT_PUBLIC_STRIPE_AGENCY_PRICE_ID;

    if (!priceId) return;
    setUpgrading(planId);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // Fehler still behandeln
    } finally {
      setUpgrading(null);
    }
  }

  async function handleManage() {
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // Fehler still behandeln
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentPlan = userPlan?.plan || "FREE";
  const isAdminUser = currentPlan === "ADMIN";

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="font-serif text-3xl text-foreground">Settings</h1>
        <p className="mt-2 text-muted-foreground">
          Manage your account and subscriptions.
        </p>
      </div>

      {showSuccess && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/10 p-4">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
          <p className="text-sm font-medium text-green-400">
            Upgrade successful! Your plan has been updated.
          </p>
        </div>
      )}

      <div className="mb-8 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Current Plan
            </h2>
            <div className="mt-2 flex items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${
                isAdminUser
                  ? "bg-purple-500/10 text-purple-400"
                  : "bg-kiln-orange/10 text-kiln-orange"
              }`}>
                {isAdminUser ? "Admin" : currentPlan}
              </span>
              {isAdminUser ? (
                <span className="text-sm text-muted-foreground">
                  Unlimited — all features enabled
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {plans.find((p) => p.id === currentPlan)?.price}/month
                </span>
              )}
            </div>
          </div>
          {!isAdminUser && currentPlan !== "FREE" && (
            <Button variant="outline" size="sm" onClick={handleManage}>
              <CreditCard className="mr-2 h-3.5 w-3.5" />
              Manage Subscription
              <ExternalLink className="ml-2 h-3 w-3" />
            </Button>
          )}
        </div>

        {userPlan && (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Agents</span>
                <span className="text-foreground">
                  {userPlan.agentCount} /{" "}
                  {userPlan.limits.agents >= 999999
                    ? "∞"
                    : userPlan.limits.agents}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-kiln-orange transition-all"
                  style={{
                    width: `${Math.min(
                      (userPlan.agentCount / (userPlan.limits.agents >= 999999 ? 100 : userPlan.limits.agents)) * 100,
                      100
                    )}%`,
                  }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Conversations (this month)
                </span>
                <span className="text-foreground">
                  {userPlan.chatCount} / {userPlan.limits.chatsPerMonth.toLocaleString()}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-kiln-orange transition-all"
                  style={{
                    width: `${Math.min(
                      (userPlan.chatCount / userPlan.limits.chatsPerMonth) * 100,
                      100
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Referral Program */}
      {referralCode && (
        <div className="mb-8 rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-kiln-orange/10">
              <Gift className="h-5 w-5 text-kiln-orange" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Referral Program
              </h2>
              <p className="text-xs text-muted-foreground">
                Invite friends and earn 1 free month when they upgrade.
              </p>
            </div>
          </div>

          {/* Referral Code + Link */}
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Your Referral Code
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-lg border border-border bg-muted/30 px-4 py-2.5 font-mono text-sm font-bold text-kiln-orange">
                  {referralCode}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(referralCode);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? (
                    <Check className="mr-1.5 h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Share Link
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 truncate rounded-lg border border-border bg-muted/30 px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/sign-up?ref=${referralCode}`
                    : `/sign-up?ref=${referralCode}`}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const link = `${window.location.origin}/sign-up?ref=${referralCode}`;
                    navigator.clipboard.writeText(link);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? (
                    <Check className="mr-1.5 h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Users Referred</span>
              </div>
              <p className="mt-1 text-2xl font-bold text-foreground">{referredUsers}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-kiln-orange" />
                <span className="text-xs text-muted-foreground">Credits Earned</span>
              </div>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {creditsEarned}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  month{creditsEarned !== 1 ? "s" : ""} free
                </span>
              </p>
            </div>
          </div>
        </div>
      )}

      {!isAdminUser && (<>
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        Available Plans
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const Icon = plan.icon;

          return (
            <div
              key={plan.id}
              className={`relative rounded-xl border p-6 ${
                plan.popular
                  ? "border-kiln-orange bg-kiln-orange/5"
                  : "border-border bg-card"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-kiln-orange px-3 py-0.5 text-xs font-semibold text-white">
                  Popular
                </div>
              )}
              <Icon className="mb-3 h-6 w-6 text-kiln-orange" />
              <h3 className="text-lg font-semibold text-foreground">
                {plan.name}
              </h3>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {plan.price}
                <span className="text-sm font-normal text-muted-foreground">
                  /month
                </span>
              </p>

              <ul className="mt-4 space-y-2">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <Sparkles className="h-3 w-3 text-kiln-orange" />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {isCurrent ? (
                  <Button disabled className="w-full" variant="outline">
                    Current Plan
                  </Button>
                ) : plan.id === "FREE" ? (
                  <Button disabled className="w-full" variant="outline">
                    Included
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={upgrading !== null}
                  >
                    {upgrading === plan.id ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Upgrade to {plan.name}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </>)}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
