import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api-auth";
import { WebhookV2Engine } from "@/lib/webhooks/webhook-v2-engine";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

async function resolveUserId(request: NextRequest): Promise<string> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer sk-kiln-")) {
    const authResult = await authenticateApiKey(authHeader);
    if (authResult.ok) return authResult.userId;
  }
  const { userId } = await auth();
  if (userId) return userId;
  throw new Error("Nicht authentifiziert");
}

// POST /api/v1/webhooks/[webhookId]/test — Test-Event senden
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ webhookId: string }> }
) {
  try {
    const userId = await resolveUserId(request);
    const { webhookId } = await params;

    // Prüfen ob Webhook dem User gehört
    const webhook = await prisma.webhookEndpoint.findFirst({
      where: { id: webhookId, userId },
    });

    if (!webhook) {
      return Response.json(
        { error: "Webhook nicht gefunden" },
        { status: 404, headers: corsHeaders }
      );
    }

    const result = await WebhookV2Engine.sendTestEvent(webhookId);

    return Response.json(result, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json(
      { error: message },
      { status: 500, headers: corsHeaders }
    );
  }
}
