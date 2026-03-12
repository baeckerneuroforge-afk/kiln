import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PublicAgentChat } from "@/components/agents/public-agent-chat";

interface Props {
  params: { slug: string };
}

// Embed-Seite — wird im iframe geladen, kein Layout nötig
export default async function EmbedPage({ params }: Props) {
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
      status: true,
      imageAnalysisEnabled: true,
    },
  });

  if (!agent || agent.status !== "LIVE") {
    notFound();
  }

  const whiteLabel = (agent.whiteLabel as Record<string, string>) || {};
  const primaryColor = whiteLabel.primaryColor || "#F97316";

  return (
    <PublicAgentChat
      agentId={agent.id}
      agentName={agent.name}
      welcomeMessage={agent.welcomeMessage}
      suggestedQuestions={agent.suggestedQuestions}
      primaryColor={primaryColor}
      logoUrl={whiteLabel.logo || null}
      showPoweredBy={agent.showPoweredBy}
      imageAnalysisEnabled={agent.imageAnalysisEnabled}
    />
  );
}

export const dynamic = "force-dynamic";
