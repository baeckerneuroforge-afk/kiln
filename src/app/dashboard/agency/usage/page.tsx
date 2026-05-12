/**
 * Sprint 19.7.5 — Agency-wide usage dashboard.
 *
 * Lists every sub-org with its conversation count, LLM activity, and
 * estimated cost over a configurable window (default last 30 days).
 * The CSV export round-trips through the API route so the same numbers
 * back the UI and the download.
 */
import { Activity } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getAgencyUsage } from "@/lib/agency/get-agency-usage";
import { AgencyUsageTable } from "@/components/agency/agency-usage-table";

export const dynamic = "force-dynamic";

type PeriodParam = "week" | "month";

interface PageProps {
  searchParams?: { period?: string };
}

function parsePeriod(raw: string | undefined): PeriodParam {
  return raw === "week" ? "week" : "month";
}

export default async function AgencyUsagePage({ searchParams }: PageProps) {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!orgId) redirect("/dashboard");

  const period = parsePeriod(searchParams?.period);
  const usage = await getAgencyUsage({ agencyOrgId: orgId, period });

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-serif text-2xl text-foreground">
            <Activity className="h-5 w-5 text-kiln-orange" />
            Verbrauchs-Übersicht
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aggregierter Verbrauch aller Sub-Orgs · Fenster:{" "}
            {period === "week" ? "letzte 7 Tage" : "letzte 30 Tage"}
          </p>
        </div>
      </header>

      <AgencyUsageTable usage={usage} period={period} />
    </div>
  );
}
