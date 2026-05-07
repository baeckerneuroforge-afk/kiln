import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, type PlanType } from "@/lib/stripe";
import { KnowledgePageShell } from "@/components/knowledge/knowledge-page-shell";

export const metadata = {
  title: "Knowledge — KILN",
};

/**
 * /dashboard/knowledge — top-level knowledge hub.
 *
 * Two tabs:
 *   - bases (default) → flat list of every agent's knowledge collection
 *     with cross-base search.
 *   - graph → the existing knowledge-graph visualization.
 *
 * The tab is read from the URL (`?tab=bases` / `?tab=graph`) so deep
 * links and bookmarks land where the operator left them.
 */
export default async function KnowledgeHubPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });

  const plan = (user?.plan || "FREE") as PlanType;
  const limits = PLAN_LIMITS[plan];

  return (
    <KnowledgePageShell
      planHasGraph={limits.knowledgeGraph}
      planHasVisual={limits.knowledgeGraphVisual}
    />
  );
}
