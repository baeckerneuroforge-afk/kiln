import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { metaAgent } from "@/lib/meta-agent/meta-agent";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const body = await req.json();
    const { message, conversationHistory } = body as {
      message: string;
      conversationHistory?: Array<{
        role: "user" | "assistant";
        content: string;
      }>;
    };

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return Response.json(
        { error: "Nachricht darf nicht leer sein" },
        { status: 400 }
      );
    }

    const result = await metaAgent.chat(
      userId,
      message,
      conversationHistory || []
    );

    return Response.json(result);
  } catch (error) {
    console.error("[Meta-Agent Chat] Fehler:", error);
    return Response.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
