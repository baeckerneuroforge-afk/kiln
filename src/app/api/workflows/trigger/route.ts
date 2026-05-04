/**
 * Workflow Webhook Trigger Endpoint
 * POST /api/workflows/trigger?teamId=xxx&token=yyy
 *
 * Empfängt externe Webhook-Daten und startet den Workflow.
 * Authentifizierung über Team-ID + Webhook-Token.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  executeWorkflow,
  extractWorkflowDefinition,
} from "@/lib/services/workflow-runtime";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const teamId = request.nextUrl.searchParams.get("teamId");
    const token = request.nextUrl.searchParams.get("token");

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId Parameter fehlt" },
        { status: 400 }
      );
    }

    // Verifiziere Team + Webhook Token
    const team = await prisma.agentTeam.findUnique({
      where: { id: teamId },
      include: {
        webhooks: true,
      },
    });

    if (!team) {
      return NextResponse.json(
        { error: "Team nicht gefunden" },
        { status: 404 }
      );
    }

    // Token-Validierung: Der Token muss zu einem aktiven Webhook gehören
    if (token) {
      const webhook = team.webhooks.find(
        (w) => w.secret === token && w.active
      );
      if (!webhook) {
        return NextResponse.json(
          { error: "Ungültiger Webhook-Token" },
          { status: 401 }
        );
      }
    }

    // Prüfe ob der Team einen Workflow hat
    const workflowDef = extractWorkflowDefinition(team.config);
    if (!workflowDef) {
      return NextResponse.json(
        { error: "Kein Workflow für dieses Team konfiguriert" },
        { status: 400 }
      );
    }

    // Finde den Webhook-Trigger-Node
    const webhookTrigger = workflowDef.nodes.find(
      (n) => n.type === "trigger_webhook"
    );
    if (!webhookTrigger) {
      return NextResponse.json(
        { error: "Kein Webhook-Trigger im Workflow definiert" },
        { status: 400 }
      );
    }

    // Parse den Request-Body
    let payload: Record<string, unknown> = {};
    try {
      const contentType = request.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        payload = (await request.json()) as Record<string, unknown>;
      } else if (contentType.includes("application/x-www-form-urlencoded")) {
        const formData = await request.formData();
        formData.forEach((value, key) => {
          payload[key] = value;
        });
      } else {
        // Versuche JSON
        try {
          payload = (await request.json()) as Record<string, unknown>;
        } catch {
          payload = {};
        }
      }
    } catch {
      payload = {};
    }

    // Füge Request-Metadaten hinzu
    payload._requestHeaders = {
      userAgent: request.headers.get("user-agent"),
      ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip"),
      contentType: request.headers.get("content-type"),
    };

    // Starte den Workflow
    const result = await executeWorkflow({
      teamId,
      userId: team.userId,
      triggerNodeId: webhookTrigger.id,
      triggerPayload: payload,
      goal: team.goal || "Webhook-triggered Workflow",
    });

    return NextResponse.json({
      success: true,
      executionId: result.executionId,
      status: result.status,
    });
  } catch (err) {
    console.error("[Workflow Trigger]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Workflow Trigger fehlgeschlagen",
      },
      { status: 500 }
    );
  }
}

// GET für Health-Check / Webhook-Verifikation
export async function GET(request: NextRequest) {
  const teamId = request.nextUrl.searchParams.get("teamId");
  if (!teamId) {
    return NextResponse.json({ status: "ok", message: "Workflow Trigger Endpoint" });
  }

  const team = await prisma.agentTeam.findUnique({
    where: { id: teamId },
    select: { id: true, name: true, config: true },
  });

  if (!team) {
    return NextResponse.json({ error: "Team nicht gefunden" }, { status: 404 });
  }

  const hasWorkflow = extractWorkflowDefinition(team.config) !== null;

  return NextResponse.json({
    status: "ok",
    teamId: team.id,
    teamName: team.name,
    hasWorkflow,
  });
}
