import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { AgentHealthMonitor } from "@/lib/monitoring/agent-health-monitor";
import { checkFeatureAccess } from "@/lib/feature-access";

// GET /api/monitoring/health — System-Health-Übersicht
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await checkFeatureAccess(userId, "healthDashboard");
  if (!access.allowed) {
    return NextResponse.json({ error: access.upgradeMessage }, { status: 403 });
  }

  const health = await AgentHealthMonitor.getSystemHealth(userId);
  return NextResponse.json(health);
}
