import type { SlaPolicy } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type SlaAppliesTo = "ALL" | "BY_PRIORITY" | "BY_CHANNEL" | "BY_TAG";

export interface PolicyMatchInput {
  departmentId: string;
  channel?: string | null;
  priority?: string | null;
  tags?: string[] | null;
}

/**
 * Returns the highest-priority active SLA policy that matches the given
 * inbound context, or null if none applies.
 *
 * Match precedence:
 *  - more specific rules (BY_PRIORITY/BY_CHANNEL/BY_TAG) and higher
 *    `priority` field both contribute. The combined sort is `priority`
 *    DESC, then `appliesTo` rank (ALL last) DESC.
 */
export async function findApplicablePolicy(input: PolicyMatchInput): Promise<SlaPolicy | null> {
  const policies = await prisma.slaPolicy.findMany({
    where: {
      departmentId: input.departmentId,
      isActive: true,
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  const matched = policies.filter((policy) => matchesContext(policy, input));
  if (matched.length === 0) return null;
  matched.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return appliesToRank(b.appliesTo) - appliesToRank(a.appliesTo);
  });
  return matched[0] ?? null;
}

function matchesContext(policy: SlaPolicy, input: PolicyMatchInput): boolean {
  switch (policy.appliesTo as SlaAppliesTo) {
    case "ALL":
      return true;
    case "BY_PRIORITY":
      return Boolean(policy.conditionValue) && normalize(input.priority) === normalize(policy.conditionValue);
    case "BY_CHANNEL":
      return Boolean(policy.conditionValue) && normalize(input.channel) === normalize(policy.conditionValue);
    case "BY_TAG":
      if (!policy.conditionValue) return false;
      return Array.isArray(input.tags) && input.tags.some((tag) => normalize(tag) === normalize(policy.conditionValue));
    default:
      return false;
  }
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function appliesToRank(value: string): number {
  switch (value as SlaAppliesTo) {
    case "BY_TAG":
      return 4;
    case "BY_PRIORITY":
      return 3;
    case "BY_CHANNEL":
      return 2;
    case "ALL":
      return 1;
    default:
      return 0;
  }
}
