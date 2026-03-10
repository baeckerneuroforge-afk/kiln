import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PublicAgentChat } from "@/components/agents/public-agent-chat";

interface Props {
  params: { slug: string };
}

// Public Agent Page — kein Auth nötig
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
      status: true,
    },
  });

  if (!agent || agent.status !== "LIVE") {
    notFound();
  }

  const whiteLabel = (agent.whiteLabel as Record<string, string>) || {};
  const primaryColor = whiteLabel.primaryColor || "#F97316";

  return (
    <div className="flex min-h-screen flex-col items-center bg-background">
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
            welcomeMessage={agent.welcomeMessage}
            suggestedQuestions={agent.suggestedQuestions}
            primaryColor={primaryColor}
            logoUrl={whiteLabel.logo || null}
            showPoweredBy={agent.showPoweredBy}
          />
        </div>
      </div>
    </div>
  );
}

// Middleware muss /a/* als public route kennen
export const dynamic = "force-dynamic";
