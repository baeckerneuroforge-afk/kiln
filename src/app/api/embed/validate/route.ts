import { NextRequest, NextResponse } from "next/server";
import {
  EmbedManager,
  type EmbedComponentType,
} from "@/lib/embeds/embed-manager";

/**
 * POST /api/embed/validate — Embed-Token validieren
 * Kein Clerk-Auth nötig — wird aus dem Embed-iframe aufgerufen
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, agentId, componentType } = body as {
      token: string;
      agentId?: string;
      componentType?: EmbedComponentType;
    };

    if (!token) {
      return NextResponse.json(
        { valid: false, error: "Kein Token angegeben" },
        {
          status: 400,
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    }

    const result = await EmbedManager.validateToken(
      token,
      agentId,
      componentType
    );

    return NextResponse.json(
      {
        valid: result.valid,
        agentId: result.agentId || null,
        allowedComponents: result.allowedComponents || null,
        error: result.error || null,
      },
      {
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  } catch (err) {
    console.error("[EmbedValidate] Fehler:", err);
    return NextResponse.json(
      { valid: false, error: "Validierungsfehler" },
      {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
