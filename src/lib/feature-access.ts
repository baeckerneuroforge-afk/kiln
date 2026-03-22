import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, type PlanType, getPlanLabel } from "@/lib/stripe";
import { isAdmin } from "@/lib/admin";

/**
 * Feature-Namen die gegen Plan-Limits geprüft werden können
 */
export type FeatureName =
  | "computerUse"
  | "codeSandbox"
  | "agentSwarm"
  | "deepResearch"
  | "diffDetection"
  | "proofOfWork"
  | "multiSite"
  | "watchAndLearn"
  | "agentBuildsAgents"
  | "apiAutodiscovery"
  | "zeroConfigWizard"
  | "proceduralMemory"
  | "verificationCheckpoints"
  | "priorityExecution"
  | "workflows"
  | "approvalWorkflows"
  | "clientPortal"
  | "auditTrail"
  | "resellerBilling"
  | "healthDashboard"
  | "healthAlerts"
  | "slaReports";

export interface FeatureAccessResult {
  allowed: boolean;
  currentPlan: string;
  requiredPlan: string;
  upgradeMessage: string;
}

/**
 * Prüft ob der User Zugriff auf ein bestimmtes Feature hat
 */
export async function checkFeatureAccess(
  userId: string,
  feature: FeatureName,
): Promise<FeatureAccessResult> {
  if (isAdmin(userId)) {
    return { allowed: true, currentPlan: "ADMIN", requiredPlan: "ADMIN", upgradeMessage: "" };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const plan = (user?.plan || "FREE") as PlanType;
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.FREE;

  const allowed = Boolean(limits[feature]);
  const requiredPlan = getRequiredPlan(feature);

  return {
    allowed,
    currentPlan: plan,
    requiredPlan,
    upgradeMessage: allowed ? "" : getUpgradeMessage(feature, requiredPlan),
  };
}

/**
 * Synchrone Version für Client-seitiges Checking wenn Plan bekannt ist
 */
export function checkFeatureAccessSync(
  plan: string,
  feature: FeatureName,
): FeatureAccessResult {
  const planKey = (plan || "FREE") as PlanType;
  const limits = PLAN_LIMITS[planKey] || PLAN_LIMITS.FREE;

  const allowed = Boolean(limits[feature]);
  const requiredPlan = getRequiredPlan(feature);

  return {
    allowed,
    currentPlan: plan,
    requiredPlan,
    upgradeMessage: allowed ? "" : getUpgradeMessage(feature, requiredPlan),
  };
}

/**
 * Ermittelt den minimalen Plan der ein Feature freischaltet
 */
function getRequiredPlan(feature: FeatureName): string {
  const planOrder: PlanType[] = ["FREE", "STARTER", "PRO", "AGENCY", "ENTERPRISE"];

  for (const plan of planOrder) {
    if (Boolean(PLAN_LIMITS[plan][feature])) {
      return plan;
    }
  }
  return "ENTERPRISE";
}

/**
 * Generiert eine benutzerfreundliche Upgrade-Nachricht
 */
function getUpgradeMessage(feature: FeatureName, requiredPlan: string): string {
  const featureLabels: Record<FeatureName, string> = {
    computerUse: "Computer Use",
    codeSandbox: "Code Sandbox",
    agentSwarm: "Agent Swarm",
    deepResearch: "Deep Research",
    diffDetection: "Diff Detection",
    proofOfWork: "Proof of Work",
    multiSite: "Multi-Site Orchestration",
    watchAndLearn: "Watch & Learn",
    agentBuildsAgents: "Agent builds Agents",
    apiAutodiscovery: "API Autodiscovery",
    zeroConfigWizard: "Zero-Config Wizard",
    proceduralMemory: "Procedural Memory",
    verificationCheckpoints: "Verification Checkpoints",
    priorityExecution: "Priority Execution",
    workflows: "Workflows",
    approvalWorkflows: "Approval Workflows",
    clientPortal: "Client Portal",
    auditTrail: "Audit Trail",
    resellerBilling: "Reseller Billing",
    healthDashboard: "Health Dashboard",
    healthAlerts: "Health Alerts",
    slaReports: "SLA Reports",
  };

  const label = featureLabels[feature] || feature;
  const planLabel = getPlanLabel(requiredPlan as PlanType);

  return `Upgrade to ${planLabel} to unlock ${label}`;
}
