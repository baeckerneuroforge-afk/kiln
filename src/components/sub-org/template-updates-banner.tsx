/**
 * Sprint 19.7.5 — banner rendered on the sub-org agents / workflows
 * pages when at least one installed template has a newer version
 * available. Read-only — accepting / declining updates is the agency's
 * call (push from the template editor side).
 */
import { Sparkles } from "lucide-react";
import type { AvailableTemplateUpdate } from "@/lib/sub-org/get-template-updates";

interface Props {
  updates: AvailableTemplateUpdate[];
  kind: "agents" | "workflows";
}

export function TemplateUpdatesBanner({ updates, kind }: Props) {
  if (updates.length === 0) return null;

  const noun = kind === "agents" ? "Agent" : "Workflow";
  const customizedCount = updates.filter((u) => u.isCustomized).length;

  return (
    <div
      data-testid={`template-updates-banner-${kind}`}
      className="mb-4 rounded-xl border border-kiln-orange/30 bg-kiln-orange/5 px-4 py-3"
    >
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-kiln-orange" />
        <div className="min-w-0 text-sm">
          <p className="font-medium text-foreground">
            {updates.length}{" "}
            {updates.length === 1
              ? `${noun}-Template-Update verfügbar`
              : `${noun}-Template-Updates verfügbar`}
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {updates.map((u) => (
              <li key={`${u.templateId}-${u.instanceId}`}>
                {u.templateName}: v{u.currentVersion} → v{u.latestVersion}
                {u.isCustomized && (
                  <span className="ml-2 inline-flex items-center rounded bg-card px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                    angepasst – wird übersprungen
                  </span>
                )}
              </li>
            ))}
          </ul>
          {customizedCount > 0 && customizedCount < updates.length && (
            <p className="mt-2 text-xs text-muted-foreground">
              {customizedCount} der Updates werden übersprungen, weil die Instanz manuell
              angepasst wurde. Updates werden von der Agency angewendet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
