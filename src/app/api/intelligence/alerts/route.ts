import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getActiveAlerts, dismissAlert } from "@/lib/enterprise-alerts";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const alerts = await getActiveAlerts(userId);
    return Response.json({ alerts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST /api/intelligence/alerts — Alert dismissen
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { alertId } = await request.json();
    if (!alertId) {
      return Response.json({ error: "alertId required" }, { status: 400 });
    }

    await dismissAlert(alertId, userId);
    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
