/**
 * GET /api/v1/sandbox/[sessionId]/artifacts — Artefakte aus der Session auflisten
 * Extrahiert Artefakte aus der Action-History (Code-Outputs, Screenshots, etc.)
 */

import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import {
  authenticateApiKey,
  apiKeyAuthErrorResponse,
  apiKeyJson,
  type ApiKeyAuthSuccess,
} from "@/lib/api-auth";
import { SandboxAPIService } from "@/lib/sandbox-api/sandbox-api-service";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface ActionHistoryEntry {
  action: { type: string };
  result: {
    success: boolean;
    result?: unknown;
    screenshot?: string;
  };
  timestamp: string;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  let authResult: ApiKeyAuthSuccess | null = null;

  try {
    const { sessionId } = await params;

    const auth = await authenticateApiKey(request.headers.get("authorization"));
    if (!auth.ok) {
      return apiKeyAuthErrorResponse(auth, corsHeaders);
    }
    authResult = auth;
    waitUntil(authResult.touchLastUsed);

    const session = await SandboxAPIService.getSession(sessionId, authResult.userId);
    const history = (session.actionHistory || []) as ActionHistoryEntry[];

    // Artefakte aus der History extrahieren
    const artifacts: Array<{
      id: string;
      type: string;
      actionType: string;
      timestamp: string;
      data: unknown;
    }> = [];

    history.forEach((entry, index) => {
      // Screenshots
      if (entry.result?.screenshot) {
        artifacts.push({
          id: `artifact_${index}_screenshot`,
          type: "screenshot",
          actionType: entry.action.type,
          timestamp: entry.timestamp,
          data: {
            format: "base64_png",
            size: entry.result.screenshot.length,
            // Screenshot-Daten nicht direkt mitgeben um Response klein zu halten
            preview: entry.result.screenshot.slice(0, 100) + "...",
          },
        });
      }

      // Code-Execution-Outputs
      if (entry.action.type === "execute_code" && entry.result?.success) {
        const result = entry.result.result as {
          stdout?: string;
          stderr?: string;
          artifacts?: Array<{ path: string; mimeType: string; size: number }>;
        } | undefined;

        if (result?.stdout) {
          artifacts.push({
            id: `artifact_${index}_output`,
            type: "code_output",
            actionType: "execute_code",
            timestamp: entry.timestamp,
            data: {
              stdout: result.stdout,
              stderr: result.stderr || "",
            },
          });
        }

        // E2B-generierte Artefakte (z.B. Bilder aus matplotlib)
        if (result?.artifacts && Array.isArray(result.artifacts)) {
          result.artifacts.forEach((art, artIdx) => {
            artifacts.push({
              id: `artifact_${index}_file_${artIdx}`,
              type: "file",
              actionType: "execute_code",
              timestamp: entry.timestamp,
              data: {
                path: art.path,
                mimeType: art.mimeType,
                size: art.size,
              },
            });
          });
        }
      }

      // Seiteninhalte
      if (entry.action.type === "read_page" && entry.result?.success) {
        const result = entry.result.result as { content?: string; url?: string } | undefined;
        if (result?.content) {
          artifacts.push({
            id: `artifact_${index}_page`,
            type: "page_content",
            actionType: "read_page",
            timestamp: entry.timestamp,
            data: {
              url: result.url,
              contentLength: result.content.length,
              contentPreview: result.content.slice(0, 200),
            },
          });
        }
      }
    });

    return apiKeyJson(
      request,
      authResult,
      {
        sessionId,
        totalArtifacts: artifacts.length,
        artifacts,
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    const status = message.includes("nicht gefunden") ? 404 : message.includes("Kein Zugriff") ? 403 : 500;

    if (authResult) {
      return apiKeyJson(request, authResult, { error: message }, { status, headers: corsHeaders });
    }
    return NextResponse.json({ error: message }, { status, headers: corsHeaders });
  }
}
