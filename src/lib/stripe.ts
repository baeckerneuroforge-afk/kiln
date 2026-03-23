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
