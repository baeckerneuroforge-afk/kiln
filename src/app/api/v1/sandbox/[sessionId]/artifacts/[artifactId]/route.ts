/**
 * GET /api/v1/sandbox/[sessionId]/artifacts/[artifactId] — Artefakt herunterladen
 */

import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import {
  authenticateApiKey,
  apiKeyAuthErrorResponse,
  apiKeyJson,
  type ApiKeyAuthSuccess,
} from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; artifactId: string }> }
) {
  let authResult: ApiKeyAuthSuccess | null = null;

  try {
    const { sessionId, artifactId } = await params;

    const auth = await authenticateApiKey(request.headers.get("authorization"));
    if (!auth.ok) return apiKeyAuthErrorResponse(auth, corsHeaders);
    authResult = auth;
    waitUntil(authResult.touchLastUsed);

    const session = await prisma.sandboxAPISession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return apiKeyJson(request, authResult, { error: "Session nicht gefunden" }, { status: 404, headers: corsHeaders });
    }

    if (session.userId !== authResult.userId) {
      return apiKeyJson(request, authResult, { error: "Kein Zugriff" }, { status: 403, headers: corsHeaders });
    }

    const artifactIds = (session.artifactIds || []) as string[];
    if (!artifactIds.includes(artifactId)) {
      return apiKeyJson(request, authResult, { error: "Artefakt nicht gefunden" }, { status: 404, headers: corsHeaders });
    }

    // Artefakt-Download — Placeholder, in Produktion via Supabase Storage
    return apiKeyJson(request, authResult, {
      id: artifactId,
      sessionId: sessionId,
      message: "Artefakt-Download wird ueber Supabase Storage bereitgestellt",
    }, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    if (authResult) {
      return apiKeyJson(request, authResult, { error: message }, { status: 500, headers: corsHeaders });
    }
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
