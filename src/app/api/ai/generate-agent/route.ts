import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getClaudeClient, AGENT_GENERATION_SYSTEM_PROMPT } from "@/lib/ai";
import { checkCredits, deductCredits } from "@/lib/credits";
import { checkRateLimit } from "@/lib/rate-limit";

const MODEL = "claude-sonnet-4-6";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit: per-user for agent generation
    const rl = checkRateLimit(`generate-agent:${userId}`);
    if (!rl.allowed) {
      return Response.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json(
        { error: "Messages are required." },
        { status: 400 }
      );
    }

    // Pre-flight credit check — admin bypass + BYOK handled inside checkCredits
    const creditCheck = await checkCredits(userId, MODEL, false);
    if (!creditCheck.allowed) {
      return Response.json(
        {
          error: creditCheck.message,
          creditExhausted: true,
          balance: creditCheck.balance,
          cost: creditCheck.cost,
        },
        { status: 402 }
      );
    }

    const client = getClaudeClient();

    // Streaming response
    const stream = await client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      system: AGENT_GENERATION_SYSTEM_PROMPT,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    // Deduct credits (fire-and-forget)
    deductCredits(userId, MODEL, "CHAT").catch((err) => {
      console.error("Agent generation credit deduction failed:", err);
    });

    // Return stream as ReadableStream
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
            err instanceof Error ? err.message : "Stream error";
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
      err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
