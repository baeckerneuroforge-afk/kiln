"use client";

/**
 * Sprint 19.7.5 — multi-select modal for deploying a template onto
 * specific sub-orgs.
 *
 * Server-side: fires POST /api/templates/{agents|workflows}/[id]/deploy
 * with the chosen OrgRelationship CUIDs. Existing instances are reused
 * (the install path is idempotent) so re-deploying is safe.
 */
import { useEffect, useState } from "react";
import { Check, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SubOrgRow {
  id: string; // OrgRelationship.id (CUID)
  childOrgId: string;
  subOrgName: string;
  subOrgStatus: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
}

interface Props {
  open: boolean;
  onClose: () => void;
  templateId: string;
  templateKind: "agents" | "workflows";
  templateName: string;
}

export function TemplateDeployModal({
  open,
  onClose,
  templateId,
  templateKind,
  templateName,
}: Props) {
  const [subOrgs, setSubOrgs] = useState<SubOrgRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setMessage(null);
    setLoading(true);
    fetch("/api/agency/sub-orgs", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { subOrgs: [] }))
      .then((data: { subOrgs?: SubOrgRow[] }) => {
        const active = (data.subOrgs ?? []).filter((s) => s.subOrgStatus === "ACTIVE");
        setSubOrgs(active);
      })
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === subOrgs.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(subOrgs.map((s) => s.id)));
    }
  }

  async function deploy() {
    if (selected.size === 0) return;
    setDeploying(true);
    try {
      const res = await fetch(`/api/templates/${templateKind}/${templateId}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subOrgIds: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Deploy fehlgeschlagen.");
        return;
      }
      setMessage(
        `${data.created} neu installiert, ${data.reused} bereits vorhanden (übersprungen).`,
      );
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      data-testid="template-deploy-modal"
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-popover shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-serif text-lg text-foreground">
              Deploy „{templateName}" auf Sub-Org(s)
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Wähle die Sub-Orgs aus, in denen das Template installiert werden soll.
              Existierende Instanzen werden übersprungen.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex h-24 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Lädt…
            </div>
          ) : subOrgs.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="template-deploy-modal-empty">
              Keine aktiven Sub-Orgs verfügbar.
            </p>
          ) : (
            <>
              <button
                onClick={toggleAll}
                className="mb-3 text-xs text-kiln-orange hover:underline"
                data-testid="template-deploy-modal-toggle-all"
              >
                {selected.size === subOrgs.length ? "Alle abwählen" : "Alle auswählen"}
              </button>
              <ul className="space-y-1.5" data-testid="template-deploy-modal-list">
                {subOrgs.map((sub) => {
                  const isChecked = selected.has(sub.id);
                  return (
                    <li key={sub.id}>
                      <label
                        className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card/40 px-3 py-2 text-sm hover:bg-card"
                        data-testid={`template-deploy-modal-row-${sub.id}`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggle(sub.id)}
                          className="h-4 w-4"
                        />
                        <span className="flex-1 truncate text-foreground">{sub.subOrgName}</span>
                        {isChecked && <Check className="h-3.5 w-3.5 text-kiln-orange" />}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {message && (
          <div className="border-t border-border bg-card/30 px-5 py-3 text-sm text-muted-foreground">
            {message}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={deploy}
            disabled={selected.size === 0 || deploying}
            data-testid="template-deploy-modal-submit"
          >
            {deploying ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1 h-4 w-4" />
            )}
            Deploy ({selected.size})
          </Button>
        </div>
      </div>
    </div>
  );
}
