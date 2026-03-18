import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getUserEmailOrPlaceholder } from "@/lib/clerk-user-email";
import type { Prisma } from "@prisma/client";

type OnboardingState = {
  embedCopied?: boolean;
  agentTested?: boolean;
  checklistHidden?: boolean;
};

type ChecklistStep = {
  key:
    | "first_agent"
    | "knowledge_added"
    | "agent_tested"
    | "embed_copied"
    | "first_conversation"
    | "integration_connected";
  label: string;
  completed: boolean;
  link: string;
};

function parseOnboardingState(value: Prisma.JsonValue | null | undefined): OnboardingState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  return {
    embedCopied: record.embedCopied === true,
    agentTested: record.agentTested === true,
    checklistHidden: record.checklistHidden === true,
  };
}

function mergeOnboardingState(
  current: Prisma.JsonValue | null | undefined,
  updates: OnboardingState
): OnboardingState {
  return {
    ...parseOnboardingState(current),
    ...updates,
  };
}

async function buildOnboardingStatus(userId: string, onboardingState: OnboardingState) {
  const [
    agents,
    knowledgeCount,
    activeIntegrationCount,
    visitorMemoryCount,
    externalConversationCount,
    testHistoryCount,
    testRunCount,
  ] = await Promise.all([
    prisma.agent.findMany({
      where: { userId },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.knowledgeBase.count({
      where: { agent: { userId } },
    }),
    prisma.integrationConnection.count({
      where: { userId, isActive: true },
    }),
    prisma.visitorMemory.count({
      where: { agent: { userId } },
    }),
    prisma.conversation.count({
      where: {
        agent: { userId },
        OR: [
          { channel: { in: ["WHATSAPP", "TELEGRAM", "EMAIL", "SLACK", "GITHUB"] } },
          { visitorEmail: { not: null } },
          { visitorName: { not: null } },
        ],
      },
    }),
    prisma.testComparison.count({
      where: { agent: { userId } },
    }),
    prisma.agentTestRun.count({
      where: { agent: { userId } },
    }),
  ]);

  const firstAgentId = agents[0]?.id;
  const agentLink = firstAgentId ? `/dashboard/agents/${firstAgentId}` : "/dashboard/agents/new";
  const embedLink = firstAgentId ? `/dashboard/agents/${firstAgentId}?tab=embed` : "/dashboard/agents/new";
  const knowledgeLink = firstAgentId
    ? `/dashboard/agents/${firstAgentId}?tab=knowledge`
    : "/dashboard/agents/new";

  const steps: ChecklistStep[] = [
    {
      key: "first_agent",
      label: "Create your first agent",
      completed: agents.length > 0,
      link: "/dashboard/agents/new",
    },
    {
      key: "knowledge_added",
      label: "Add knowledge to your agent",
      completed: knowledgeCount > 0,
      link: knowledgeLink,
    },
    {
      key: "agent_tested",
      label: "Test your agent",
      completed:
        onboardingState.agentTested === true || testHistoryCount > 0 || testRunCount > 0,
      link: agentLink,
    },
    {
      key: "embed_copied",
      label: "Embed on your website",
      completed: onboardingState.embedCopied === true,
      link: embedLink,
    },
    {
      key: "first_conversation",
      label: "Get your first conversation",
      completed: visitorMemoryCount > 0 || externalConversationCount > 0,
      link: "/dashboard/conversations",
    },
    {
      key: "integration_connected",
      label: "Connect an integration",
      completed: activeIntegrationCount > 0,
      link: "/dashboard/integrations",
    },
  ];

  const completedCount = steps.filter((step) => step.completed).length;

  return {
    steps,
    completedCount,
    totalCount: steps.length,
    hidden: onboardingState.checklistHidden === true,
    allComplete: completedCount === steps.length,
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingState: true },
  });

  const onboardingState = parseOnboardingState(user?.onboardingState as Prisma.JsonValue | null);
  const status = await buildOnboardingStatus(userId, onboardingState);

  return Response.json(status);
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const step = typeof body?.step === "string" ? body.step : null;
  const hidden =
    typeof body?.hidden === "boolean"
      ? body.hidden
      : typeof body?.action === "string" && body.action === "hide"
        ? true
        : typeof body?.action === "string" && body.action === "show"
          ? false
          : null;

  const userEmail = await getUserEmailOrPlaceholder(userId);
  const existingUser = await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, email: userEmail },
    select: { onboardingState: true },
  });

  const updates: OnboardingState = {};
  if (step === "embed_copied") updates.embedCopied = true;
  if (step === "agent_tested") updates.agentTested = true;
  if (hidden !== null) updates.checklistHidden = hidden;

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "Nothing to update." }, { status: 400 });
  }

  const merged = mergeOnboardingState(existingUser.onboardingState as Prisma.JsonValue | null, updates);

  await prisma.user.update({
    where: { id: userId },
    data: {
      onboardingState: merged as Prisma.InputJsonValue,
    },
  });

  const status = await buildOnboardingStatus(userId, merged);
  return Response.json(status);
}
