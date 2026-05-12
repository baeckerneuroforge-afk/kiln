/**
 * Sprint 19.7.3 — Sub-Org conversations list. Read-only for every
 * permission level (conversations.read is in READ_ONLY).
 */
import { notFound } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { getSubOrgContext } from "@/lib/sub-org/get-sub-org-context";
import { getSubOrgConversations } from "@/lib/sub-org/get-sub-org-data";

export const dynamic = "force-dynamic";

interface PageProps { params: { subOrgId: string } }

export default async function SubOrgConversationsPage({ params }: PageProps) {
  const context = await getSubOrgContext(params.subOrgId);
  if (!context) notFound();
  if (!context.permissions.has("conversations.read")) notFound();

  const conversations = await getSubOrgConversations(context.clerkOrgId, 50);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 font-serif text-2xl text-foreground">
          <MessageSquare className="h-5 w-5 text-kiln-orange" />
          Conversations
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Letzte Chats im Workspace „{context.subOrg.subOrgName}".
        </p>
      </header>

      {conversations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/30 p-10 text-center" data-testid="sub-org-conversations-empty">
          <MessageSquare className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <p className="text-base font-medium text-foreground">Noch keine Conversations.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Sobald Agents Chats führen, erscheinen sie hier.
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="sub-org-conversations-list">
          {conversations.map((c) => (
            <div key={c.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">
                    {c.visitorName ?? c.visitorEmail ?? c.sessionId.slice(0, 8)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Agent: {c.agentName ?? "—"}
                    {c.leadScore !== null ? ` · Lead-Score ${c.leadScore}` : ""}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                  {c.createdAt.toLocaleString("de-DE")}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
