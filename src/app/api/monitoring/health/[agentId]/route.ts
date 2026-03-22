import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { AgentHealthMonitor } from "@/lib/monitoring/agent-health-monitor";

// GET /api/monitoring/health/:agentId — Detaillierte Health für einen Agent
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { agentId } = await params;
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "7");

  const health = await AgentHealthMonitor.getAgentHealth(agentId, days);
  if (!health) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const trend = await AgentHealthMonitor.getPerformanceTrend(agentId, days);

  return NextResponse.json({ health, trend });
}
