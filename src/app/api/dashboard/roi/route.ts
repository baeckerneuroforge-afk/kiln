import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { roiTracker } from "@/lib/analytics/roi-tracker";

export const dynamic = "force-dynamic";

// ROI-Dashboard-Zusammenfassung laden
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const period = request.nextUrl.searchParams.get("period") || "monthly";

    const result = period === "weekly"
      ? await roiTracker.getWeeklyROISummary(userId)
      : await roiTracker.getMonthlyROIReport(userId);

    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
