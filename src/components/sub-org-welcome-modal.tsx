"use client";

import { useEffect, useState } from "react";
import { Building2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrgModeDetails } from "@/hooks/use-org-mode";

export function SubOrgWelcomeModal() {
  const details = useOrgModeDetails();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (details.loading || details.mode !== "SUB_ORG" || !details.orgId) return;
    const key = `kiln-sub-org-welcome-${details.orgId}`;
    if (localStorage.getItem(key) === "seen") return;
    setVisible(true);
  }, [details.loading, details.mode, details.orgId]);

  function close() {
    if (details.orgId) {
      localStorage.setItem(`kiln-sub-org-welcome-${details.orgId}`, "seen");
    }
    setVisible(false);
  }

  if (!visible || details.mode !== "SUB_ORG") return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-kiln-orange/10 text-kiln-orange">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Willkommen bei {details.subOrgName ?? "Ihrer Sub-Org"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Dies ist Ihre Kundenansicht mit Departments, Conversations und Freigaben.
              </p>
            </div>
          </div>
          <button onClick={close} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Starten Sie bei Ihren Departments, prüfen Sie offene Approvals oder ergänzen Sie die Knowledge Base.</p>
          <p>Agency-Settings, Sub-Orgs und Template-Verwaltung sind in dieser Ansicht bewusst ausgeblendet.</p>
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={close}>Los gehts</Button>
        </div>
      </div>
    </div>
  );
}
