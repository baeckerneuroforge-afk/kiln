import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PublicAgentChat } from "@/components/agents/public-agent-chat";

interface Props {
  searchParams: { domain?: string };
}

// Custom Domain Agent Page — wird von Middleware rewritten
export default async function CustomDomainAgentPage({ searchParams }: Props) {
  const domain = searchParams.domain;
  if (!domain) {
    notFound();
  }

  const agent = await prisma.agent.findFirst({
    where: { customDomain: domain, status: "LIVE" },
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
    },
  });

  if (!agent) {
    notFound();
  }

  const whiteLabel = (agent.whiteLabel as Record<string, string>) || {};
  const primaryColor = whiteLabel.primaryColor || "#F97316";

  const effectiveWelcome = agent.showAiDisclaimer
    ? `I am an AI assistant.${agent.welcomeMessage ? ` ${agent.welcomeMessage}` : ""}`
    : agent.welcomeMessage;

  return (
    <div className="flex min-h-screen flex-col items-center bg-background">
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

      <div className="flex flex-1 items-center justify-center p-4 w-full">
        <div className="w-full max-w-lg">
          <PublicAgentChat
            agentId={agent.id}
            agentName={agent.name}
            welcomeMessage={effectiveWelcome}
            suggestedQuestions={agent.suggestedQuestions}
            primaryColor={primaryColor}
            logoUrl={whiteLabel.logo || null}
            showPoweredBy={agent.showPoweredBy}
            customCss={whiteLabel.customCss || null}
          />
        </div>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
