"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ErrorState } from "@/components/ui/error-state";
import { MODULE_PRICE_EUR } from "@/lib/billing/module-billing";
import type { ModuleName } from "@/lib/modules/types";
import { ModuleCard, type ModuleConfigSummary } from "./ModuleCard";
import { MODULE_LABELS, type ModuleMode } from "./validation";

interface ApiResponse {
  subAccountId: string;
  configs: Array<{
    id: string;
    moduleName: ModuleName;
    mode: string;
    isActive: boolean;
    hasCredentials: boolean;
    credentialsOwner: string | null;
  }>;
}

interface ModuleSettingsPageProps {
  /** Stable id used by both /api/agency/sub-orgs/[id]/modules and the back link. */
  relationshipId: string;
  /** Display name of the sub-org (rendered in the header). Optional. */
  subOrgName?: string;
}

export function ModuleSettingsPage({ relationshipId, subOrgName }: ModuleSettingsPageProps) {
  const [configs, setConfigs] = useState<ModuleConfigSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/agency/sub-orgs/${relationshipId}/modules`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(typeof body?.error === "string" ? body.error : `HTTP ${response.status}`);
        }
        return (await response.json()) as ApiResponse;
      })
      .then((payload) => {
        if (cancelled) return;
        setConfigs(
          payload.configs.map((row) => ({
            moduleName: row.moduleName,
            mode: (row.mode as ModuleMode) ?? "pool",
            isActive: row.isActive,
            hasCredentials: row.hasCredentials,
            credentialsOwner: row.credentialsOwner,
          })),
        );
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Loading failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [relationshipId]);

  const handleSaved = useCallback((next: ModuleConfigSummary) => {
    setConfigs((prev) => prev.map((row) => (row.moduleName === next.moduleName ? next : row)));
  }, []);

  const totalMonthlyCost = useMemo(() => {
    let total = 0;
    for (const row of configs) {
      if (row.isActive && row.mode === "pool") {
        total += MODULE_PRICE_EUR[row.moduleName] ?? 0;
      }
    }
    return total;
  }, [configs]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (error) {
    return <ErrorState message={`Module konnten nicht geladen werden: ${error}`} />;
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href={`/dashboard/agency/sub-orgs/${relationshipId}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
          >
            <ArrowLeft className="h-3 w-3" /> Zurück zum Sub-Account
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">
            Module Configuration{subOrgName ? ` for ${subOrgName}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pro Modul: Pool (KILN-managed), BYOK Agency oder BYOK Customer. Pool-Module werden
            monatlich auf die Agency-Rechnung gestellt; BYOK ist kostenfrei für die Agency.
          </p>
        </div>
        <div className="rounded-md border border-border bg-card px-4 py-3 text-right">
          <div className="text-xs uppercase text-muted-foreground">Aktuelle Monats-Pauschale</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">
            {totalMonthlyCost.toLocaleString("de-DE")} EUR
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {configs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Module für dieses Sub-Account konfigurierbar.</p>
        ) : null}
        {(["ai", "sms", "voice", "whatsapp"] as ModuleName[]).map((moduleName) => {
          const row = configs.find((c) => c.moduleName === moduleName);
          if (!row) return null;
          return (
            <ModuleCard
              key={moduleName}
              subAccountId={relationshipId}
              initial={row}
              poolPriceEur={MODULE_PRICE_EUR[moduleName]}
              onSaved={handleSaved}
            />
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Hinweis: Änderungen werden sofort gespeichert. Pool-Aktivierung fügt der nächsten
        Agency-Rechnung das entsprechende Modul-Item hinzu (sofern Stripe-Billing für{" "}
        {MODULE_LABELS.ai} aktiviert ist).
      </p>
    </div>
  );
}
