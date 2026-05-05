import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { NodesMarketplaceBrowser } from "@/components/nodes-marketplace/nodes-marketplace-browser";

/**
 * Node Marketplace — Server Component
 * Auth-Check, dann Client-Browser-Komponente.
 */
export default async function NodesMarketplacePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="min-h-screen bg-card p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="font-serif text-2xl text-foreground">Node Marketplace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Community-Nodes fuer deine Workflows
          </p>
        </div>

        {/* Client-Komponente fuer Browse/Install */}
        <NodesMarketplaceBrowser />
      </div>
    </div>
  );
}
