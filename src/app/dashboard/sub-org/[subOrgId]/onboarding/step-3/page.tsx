/**
 * Sprint 19.7.6 — wizard step 3: first use.
 *
 * Two paths into "actually use the product": deploy an agent from a
 * template, or open conversations to test one already in the workspace.
 * Finishing this step calls the API with completed=true, which sets
 * onboardingCompletedAt and stops the layout from looping the user
 * back into the wizard on next page load.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Bot, MessageSquare, ArrowRight } from "lucide-react";
import { getUserSubOrgMembership } from "@/lib/permissions/sub-org-permissions";
import { OnboardingShell } from "@/components/sub-org/onboarding/onboarding-shell";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { subOrgId: string };
}

export default async function OnboardingStep3({ params }: PageProps) {
  const { userId } = await auth();
  if (!userId) notFound();
  const membership = await getUserSubOrgMembership(userId, params.subOrgId);
  if (!membership) notFound();

  return (
    <OnboardingShell
      subOrgId={params.subOrgId}
      step={3}
      title="Erster Test"
      description="Starte einen Agent oder schau dir bestehende Conversations an."
      nextHref={`/dashboard/sub-org/${params.subOrgId}`}
      completeOnNext
    >
      <div className="space-y-3" data-testid="onboarding-step-3-body">
        <Link
          href={`/dashboard/sub-org/${params.subOrgId}/agents`}
          className="group flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-kiln-orange/40"
          data-testid="onboarding-step-3-deploy-agent"
        >
          <Bot className="mt-0.5 h-5 w-5 text-kiln-orange" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Agent aus Template deployen</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Wähle ein passendes Template (Sales-Bot, Support, Lead-Qualifier) und
              starte mit nur einer Persona-Konfiguration.
            </p>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </Link>

        <Link
          href={`/dashboard/sub-org/${params.subOrgId}/conversations`}
          className="group flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-kiln-orange/40"
          data-testid="onboarding-step-3-conversations"
        >
          <MessageSquare className="mt-0.5 h-5 w-5 text-kiln-orange" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Conversations ansehen</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Falls bereits ein Agent läuft: hier siehst du Verlauf + Lead-Score
              + Sentiment je Gespräch.
            </p>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </Link>

        <p className="pt-1 text-xs text-muted-foreground">
          Klicke „Fertig", um den Wizard abzuschließen — du kannst die Schritte
          jederzeit überspringen oder neu starten.
        </p>
      </div>
    </OnboardingShell>
  );
}
