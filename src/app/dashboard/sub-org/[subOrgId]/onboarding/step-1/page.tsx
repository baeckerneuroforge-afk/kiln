/**
 * Sprint 19.7.6 — wizard step 1: profile.
 *
 * Lightweight intro step — confirms who the user is and gives a soft
 * landing into the workspace. Avatar/display-name actually live on the
 * Clerk profile, so we just point the user at it; this step exists
 * primarily to let the orchestrator track "user has started onboarding".
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUserSubOrgMembership } from "@/lib/permissions/sub-org-permissions";
import { OnboardingShell } from "@/components/sub-org/onboarding/onboarding-shell";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { subOrgId: string };
}

export default async function OnboardingStep1({ params }: PageProps) {
  const { userId } = await auth();
  if (!userId) notFound();
  const membership = await getUserSubOrgMembership(userId, params.subOrgId);
  if (!membership) notFound();

  const subOrg = await prisma.orgRelationship.findUnique({
    where: { id: params.subOrgId },
    select: { subOrgName: true },
  });
  if (!subOrg) notFound();

  return (
    <OnboardingShell
      subOrgId={params.subOrgId}
      step={1}
      title={`Willkommen bei ${subOrg.subOrgName}`}
      description="In drei kurzen Schritten ist dein Workspace startklar."
      nextHref={`/dashboard/sub-org/${params.subOrgId}/onboarding/step-2`}
    >
      <div className="flex items-start gap-3" data-testid="onboarding-step-1-body">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-kiln-orange/10">
          <Sparkles className="h-5 w-5 text-kiln-orange" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Schön dass du da bist.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Avatar und Display-Name liegen in deinem Account-Profil. Diese Schritte
            zeigen dir, wie du den Workspace nutzt — sie sind optional, du kannst
            jederzeit „Später erinnern" wählen.
          </p>
          <Link
            href="/dashboard/settings"
            className="mt-3 inline-block text-xs text-kiln-orange hover:underline"
          >
            Profil-Einstellungen öffnen →
          </Link>
        </div>
      </div>
    </OnboardingShell>
  );
}
