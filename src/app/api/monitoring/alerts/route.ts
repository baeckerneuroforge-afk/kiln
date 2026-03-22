import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { AgentHealthMonitor } from "@/lib/monitoring/agent-health-monitor";

// POST /api/monitoring/alerts — Alert bestätigen
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { alertId, acknowledgeAll } = body;

  if (acknowledgeAll) {
    await AgentHealthMonitor.acknowledgeAllAlerts(userId);
  } else if (alertId) {
    await AgentHealthMonitor.acknowledgeAlert(alertId, userId);
  }

  return NextResponse.json({ success: true });
}
