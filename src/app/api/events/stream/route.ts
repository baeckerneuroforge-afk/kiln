import { NextRequest } from "next/server";
import crypto from "crypto";
import { authenticateApiKey } from "@/lib/api-auth";
import { realtimeEvents } from "@/lib/webhooks/realtime-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/events/stream — Server-Sent Events Endpoint
 *
 * Query params:
 *   events=conversation.started,lead.captured  (oder "all")
 *
 * Auth:
 *   Authorization: Bearer sk-kiln-...
 */
export async function GET(request: NextRequest) {
  // Auth
  const auth = await authenticateApiKey(request.headers.get("authorization"));
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: 401 });
  }

  const eventsParam = request.nextUrl.searchParams.get("events") || "all";
  const subscribedEvents = eventsParam === "all" ? ["*"] : eventsParam.split(",").map((e) => e.trim());

  const subscriptionId = crypto.randomUUID();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      function send(event: string, data: unknown) {
        try {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Stream geschlossen
          realtimeEvents.unsubscribe(subscriptionId);
        }
      }

      // Initial connection event
      send("connected", { subscriptionId, events: subscribedEvents });

      // Subscribe
      realtimeEvents.subscribe(subscriptionId, auth.userId, subscribedEvents, send);
    },
    cancel() {
      realtimeEvents.unsubscribe(subscriptionId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
