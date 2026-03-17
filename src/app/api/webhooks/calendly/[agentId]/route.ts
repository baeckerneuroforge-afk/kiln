import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import {
  CALENDLY_CHANNEL_TYPE,
  parseCalendlyConfig,
  serializeCalendlyConfig,
} from "@/lib/integrations/calendly";

export const dynamic = "force-dynamic";

function extractBookingDetails(body: Record<string, unknown>) {
  const payload =
    typeof body.payload === "object" && body.payload !== null
      ? (body.payload as Record<string, unknown>)
      : {};
  const invitee =
    typeof payload.invitee === "object" && payload.invitee !== null
      ? (payload.invitee as Record<string, unknown>)
      : payload;
  const scheduledEvent =
    typeof payload.scheduled_event === "object" && payload.scheduled_event !== null
      ? (payload.scheduled_event as Record<string, unknown>)
      : {};
  const eventType =
    typeof payload.event_type === "object" && payload.event_type !== null
      ? (payload.event_type as Record<string, unknown>)
      : {};
  const answers = Array.isArray(payload.questions_and_answers)
    ? payload.questions_and_answers
        .map((entry) => {
          if (typeof entry !== "object" || entry === null) return null;
          const value = entry as Record<string, unknown>;
          const question =
            typeof value.question === "string" ? value.question.trim() : "";
          const answer =
            typeof value.answer === "string" ? value.answer.trim() : "";
          if (!question || !answer) return null;
          return `${question}: ${answer}`;
        })
        .filter((entry): entry is string => Boolean(entry))
    : [];

  return {
    event: typeof body.event === "string" ? body.event : "",
    email:
      typeof invitee.email === "string"
        ? invitee.email
        : typeof payload.email === "string"
          ? payload.email
          : null,
    name:
      typeof invitee.name === "string"
        ? invitee.name
        : typeof payload.name === "string"
          ? payload.name
          : null,
    eventName:
      typeof scheduledEvent.name === "string"
        ? scheduledEvent.name
        : typeof eventType.name === "string"
          ? eventType.name
          : "Calendly booking",
    startTime:
      typeof scheduledEvent.start_time === "string"
        ? scheduledEvent.start_time
        : typeof payload.start_time === "string"
          ? payload.start_time
          : null,
    answers,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params;
    const channel = await prisma.agentChannel.findUnique({
      where: { agentId_type: { agentId, type: CALENDLY_CHANNEL_TYPE as never } },
    });

    if (!channel || !channel.isActive) {
      return Response.json({ ok: true });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return Response.json({ ok: true });
    }

    const config = parseCalendlyConfig(channel.config);
    const details = extractBookingDetails(body);
    const eventTimestamp = new Date().toISOString();

    waitUntil(
      prisma.agentChannel
        .update({
          where: { id: channel.id },
          data: {
            config: serializeCalendlyConfig({
              ...config,
              lastEventAt: eventTimestamp,
            }),
          },
        })
        .catch((error) => {
          console.error("Calendly channel status update failed:", error);
        })
    );

    if (details.event === "invitee.created" && details.email) {
      const contextParts = [
        `Booked via Calendly: ${details.eventName}`,
        details.startTime ? `Start: ${details.startTime}` : null,
        details.answers.length > 0 ? `Answers: ${details.answers.join(" | ")}` : null,
      ].filter(Boolean);

      waitUntil(
        prisma.lead
          .create({
            data: {
              agentId,
              email: details.email,
              name: details.name,
              context: contextParts.join(" • "),
              score: null,
            },
          })
          .catch((error) => {
            console.error("Calendly lead logging failed:", error);
          })
      );
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Calendly webhook failed:", error);
    return Response.json({ ok: true });
  }
}
