import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/notifications — Notification-Präferenzen laden
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const preferences = await prisma.notificationPreference.findMany({
    where: { userId },
    orderBy: [{ agentId: "asc" }, { eventType: "asc" }],
  });

  return NextResponse.json({ preferences });
}

// POST /api/notifications — Präferenz erstellen/aktualisieren
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { agentId, eventType, email, slack, telegram, whatsapp, browserPush, slackChannel, telegramChatId, whatsappNumber } = body;

  if (!eventType) {
    return NextResponse.json({ error: "eventType erforderlich" }, { status: 400 });
  }

  const pref = await prisma.notificationPreference.upsert({
    where: {
      userId_agentId_eventType: {
        userId,
        agentId: agentId || null,
        eventType,
      },
    },
    create: {
      userId,
      agentId: agentId || null,
      eventType,
      email: email ?? true,
      slack: slack ?? false,
      telegram: telegram ?? false,
      whatsapp: whatsapp ?? false,
      browserPush: browserPush ?? false,
      slackChannel: slackChannel || null,
      telegramChatId: telegramChatId || null,
      whatsappNumber: whatsappNumber || null,
    },
    update: {
      email: email ?? undefined,
      slack: slack ?? undefined,
      telegram: telegram ?? undefined,
      whatsapp: whatsapp ?? undefined,
      browserPush: browserPush ?? undefined,
      slackChannel: slackChannel ?? undefined,
      telegramChatId: telegramChatId ?? undefined,
      whatsappNumber: whatsappNumber ?? undefined,
    },
  });

  return NextResponse.json({ preference: pref });
}
