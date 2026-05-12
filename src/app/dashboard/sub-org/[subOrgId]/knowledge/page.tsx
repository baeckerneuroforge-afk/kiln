/**
 * Sprint 19.7.3 — Sub-Org Knowledge Base list.
 *
 * Permission matrix:
 *   READ_ONLY / USE_AGENTS                  → notFound() (no knowledge.read)
 *   USE_AGENTS_PLUS_KNOWLEDGE / FULL_ACCESS → read + upload
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { Waypoints, Lock, Upload } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getSubOrgContext } from "@/lib/sub-org/get-sub-org-context";
import { getSubOrgKnowledgeBases } from "@/lib/sub-org/get-sub-org-data";

export const dynamic = "force-dynamic";

interface PageProps { params: { subOrgId: string } }

export default async function SubOrgKnowledgePage({ params }: PageProps) {
  const context = await getSubOrgContext(params.subOrgId);
  if (!context) notFound();
  if (!context.permissions.has("knowledge.read")) notFound();

  const canWrite = context.permissions.has("knowledge.write");
  const bases = await getSubOrgKnowledgeBases(context.clerkOrgId);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-2xl text-foreground">
            <Waypoints className="h-5 w-5 text-kiln-orange" />
            Knowledge Base
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dokumente und Sources für „{context.subOrg.subOrgName}".
          </p>
        </div>
        {canWrite ? (
          <Link
            href="/dashboard/knowledge"
            className={buttonVariants()}
            data-testid="sub-org-knowledge-upload-cta"
          >
            <Upload className="mr-1 h-4 w-4" /> Upload
          </Link>
        ) : (
          <span
            data-testid="sub-org-knowledge-readonly-badge"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card/40 px-3 py-1.5 text-xs text-muted-foreground"
          >
            <Lock className="h-3 w-3" /> Nur Lesen
          </span>
        )}
      </header>

      {bases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/30 p-10 text-center" data-testid="sub-org-knowledge-empty">
          <Waypoints className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <p className="text-base font-medium text-foreground">Noch keine Knowledge-Sources.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canWrite
              ? "Lade PDFs, URLs oder FAQs hoch um Agents mit Kontext zu versorgen."
              : "Kontaktiere deine Agency, damit Knowledge hinterlegt wird."}
          </p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="sub-org-knowledge-list">
          {bases.map((b) => (
            <div key={b.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{b.sourceName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {b.type} · {b.chunkCount} chunks · {b.embeddingStatus}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                  {b.createdAt.toLocaleDateString("de-DE")}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
