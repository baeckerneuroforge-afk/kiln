import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { roiTracker } from "@/lib/analytics/roi-tracker";

// ROI-Daten für einen Agent laden
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: agentId } = await params;

    const agent = await prisma.agent.findFirst({
      where: { id: agentId, userId },
      select: { id: true },
    });

    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const metrics = await roiTracker.calculateROI(agentId, 30);

    // ROI-Config laden, falls vorhanden
    const config = await prisma.rOIConfig.findUnique({
      where: { agentId },
    });

    return Response.json({ metrics, config });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// ROI-Config setzen/aktualisieren
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: agentId } = await params;

    const agent = await prisma.agent.findFirst({
      where: { id: agentId, userId },
      select: { id: true },
    });

    if (!agent) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    const body = await request.json();
    const { manualTimeMinutes, hourlyRateCents, frequency, taskDescription } = body;

    // Validierung
    if (!manualTimeMinutes || manualTimeMinutes <= 0) {
      return Response.json(
        { error: "manualTimeMinutes muss größer als 0 sein" },
        { status: 400 }
      );
    }

    if (!hourlyRateCents || hourlyRateCents <= 0) {
      return Response.json(
        { error: "hourlyRateCents muss größer als 0 sein" },
        { status: 400 }
      );
    }

    const validFrequencies = ["daily", "weekly", "monthly"];
    if (!frequency || !validFrequencies.includes(frequency)) {
      return Response.json(
        { error: "frequency muss 'daily', 'weekly' oder 'monthly' sein" },
        { status: 400 }
      );
    }

    await roiTracker.setTaskValue(agentId, {
      manualTimeMinutes,
      hourlyRateCents,
      frequency,
      taskDescription,
    });

    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
