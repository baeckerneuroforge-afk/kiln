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
  FREE: {
    agents: 1,
    chatsPerMonth: 50,
    knowledgeBases: 1,
    // Computer Use & Advanced Features
    computerUse: false,
    codeSandbox: false,
    agentSwarm: false,
    maxSubAgents: 0,
    deepResearch: false,
    parallelBranches: 0,
    scheduledWorkflows: 0,
    maxStepsPerRun: 0,
    // Wow Features
    diffDetection: false,
    proofOfWork: false,
    multiSite: false,
    watchAndLearn: false,
    agentBuildsAgents: false,
    apiAutodiscovery: false,
    zeroConfigWizard: false,
    proceduralMemory: false,
    // Routing
    modelRouting: "auto" as const,
    verificationCheckpoints: false,
    priorityExecution: false,
    // Workflows
    workflows: false,
  },
  STARTER: {
    agents: 3,
    chatsPerMonth: 500,
    knowledgeBases: 3,
    computerUse: false,
    codeSandbox: false,
    agentSwarm: false,
    maxSubAgents: 0,
    deepResearch: false,
    parallelBranches: 1,
    scheduledWorkflows: 0,
    maxStepsPerRun: 0,
    diffDetection: false,
    proofOfWork: false,
    multiSite: false,
    watchAndLearn: false,
    agentBuildsAgents: false,
    apiAutodiscovery: false,
    zeroConfigWizard: false,
    proceduralMemory: false,
    modelRouting: "auto" as const,
    verificationCheckpoints: false,
    priorityExecution: false,
    workflows: true,
  },
  PRO: {
    agents: 10,
    chatsPerMonth: 999999,
    knowledgeBases: 10,
    computerUse: true,
    codeSandbox: true,
    agentSwarm: true,
    maxSubAgents: 5,
    deepResearch: true,
    parallelBranches: 5,
    scheduledWorkflows: 3,
    maxStepsPerRun: 100,
    diffDetection: true,
    proofOfWork: true,
    multiSite: false,
    watchAndLearn: false,
    agentBuildsAgents: false,
    apiAutodiscovery: false,
    zeroConfigWizard: false,
    proceduralMemory: false,
    modelRouting: "smart" as const,
    verificationCheckpoints: true,
    priorityExecution: false,
    workflows: true,
  },
  AGENCY: {
    agents: 999999,
    chatsPerMonth: 999999,
    knowledgeBases: 999999,
    computerUse: true,
    codeSandbox: true,
    agentSwarm: true,
    maxSubAgents: 20,
    deepResearch: true,
    parallelBranches: 10,
    scheduledWorkflows: 999999,
    maxStepsPerRun: 9999,
    diffDetection: true,
    proofOfWork: true,
    multiSite: true,
    watchAndLearn: true,
    agentBuildsAgents: true,
    apiAutodiscovery: true,
    zeroConfigWizard: true,
    proceduralMemory: true,
    modelRouting: "manual" as const,
    verificationCheckpoints: true,
    priorityExecution: true,
    workflows: true,
  },
  ENTERPRISE: {
    agents: 999999,
    chatsPerMonth: 50000,
    knowledgeBases: 999999,
    computerUse: true,
    codeSandbox: true,
    agentSwarm: true,
    maxSubAgents: 999999,
    deepResearch: true,
    parallelBranches: 999999,
    scheduledWorkflows: 999999,
    maxStepsPerRun: 9999,
    diffDetection: true,
    proofOfWork: true,
    multiSite: true,
    watchAndLearn: true,
    agentBuildsAgents: true,
    apiAutodiscovery: true,
    zeroConfigWizard: true,
    proceduralMemory: true,
    modelRouting: "manual" as const,
    verificationCheckpoints: true,
    priorityExecution: true,
    workflows: true,
  },
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
    AGENCY: "Business",
    ENTERPRISE: "Enterprise",
  };
  return labels[plan] || "Free";
}

export function getPlanPrice(plan: PlanType): string {
  const prices: Record<PlanType, string> = {
    FREE: "€0",
    STARTER: "€39",
    PRO: "€99",
    AGENCY: "€249",
    ENTERPRISE: "Custom",
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
