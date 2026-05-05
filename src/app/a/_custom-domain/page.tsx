import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PublicAgentChat } from "@/components/agents/public-agent-chat";

interface Props {
  searchParams: { domain?: string };
}

// Custom Domain Resolver — rewritten here from middleware. Two paths:
//   1. Agent custom domain (legacy single-agent): render PublicAgentChat.
//   2. Agency custom domain (Phase 2.3c): show a sign-in landing page
//      that drops the visitor onto /dashboard with the agency's branding.
// Order matters: agent lookup first (it's the older convention), then
// agency. notFound() only when neither matches.
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
    // Try the agency-domain branch before giving up.
    const branding = await prisma.orgBranding.findUnique({
      where: { customDomain: domain },
      select: {
        orgId: true,
        agencyName: true,
        logoUrl: true,
        primaryColor: true,
        domainVerified: true,
      },
    });

    if (branding && branding.domainVerified) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
          <div className="w-full max-w-md text-center">
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt={branding.agencyName ?? "Agency"}
                className="mx-auto mb-6 h-12 w-auto max-w-[220px] object-contain"
              />
            ) : (
              <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-kiln-orange to-kiln-ember">
                <span className="font-serif text-xl font-bold text-white">
                  {(branding.agencyName ?? "K").charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <h1 className="font-serif text-2xl text-foreground">
              {branding.agencyName ?? "Workspace"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to access your client workspace.
            </p>
            <Link
              href="/sign-in"
              className="mt-6 inline-flex items-center justify-center rounded-lg bg-kiln-orange px-5 py-2.5 text-sm font-medium text-white hover:bg-kiln-orange/90"
              style={
                branding.primaryColor
                  ? { backgroundColor: branding.primaryColor }
                  : undefined
              }
            >
              Sign in
            </Link>
            <p className="mt-12 text-[11px] text-muted-foreground/60">
              Powered by{" "}
              <a
                href="https://getkiln.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                KILN
              </a>
            </p>
          </div>
        </div>
      );
    }

    notFound();
  }

  const whiteLabel = (agent.whiteLabel as Record<string, unknown>) || {};
  const primaryColor =
    typeof whiteLabel.primaryColor === "string"
      ? whiteLabel.primaryColor
      : "#F97316";

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
            logoUrl={typeof whiteLabel.logo === "string" ? whiteLabel.logo : null}
            showPoweredBy={agent.showPoweredBy}
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

export const dynamic = "force-dynamic";
