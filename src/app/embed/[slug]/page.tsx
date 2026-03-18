import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PublicAgentChat } from "@/components/agents/public-agent-chat";

interface Props {
  params: { slug: string };
  searchParams?: { theme?: string; sound?: string };
}

function isValidHexColor(value: string | undefined): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

// Embed-Seite — wird im iframe geladen, kein Layout nötig
export default async function EmbedPage({ params, searchParams }: Props) {
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
    },
  });

  if (!agent || agent.status !== "LIVE") {
    notFound();
  }

  const whiteLabel = (agent.whiteLabel as Record<string, unknown>) || {};
  const primaryColor = isValidHexColor(searchParams?.theme)
    ? searchParams!.theme
    : (typeof whiteLabel.primaryColor === "string" ? whiteLabel.primaryColor : "#F97316");
  const soundEnabled =
    searchParams?.sound === "1"
      ? true
      : typeof whiteLabel.soundEnabled === "boolean"
      ? whiteLabel.soundEnabled
      : false;

  const effectiveWelcome = agent.showAiDisclaimer
    ? `I am an AI assistant.${agent.welcomeMessage ? ` ${agent.welcomeMessage}` : ""}`
    : agent.welcomeMessage;

  return (
    <PublicAgentChat
      agentId={agent.id}
      agentName={agent.name}
      welcomeMessage={effectiveWelcome}
      suggestedQuestions={agent.suggestedQuestions}
      primaryColor={primaryColor}
      logoUrl={typeof whiteLabel.logo === "string" ? whiteLabel.logo : null}
      avatarUrl={typeof whiteLabel.avatarUrl === "string" ? whiteLabel.avatarUrl : null}
      soundEnabled={soundEnabled}
      showPoweredBy={agent.showPoweredBy}
      imageAnalysisEnabled={agent.imageAnalysisEnabled}
      customCss={typeof whiteLabel.customCss === "string" ? whiteLabel.customCss : null}
      schedule={
        whiteLabel.schedule && typeof whiteLabel.schedule === "object"
          ? (whiteLabel.schedule as Record<string, unknown>)
          : null
      }
    />
  );
}

export const dynamic = "force-dynamic";
