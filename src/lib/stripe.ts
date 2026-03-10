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
  PRO: { agents: 999999, chatsPerMonth: 2000 },
  AGENCY: { agents: 999999, chatsPerMonth: 10000 },
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;

export function getPlanLimits(plan: PlanType) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.FREE;
}

export function getPlanLabel(plan: PlanType): string {
  const labels: Record<PlanType, string> = {
    FREE: "Free",
    PRO: "Pro",
    AGENCY: "Agency",
  };
  return labels[plan] || "Free";
}

export function getPlanPrice(plan: PlanType): string {
  const prices: Record<PlanType, string> = {
    FREE: "€0",
    PRO: "€49",
    AGENCY: "€149",
  };
  return prices[plan] || "€0";
}
