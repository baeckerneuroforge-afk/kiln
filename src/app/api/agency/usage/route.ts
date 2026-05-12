/**
 * Sprint 19.7.5 — agency-wide usage rollup.
 *
 *   GET /api/agency/usage?period=week|month   →  JSON
 *   GET /api/agency/usage?period=month&format=csv   →  CSV download
 *
 * Auth: requireAgencyMode (caller must be in their agency Clerk org).
 * Cross-agency lookups never resolve because the helper filters on
 * agencyOrgId = the caller's active org.
 */
import { auth } from "@clerk/nextjs/server";
import {
  getAgencyUsage,
  toCsv,
  type AgencyUsagePeriod,
} from "@/lib/agency/get-agency-usage";

export const dynamic = "force-dynamic";

function parsePeriod(raw: string | null): AgencyUsagePeriod {
  if (raw === "week" || raw === "month") return raw;
  return "month";
}

export async function GET(request: Request) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!orgId) {
    return Response.json(
      { error: "No active organization. Switch to your agency org first." },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const period = parsePeriod(url.searchParams.get("period"));
  const sinceParam = url.searchParams.get("since");
  const untilParam = url.searchParams.get("until");
  const format = url.searchParams.get("format");

  const since = sinceParam ? new Date(sinceParam) : undefined;
  const until = untilParam ? new Date(untilParam) : undefined;
  const useCustom = !!(since && until && !Number.isNaN(since.valueOf()) && !Number.isNaN(until.valueOf()));

  const usage = await getAgencyUsage({
    agencyOrgId: orgId,
    period: useCustom ? "custom" : period,
    since: useCustom ? since : undefined,
    until: useCustom ? until : undefined,
  });

  if (format === "csv") {
    return new Response(toCsv(usage), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="kiln-agency-usage-${usage.period}.csv"`,
      },
    });
  }

  return Response.json(usage);
}
