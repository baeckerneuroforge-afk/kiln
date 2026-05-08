import { getActivityFeed } from "@/lib/operations/aggregation";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? 20);
    const events = await getActivityFeed(Number.isFinite(limit) ? limit : 20);
    return Response.json({ events });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    const status = message === "Unauthenticated" ? 401 : 500;
    return Response.json({ error: message }, { status });
  }
}
