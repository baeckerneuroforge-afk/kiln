import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { buildWorkflow, analyzeAndDecompose } from "@/lib/sandbox/workflow-builder";

/**
 * POST /api/workflows/auto-build — Workflow aus natürlicher Sprache erstellen
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json() as {
      description?: string;
      agentId?: string;
      action?: "analyze" | "build";
    };

    if (!body.description || typeof body.description !== "string") {
      return Response.json({ error: "Beschreibung fehlt" }, { status: 400 });
    }

    // Plan-Check: Pro+ für Auto-Build (Admins bypass — siehe lib/admin.ts).
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (
      user &&
      !["PRO", "AGENCY", "ENTERPRISE"].includes(user.plan) &&
      !isAdmin(userId)
    ) {
      return Response.json(
        { error: "Auto-Build ist ab dem Pro-Plan verfügbar" },
        { status: 403 }
      );
    }

    // Analyse-Modus: Nur Fragen und Teilaufgaben zurückgeben
    if (body.action === "analyze") {
      const analysis = await analyzeAndDecompose(body.description);
      return Response.json(analysis);
    }

    // Build-Modus: Workflow erstellen
    const result = await buildWorkflow(body.description, userId, body.agentId);

    return Response.json({
      workflowId: result.teamId,
      preview: result.blueprint,
      status: result.status,
      previewUrl: result.previewUrl,
      credentialsNeeded: result.credentialsNeeded,
      estimatedCreditsPerRun: result.blueprint.estimatedCreditsPerRun,
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
