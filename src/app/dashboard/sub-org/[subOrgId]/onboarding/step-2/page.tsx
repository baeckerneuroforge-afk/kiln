/**
 * Sprint 19.7.6 — wizard step 2: integrations.
 *
 * Three options, all optional: BYO API key (LLM provider), OAuth
 * connection (Gmail / Calendar / Slack / HubSpot / Notion), or skip.
 * The links jump into the existing pages; the wizard just records that
 * the user passed through this step.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { KeyRound, Plug, ArrowRight } from "lucide-react";
import { getUserSubOrgMembership } from "@/lib/permissions/sub-org-permissions";
import { OnboardingShell } from "@/components/sub-org/onboarding/onboarding-shell";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { subOrgId: string };
}

export default async function OnboardingStep2({ params }: PageProps) {
  const { userId } = await auth();
  if (!userId) notFound();
  const membership = await getUserSubOrgMembership(userId, params.subOrgId);
  if (!membership) notFound();

  const integrationsHref = `/dashboard/sub-org/${params.subOrgId}/integrations`;

  return (
    <OnboardingShell
      subOrgId={params.subOrgId}
      step={2}
      title="Integrationen einrichten"
      description="Verbinde deine eigene LLM API-Key oder OAuth-Tools — optional."
      nextHref={`/dashboard/sub-org/${params.subOrgId}/onboarding/step-3`}
    >
      <div className="space-y-3" data-testid="onboarding-step-2-body">
        <Link
          href={`${integrationsHref}?tab=api-keys`}
          className="group flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-kiln-orange/40"
          data-testid="onboarding-step-2-byok"
        >
          <KeyRound className="mt-0.5 h-5 w-5 text-kiln-orange" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Eigener LLM API-Key (BYOK)</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Anthropic, OpenAI, Google. Wird verschlüsselt gespeichert; KILN nutzt
              ihn nur für Anfragen aus dieser Sub-Org.
            </p>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </Link>

        <Link
          href={`${integrationsHref}?tab=oauth`}
          className="group flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-kiln-orange/40"
          data-testid="onboarding-step-2-oauth"
        >
          <Plug className="mt-0.5 h-5 w-5 text-kiln-orange" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">OAuth-Tools verbinden</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Gmail, Google Calendar, Slack, HubSpot, Notion. Pro Sub-Org getrennt
              — keine Vermischung zwischen verschiedenen Kunden.
            </p>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </Link>

        <p className="pt-1 text-xs text-muted-foreground">
          Du kannst alles auch später unter „Integrationen" einrichten.
        </p>
      </div>
    </OnboardingShell>
  );
}
