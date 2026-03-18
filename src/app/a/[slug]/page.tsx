import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { PublicAgentChat } from "@/components/agents/public-agent-chat";
import { SignInButton } from "@clerk/nextjs";

interface Props {
  params: { slug: string };
}

// Public Agent Page — auth required for INTERNAL agents
export default async function PublicAgentPage({ params }: Props) {
  const agent = await prisma.agent.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      name: true,
      slug: true,
      welcomeMessage: true,
      suggestedQuestions: true,
      whiteLabel: true,
      showPoweredBy: true,
      showAiDisclaimer: true,
      status: true,
      imageAnalysisEnabled: true,
      agentType: true,
      userId: true,
    },
  });

  if (!agent || agent.status !== "LIVE") {
    notFound();
  }

  // Internal agent: require authentication and team membership
  if (agent.agentType === "INTERNAL") {
    const { userId } = await auth();

    if (!userId) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
          <div className="max-w-sm text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-purple-500/10">
              <svg className="h-6 w-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="mb-2 text-lg font-semibold text-foreground">Internal Agent</h1>
            <p className="mb-6 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{agent.name}</span> is an internal agent. Please sign in to access it.
            </p>
            <SignInButton mode="modal">
              <button className="inline-flex items-center gap-2 rounded-lg bg-purple-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-500/90">
                Sign In to Continue
              </button>
            </SignInButton>
          </div>
        </div>
      );
    }

    // Check if user is the owner or a team member
    const userEmail = await getUserEmail(userId);
    const isOwner = agent.userId === userId;
    const isTeamMember = userEmail
      ? await prisma.teamMember.findUnique({
          where: { agentId_email: { agentId: agent.id, email: userEmail.toLowerCase() } },
        })
      : null;

    if (!isOwner && !isTeamMember) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
          <div className="max-w-sm text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-red-500/10">
              <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <h1 className="mb-2 text-lg font-semibold text-foreground">Access Denied</h1>
            <p className="text-sm text-muted-foreground">
              You don&apos;t have access to this internal agent. Contact the agent owner to request an invitation.
            </p>
          </div>
        </div>
      );
    }

    // Mark team member as accepted on first visit
    if (isTeamMember && !isTeamMember.acceptedAt) {
      await prisma.teamMember.update({
        where: { id: isTeamMember.id },
        data: { acceptedAt: new Date() },
      });
    }
  }

  const whiteLabel = (agent.whiteLabel as Record<string, unknown>) || {};
  const primaryColor =
    typeof whiteLabel.primaryColor === "string"
      ? whiteLabel.primaryColor
      : "#F97316";

  // AI Transparency: Prepend disclaimer to welcome message
  const effectiveWelcome = agent.showAiDisclaimer
    ? `I am an AI assistant.${agent.welcomeMessage ? ` ${agent.welcomeMessage}` : ""}`
    : agent.welcomeMessage;

  return (
    <div className="flex min-h-screen flex-col items-center bg-background">
      {/* Internal badge */}
      {agent.agentType === "INTERNAL" && (
        <div className="w-full bg-purple-500/10 py-2 text-center">
          <span className="text-xs font-medium text-purple-400">
            Internal Agent — Team access only
          </span>
        </div>
      )}

      {/* KILN Branding Header */}
      {agent.showPoweredBy && (
        <div className="w-full py-4 text-center">
          <a
            href="https://getkiln.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <span
              className="inline-block h-4 w-4 rounded"
              style={{
                background: "linear-gradient(135deg, #F97316, #DC2626)",
              }}
            />
            Powered by KILN
          </a>
        </div>
      )}

      {/* Agent Chat Container */}
      <div className="flex flex-1 items-center justify-center p-4 w-full">
        <div className="w-full max-w-lg">
          <PublicAgentChat
            agentId={agent.id}
            agentName={agent.name}
            welcomeMessage={effectiveWelcome}
            suggestedQuestions={agent.suggestedQuestions}
            primaryColor={primaryColor}
            logoUrl={typeof whiteLabel.logo === "string" ? whiteLabel.logo : null}
            showPoweredBy={agent.showPoweredBy}
            imageAnalysisEnabled={agent.imageAnalysisEnabled}
            customCss={typeof whiteLabel.customCss === "string" ? whiteLabel.customCss : null}
            schedule={
              whiteLabel.schedule && typeof whiteLabel.schedule === "object"
                ? (whiteLabel.schedule as Record<string, unknown>)
                : null
            }
          />
        </div>
      </div>
    </div>
  );
}

// Helper: Get user email from Clerk userId
async function getUserEmail(userId: string): Promise<string | null> {
  try {
    // Look up via Prisma user table first (faster than Clerk API)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    return user?.email || null;
  } catch {
    return null;
  }
}

// Middleware muss /a/* als public route kennen
export const dynamic = "force-dynamic";
