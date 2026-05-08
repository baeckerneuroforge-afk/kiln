import { getCostByCustomer, resolveTimeRange } from "@/lib/operations/aggregation";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const range = resolveTimeRange(url.searchParams);
    const customers = await getCostByCustomer(range);
    return Response.json({ customers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    const status = message === "Unauthenticated" ? 401 : 500;
    return Response.json({ error: message }, { status });
  }
}
