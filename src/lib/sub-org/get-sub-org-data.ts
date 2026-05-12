/**
 * Sprint 19.7.3 — read-side data helpers for /dashboard/sub-org/* pages.
 *
 * Every helper takes the Clerk org id of the sub-org (= the sub-org's
 * OrgRelationship.childOrgId) and filters the entity by `orgId`. No
 * cross-tenant joins, no userId fallback — just a strict orgId filter
 * so two sub-orgs under the same agency never see each other's data.
 */
import { prisma as defaultPrisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";

type PrismaLike = Pick<
  PrismaClient,
  | "agent"
  | "agentTeam"
  | "conversation"
  | "knowledgeBase"
  | "customerProfile"
  | "llmUsage"
  | "subOrgMembership"
>;

export type UsagePeriod = "day" | "week" | "month";

export interface SubOrgAgentEntry {
  id: string;
  name: string;
  slug: string;
  status: string;
  llmModel: string;
  createdAt: Date;
}

export async function getSubOrgAgents(
  clerkOrgId: string,
  prisma: PrismaLike = defaultPrisma,
): Promise<SubOrgAgentEntry[]> {
  return prisma.agent.findMany({
    where: { orgId: clerkOrgId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      llmModel: true,
      createdAt: true,
    },
  });
}

export interface SubOrgWorkflowEntry {
  id: string;
  name: string;
  status: string;
  createdAt: Date;
  memberCount: number;
}

export async function getSubOrgWorkflows(
  clerkOrgId: string,
  prisma: PrismaLike = defaultPrisma,
): Promise<SubOrgWorkflowEntry[]> {
  const rows = await prisma.agentTeam.findMany({
    where: { orgId: clerkOrgId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      _count: { select: { members: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    createdAt: r.createdAt,
    memberCount: r._count.members,
  }));
}

export interface SubOrgConversationEntry {
  id: string;
  sessionId: string;
  visitorName: string | null;
  visitorEmail: string | null;
  leadScore: number | null;
  sentiment: number | null;
  createdAt: Date;
  agentName: string | null;
}

export async function getSubOrgConversations(
  clerkOrgId: string,
  limit = 50,
  prisma: PrismaLike = defaultPrisma,
): Promise<SubOrgConversationEntry[]> {
  const rows = await prisma.conversation.findMany({
    where: { orgId: clerkOrgId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      sessionId: true,
      visitorName: true,
      visitorEmail: true,
      leadScore: true,
      sentiment: true,
      createdAt: true,
      agent: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.sessionId,
    visitorName: r.visitorName,
    visitorEmail: r.visitorEmail,
    leadScore: r.leadScore,
    sentiment: r.sentiment,
    createdAt: r.createdAt,
    agentName: r.agent?.name ?? null,
  }));
}

export interface SubOrgKnowledgeEntry {
  id: string;
  type: string;
  sourceName: string;
  chunkCount: number;
  embeddingStatus: string;
  createdAt: Date;
}

export async function getSubOrgKnowledgeBases(
  clerkOrgId: string,
  prisma: PrismaLike = defaultPrisma,
): Promise<SubOrgKnowledgeEntry[]> {
  return prisma.knowledgeBase.findMany({
    where: { orgId: clerkOrgId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      sourceName: true,
      chunkCount: true,
      embeddingStatus: true,
      createdAt: true,
    },
  });
}

export interface SubOrgCustomerEntry {
  id: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  fullName: string | null;
  totalConversations: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export async function getSubOrgCustomers(
  clerkOrgId: string,
  limit = 50,
  prisma: PrismaLike = defaultPrisma,
): Promise<SubOrgCustomerEntry[]> {
  return prisma.customerProfile.findMany({
    where: { orgId: clerkOrgId },
    orderBy: { lastSeenAt: "desc" },
    take: limit,
    select: {
      id: true,
      primaryEmail: true,
      primaryPhone: true,
      fullName: true,
      totalConversations: true,
      firstSeenAt: true,
      lastSeenAt: true,
    },
  });
}

export interface SubOrgUsageStats {
  period: UsagePeriod;
  since: Date;
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  durationMs: number;
  costUsd: number;
  conversationCount: number;
  agentCount: number;
  workflowCount: number;
}

export function periodToSince(period: UsagePeriod, now: Date = new Date()): Date {
  const ms =
    period === "day"
      ? 24 * 60 * 60 * 1000
      : period === "week"
        ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - ms);
}

export interface SubOrgMembershipEntry {
  id: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  permissionSet: "READ_ONLY" | "USE_AGENTS" | "USE_AGENTS_PLUS_KNOWLEDGE" | "FULL_ACCESS";
  invitedAt: Date | null;
  acceptedAt: Date | null;
  createdAt: Date;
}

/**
 * Sprint 19.7.3 — list the SubOrgMembership rows for a sub-org. We
 * don't enrich with Clerk user data here; the page does a best-effort
 * lookup against our User table for emails / display names.
 */
export async function getSubOrgMemberships(
  subOrgId: string,
  prisma: PrismaLike = defaultPrisma,
): Promise<SubOrgMembershipEntry[]> {
  const rows = await prisma.subOrgMembership.findMany({
    where: { subOrgId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      userId: true,
      role: true,
      permissionSet: true,
      invitedAt: true,
      acceptedAt: true,
      createdAt: true,
    },
  });
  return rows;
}

export async function getSubOrgUsageStats(
  clerkOrgId: string,
  period: UsagePeriod = "week",
  prisma: PrismaLike = defaultPrisma,
): Promise<SubOrgUsageStats> {
  const since = periodToSince(period);

  const [usage, convCount, agentCount, workflowCount] = await Promise.all([
    prisma.llmUsage.aggregate({
      where: { orgId: clerkOrgId, createdAt: { gte: since } },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cachedInputTokens: true,
        durationMs: true,
        costUsd: true,
      },
      _count: true,
    }),
    prisma.conversation.count({ where: { orgId: clerkOrgId } }),
    prisma.agent.count({ where: { orgId: clerkOrgId } }),
    prisma.agentTeam.count({ where: { orgId: clerkOrgId } }),
  ]);

  return {
    period,
    since,
    llmCalls: usage._count,
    inputTokens: usage._sum.inputTokens ?? 0,
    outputTokens: usage._sum.outputTokens ?? 0,
    cachedInputTokens: usage._sum.cachedInputTokens ?? 0,
    durationMs: usage._sum.durationMs ?? 0,
    costUsd: Number(usage._sum.costUsd ?? 0),
    conversationCount: convCount,
    agentCount,
    workflowCount,
  };
}
