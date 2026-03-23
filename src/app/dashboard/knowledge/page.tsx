import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, type PlanType } from "@/lib/stripe";
import KnowledgeGraphView from "@/components/knowledge/knowledge-graph-view";

export const metadata = {
  title: "Knowledge Graph – KILN",
};

export default async function KnowledgeGraphPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Plan laden und Limits prüfen
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });

  const plan = (user?.plan || "FREE") as PlanType;
  const limits = PLAN_LIMITS[plan];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-gray-400">
          Knowledge Graph
        </p>
        <h1 className="mt-2 font-serif text-3xl text-foreground">
          Knowledge Graph
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Automatisch aus Agent-Aktivitäten generiert. Entitäten, Beziehungen und
          Wissen aus allen Gesprächen.
        </p>
      </div>

      <KnowledgeGraphView
        planHasGraph={limits.knowledgeGraph}
        planHasVisual={limits.knowledgeGraphVisual}
      />
    </div>
  );
}
