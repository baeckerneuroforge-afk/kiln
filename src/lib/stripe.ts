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
    // Phase 3 — agency tier flags. FREE has no sub-orgs and no Connect.
    maxSubOrgs: 0,
    hasWhiteLabel: false,
    hasCustomDomain: false,
    hasStripeConnect: false,
    hasRevenueDashboard: false,
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
    // MCP Client
    maxMCPConnections: 0,
    mcpTeamRoles: false,
    // Marketplace & ROI
    marketplaceSelling: false,
    roiDashboard: false,
    roiPdfExport: false,
    // Enterprise Features
    approvalWorkflows: false,
    clientPortal: false,
    auditTrail: false,
    auditRetentionDays: 0,
    notificationChannels: 1, // Nur E-Mail
    // Reseller & Monitoring
    resellerBilling: false,
    healthDashboard: false,
    healthAlerts: false,
    slaReports: false,
    // Knowledge Graph, Voice, Collaboration
    knowledgeGraph: false,
    knowledgeGraphVisual: false,
    voiceInterface: true,
    agentCollaboration: false,
    maxCollaborations: 0,
    publicAgentDirectory: false,
    // Developer Platform
    customNodes: false,
    customNodePublishing: false,
    embedComponents: false as false | "chat_only" | "all",
    sandboxAPI: false,
    sandboxAPISessionsPerMonth: 0,
    // Data Pipeline
    dataPipeline: false,
    maxDataConnections: 0,
    dataWriteEnabled: false,
    dataExplorer: false,
    // Webhooks & Team
    webhookSubscriptions: 0,
    webhookSSE: false,
    teamMembers: 1,
    rbacRoles: false,
    multiTenantDashboard: false,
    // Workspace & Quality
    agentWorkspaceMB: 0,
    outputPolishing: false,
  },
  STARTER: {
    agents: 3,
    chatsPerMonth: 500,
    knowledgeBases: 3,
    // STARTER stays for grandfathered subscribers; no agency tier features.
    maxSubOrgs: 0,
    hasWhiteLabel: false,
    hasCustomDomain: false,
    hasStripeConnect: false,
    hasRevenueDashboard: false,
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
    maxMCPConnections: 2,
    mcpTeamRoles: false,
    marketplaceSelling: false,
    roiDashboard: true,
    roiPdfExport: false,
    approvalWorkflows: false,
    clientPortal: false,
    auditTrail: false,
    auditRetentionDays: 0,
    notificationChannels: 2, // E-Mail + Slack
    resellerBilling: false,
    healthDashboard: true,
    healthAlerts: false,
    slaReports: false,
    knowledgeGraph: false,
    knowledgeGraphVisual: false,
    voiceInterface: true,
    agentCollaboration: false,
    maxCollaborations: 0,
    publicAgentDirectory: false,
    // Developer Platform
    customNodes: false,
    customNodePublishing: false,
    embedComponents: "chat_only" as false | "chat_only" | "all",
    sandboxAPI: false,
    sandboxAPISessionsPerMonth: 0,
    // Data Pipeline
    dataPipeline: false,
    maxDataConnections: 0,
    dataWriteEnabled: false,
    dataExplorer: false,
    // Webhooks & Team
    webhookSubscriptions: 3,
    webhookSSE: false,
    teamMembers: 1,
    rbacRoles: false,
    multiTenantDashboard: false,
    // Workspace & Quality
    agentWorkspaceMB: 0,
    outputPolishing: false,
  },
  PRO: {
    agents: 25,
    chatsPerMonth: 999999,
    knowledgeBases: 25,
    // Phase 3 — PRO is solo/team only; no sub-orgs, no Connect.
    maxSubOrgs: 0,
    hasWhiteLabel: false,
    hasCustomDomain: false,
    hasStripeConnect: false,
    hasRevenueDashboard: false,
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
    maxMCPConnections: 10,
    mcpTeamRoles: false,
    marketplaceSelling: true,
    roiDashboard: true,
    roiPdfExport: true,
    approvalWorkflows: true,
    clientPortal: false,
    auditTrail: true,
    auditRetentionDays: 90,
    notificationChannels: 3, // E-Mail + Slack + Telegram
    resellerBilling: false,
    healthDashboard: true,
    healthAlerts: true,
    slaReports: false,
    knowledgeGraph: true,
    knowledgeGraphVisual: false,
    voiceInterface: true,
    agentCollaboration: true,
    maxCollaborations: 3,
    publicAgentDirectory: false,
    // Developer Platform
    customNodes: true,
    customNodePublishing: false,
    embedComponents: "all" as false | "chat_only" | "all",
    sandboxAPI: true,
    sandboxAPISessionsPerMonth: 100,
    // Data Pipeline
    dataPipeline: true,
    maxDataConnections: 2,
    dataWriteEnabled: false,
    dataExplorer: true,
    // Webhooks & Team
    webhookSubscriptions: 10,
    webhookSSE: true,
    teamMembers: 3,
    rbacRoles: true,
    multiTenantDashboard: false,
    // Workspace & Quality
    agentWorkspaceMB: 1024,
    outputPolishing: true,
  },
  BUSINESS: {
    agents: 100,
    chatsPerMonth: 999999,
    knowledgeBases: 100,
    // Phase 3: BUSINESS gets sub-orgs but no Stripe Connect / white-label /
    // custom domain. The intent is "team-with-clients" without the agency
    // operator stack.
    maxSubOrgs: 5,
    hasWhiteLabel: false,
    hasCustomDomain: false,
    hasStripeConnect: false,
    hasRevenueDashboard: false,
    computerUse: true,
    codeSandbox: true,
    agentSwarm: true,
    maxSubAgents: 10,
    deepResearch: true,
    parallelBranches: 8,
    scheduledWorkflows: 10,
    maxStepsPerRun: 200,
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
    maxMCPConnections: 25,
    mcpTeamRoles: true,
    marketplaceSelling: true,
    roiDashboard: true,
    roiPdfExport: true,
    approvalWorkflows: true,
    clientPortal: true,
    auditTrail: true,
    auditRetentionDays: 180,
    notificationChannels: 4,
    resellerBilling: false,
    healthDashboard: true,
    healthAlerts: true,
    slaReports: false,
    knowledgeGraph: true,
    knowledgeGraphVisual: true,
    voiceInterface: true,
    agentCollaboration: true,
    maxCollaborations: 10,
    publicAgentDirectory: false,
    customNodes: true,
    customNodePublishing: false,
    embedComponents: "all" as false | "chat_only" | "all",
    sandboxAPI: true,
    sandboxAPISessionsPerMonth: 500,
    dataPipeline: true,
    maxDataConnections: 5,
    dataWriteEnabled: false,
    dataExplorer: true,
    webhookSubscriptions: 25,
    webhookSSE: true,
    teamMembers: 10,
    rbacRoles: true,
    multiTenantDashboard: true,
    agentWorkspaceMB: 4096,
    outputPolishing: true,
  },
  AGENCY: {
    agents: 999999,
    chatsPerMonth: 999999,
    knowledgeBases: 999999,
    // Phase 3: AGENCY tier is unlimited sub-orgs + the full white-label
    // agency operator stack (Stripe Connect, custom domain, revenue
    // dashboard, branding inheritance to sub-orgs).
    maxSubOrgs: 999999,
    hasWhiteLabel: true,
    hasCustomDomain: true,
    hasStripeConnect: true,
    hasRevenueDashboard: true,
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
    maxMCPConnections: 999999,
    mcpTeamRoles: true,
    marketplaceSelling: true,
    roiDashboard: true,
    roiPdfExport: true,
    approvalWorkflows: true,
    clientPortal: true,
    auditTrail: true,
    auditRetentionDays: 365,
    notificationChannels: 5, // Alle Kanäle
    resellerBilling: true,
    healthDashboard: true,
    healthAlerts: true,
    slaReports: true,
    knowledgeGraph: true,
    knowledgeGraphVisual: true,
    voiceInterface: true,
    agentCollaboration: true,
    maxCollaborations: 999999,
    publicAgentDirectory: true,
    // Developer Platform
    customNodes: true,
    customNodePublishing: true,
    embedComponents: "all" as false | "chat_only" | "all",
    sandboxAPI: true,
    sandboxAPISessionsPerMonth: 999999,
    // Data Pipeline
    dataPipeline: true,
    maxDataConnections: 999999,
    dataWriteEnabled: true,
    dataExplorer: true,
    // Webhooks & Team
    webhookSubscriptions: 999,
    webhookSSE: true,
    teamMembers: 999,
    rbacRoles: true,
    multiTenantDashboard: true,
    // Workspace & Quality
    agentWorkspaceMB: 10240,
    outputPolishing: true,
  },
  ENTERPRISE: {
    agents: 999999,
    chatsPerMonth: 50000,
    knowledgeBases: 999999,
    // ENTERPRISE inherits the full Phase 3 agency-operator stack like AGENCY.
    maxSubOrgs: 999999,
    hasWhiteLabel: true,
    hasCustomDomain: true,
    hasStripeConnect: true,
    hasRevenueDashboard: true,
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
    maxMCPConnections: 999999,
    mcpTeamRoles: true,
    marketplaceSelling: true,
    roiDashboard: true,
    roiPdfExport: true,
    approvalWorkflows: true,
    clientPortal: true,
    auditTrail: true,
    auditRetentionDays: 999999,
    notificationChannels: 5,
    resellerBilling: true,
    healthDashboard: true,
    healthAlerts: true,
    slaReports: true,
    knowledgeGraph: true,
    knowledgeGraphVisual: true,
    voiceInterface: true,
    agentCollaboration: true,
    maxCollaborations: 999999,
    publicAgentDirectory: true,
    // Developer Platform
    customNodes: true,
    customNodePublishing: true,
    embedComponents: "all" as false | "chat_only" | "all",
    sandboxAPI: true,
    sandboxAPISessionsPerMonth: 999999,
    // Data Pipeline
    dataPipeline: true,
    maxDataConnections: 999999,
    dataWriteEnabled: true,
    dataExplorer: true,
    // Webhooks & Team
    webhookSubscriptions: 999,
    webhookSSE: true,
    teamMembers: 999,
    rbacRoles: true,
    multiTenantDashboard: true,
    // Workspace & Quality
    agentWorkspaceMB: 999999,
    outputPolishing: true,
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
    BUSINESS: "Business",
    AGENCY: "Agency",
    ENTERPRISE: "Enterprise",
  };
  return labels[plan] || "Free";
}

export function getPlanPrice(plan: PlanType): string {
  const prices: Record<PlanType, string> = {
    FREE: "€0",
    STARTER: "€39",
    PRO: "€97",
    BUSINESS: "€297",
    AGENCY: "€497",
    ENTERPRISE: "Custom",
  };
  return prices[plan] || "€0";
}

/**
 * Phase 3 — canonical price catalog for the three current customer tiers,
 * in cents. The string price IDs come from env so dev / preview / prod
 * can each point at their own Stripe products.
 */
export const PLAN_PRICES: Record<
  "PRO" | "BUSINESS" | "AGENCY",
  { amount: number; currency: string; priceId: string | undefined }
> = {
  PRO: { amount: 9700, currency: "eur", priceId: process.env.STRIPE_PRICE_PRO },
  BUSINESS: { amount: 29700, currency: "eur", priceId: process.env.STRIPE_PRICE_BUSINESS },
  AGENCY: { amount: 49700, currency: "eur", priceId: process.env.STRIPE_PRICE_AGENCY },
};

// Stripe Price IDs für monatliche und jährliche Abrechnung
export function getStripePriceId(plan: PlanType, annual = false): string | null {
  if (plan === "FREE") return null;
  const envKey = annual
    ? `NEXT_PUBLIC_STRIPE_${plan}_YEARLY_PRICE_ID`
    : `NEXT_PUBLIC_STRIPE_${plan}_PRICE_ID`;
  return process.env[envKey] || null;
}

/* ── Phase 3: agency-tier feature gating ───────────────────────────────── */

type AgencyFlagKey =
  | "maxSubOrgs"
  | "hasWhiteLabel"
  | "hasCustomDomain"
  | "hasStripeConnect"
  | "hasRevenueDashboard";

function getAgencyFlag<K extends AgencyFlagKey>(
  plan: PlanType | null | undefined,
  key: K
): K extends "maxSubOrgs" ? number : boolean {
  // Cast through unknown — the per-tier types diverge but every tier we
  // ship with carries every agency flag (see the PLAN_LIMITS literals).
  const limits = plan ? (PLAN_LIMITS as Record<string, Record<string, unknown>>)[plan] : null;
  const value = limits?.[key];
  if (key === "maxSubOrgs") {
    return (typeof value === "number" ? value : 0) as K extends "maxSubOrgs" ? number : boolean;
  }
  return Boolean(value) as K extends "maxSubOrgs" ? number : boolean;
}

/**
 * "Is this plan eligible to manage Sub-Orgs?" Used as the broad gate for
 * sub-org creation, branding, and the agency dashboard. BUSINESS gets
 * sub-orgs (capped at 5) but not the Stripe Connect / white-label stack;
 * use canConnectStripe / canHaveCustomDomain for those finer-grained checks.
 */
export function isAgencyTierPlan(plan: PlanType | null | undefined): boolean {
  return getAgencyFlag(plan, "maxSubOrgs") > 0;
}

export function canConnectStripe(plan: PlanType | null | undefined): boolean {
  return getAgencyFlag(plan, "hasStripeConnect");
}

export function canHaveCustomDomain(plan: PlanType | null | undefined): boolean {
  return getAgencyFlag(plan, "hasCustomDomain");
}

export function canUseWhiteLabel(plan: PlanType | null | undefined): boolean {
  return getAgencyFlag(plan, "hasWhiteLabel");
}

export function canViewRevenueDashboard(plan: PlanType | null | undefined): boolean {
  return getAgencyFlag(plan, "hasRevenueDashboard");
}
