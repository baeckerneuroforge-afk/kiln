import { getCrossCustomerApprovals } from "@/lib/operations/aggregation";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? 10);
    const approvals = await getCrossCustomerApprovals(Number.isFinite(limit) ? limit : 10);
    return Response.json({ approvals });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    const status = message === "Unauthenticated" ? 401 : 500;
    return Response.json({ error: message }, { status });
  }
}
