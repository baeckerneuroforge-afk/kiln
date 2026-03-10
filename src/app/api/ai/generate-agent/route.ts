import { NextRequest } from "next/server";
import { getClaudeClient, AGENT_GENERATION_SYSTEM_PROMPT } from "@/lib/ai";

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json(
        { error: "Nachrichten sind erforderlich." },
        { status: 400 }
      );
    }

    const client = getClaudeClient();

    // Streaming Response
    const stream = await client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: AGENT_GENERATION_SYSTEM_PROMPT,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    // Stream als ReadableStream zurückgeben
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const chunk = `data: ${JSON.stringify({ text: event.delta.text })}\n\n`;
              controller.enqueue(encoder.encode(chunk));
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : "Stream-Fehler";
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: errorMessage })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Interner Server-Fehler";
    return Response.json({ error: message }, { status: 500 });
  }
}
