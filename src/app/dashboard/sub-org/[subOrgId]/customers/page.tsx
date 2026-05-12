/**
 * Sprint 19.7.3 — Sub-Org end-customers (CustomerProfile-backed).
 * Read-only for everyone (conversations.read implies visibility);
 * editing is FULL_ACCESS-only but happens elsewhere for now.
 */
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { getSubOrgContext } from "@/lib/sub-org/get-sub-org-context";
import { getSubOrgCustomers } from "@/lib/sub-org/get-sub-org-data";

export const dynamic = "force-dynamic";

interface PageProps { params: { subOrgId: string } }

export default async function SubOrgCustomersPage({ params }: PageProps) {
  const context = await getSubOrgContext(params.subOrgId);
  if (!context) notFound();
  if (!context.permissions.has("conversations.read")) notFound();

  const customers = await getSubOrgCustomers(context.clerkOrgId, 50);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 font-serif text-2xl text-foreground">
          <Users className="h-5 w-5 text-kiln-orange" />
          Customers
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          End-Customer-Profile im Workspace „{context.subOrg.subOrgName}".
        </p>
      </header>

      {customers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/30 p-10 text-center" data-testid="sub-org-customers-empty">
          <Users className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <p className="text-base font-medium text-foreground">Noch keine Customer-Profile.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Profile entstehen automatisch, sobald Agents Conversations führen.
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="sub-org-customers-list">
          {customers.map((c) => (
            <div key={c.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">
                    {c.fullName ?? c.primaryEmail ?? c.primaryPhone ?? c.id.slice(0, 8)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.totalConversations} Conversations
                    {c.primaryEmail ? ` · ${c.primaryEmail}` : ""}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                  Last seen {c.lastSeenAt.toLocaleDateString("de-DE")}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
