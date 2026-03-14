import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY fehlt in .env.local");
    stripeInstance = new Stripe(key, { apiVersion: "2026-02-25.clover" });
  }
  return stripeInstance;
}

// Plan-Limits (999999 statt Infinity wegen JSON.stringify(Infinity) → null)
export const PLAN_LIMITS = {
  FREE: { agents: 1, chatsPerMonth: 50 },
  STARTER: { agents: 3, chatsPerMonth: 500 },
  PRO: { agents: 10, chatsPerMonth: 999999 },
  AGENCY: { agents: 999999, chatsPerMonth: 999999 },
  ENTERPRISE: { agents: 999999, chatsPerMonth: 50000 },
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;

export function getPlanLimits(plan: PlanType) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.FREE;
}

export function getPlanLabel(plan: PlanType): string {
  const labels: Record<PlanType, string> = {
    FREE: "Free",
    STARTER: "Starter",
    PRO: "Pro",
    AGENCY: "Agency",
    ENTERPRISE: "Enterprise",
  };
  return labels[plan] || "Free";
}

export function getPlanPrice(plan: PlanType): string {
  const prices: Record<PlanType, string> = {
    FREE: "€0",
    STARTER: "€29",
    PRO: "€79",
    AGENCY: "€199",
    ENTERPRISE: "€499",
  };
  return prices[plan] || "€0";
}

// Stripe Price IDs für monatliche und jährliche Abrechnung
export function getStripePriceId(plan: PlanType, annual = false): string | null {
  if (plan === "FREE") return null;
  const envKey = annual
    ? `NEXT_PUBLIC_STRIPE_${plan}_YEARLY_PRICE_ID`
    : `NEXT_PUBLIC_STRIPE_${plan}_PRICE_ID`;
  return process.env[envKey] || null;
}
