import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, type PlanType } from "@/lib/stripe";
import { CollaborationManager } from "@/components/collaboration/collaboration-manager";

export default async function SharedPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });

  const plan = (user?.plan || "FREE") as PlanType;
  const limits = PLAN_LIMITS[plan];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground font-[family-name:var(--font-instrument)]">
          Agent Collaboration
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Teile Agents und arbeite teamübergreifend
        </p>
      </div>

      {/* Collaboration Manager */}
      <CollaborationManager
        planAllowsCollab={limits.agentCollaboration}
        planAllowsDirectory={limits.publicAgentDirectory}
        maxCollaborations={limits.maxCollaborations}
      />
    </div>
  );
}
