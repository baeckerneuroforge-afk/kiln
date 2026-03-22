import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { PushService } from "@/lib/notifications/push-service";

// POST /api/notifications/push — Push-Subscription registrieren
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { subscription, userAgent } = body;

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  await PushService.subscribe(userId, subscription, userAgent);
  return NextResponse.json({ success: true });
}

// DELETE /api/notifications/push — Push-Subscription entfernen
export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { endpoint } = body;

  if (!endpoint) {
    return NextResponse.json({ error: "endpoint erforderlich" }, { status: 400 });
  }

  await PushService.unsubscribe(userId, endpoint);
  return NextResponse.json({ success: true });
}

// GET /api/notifications/push — VAPID Public Key
export async function GET() {
  return NextResponse.json({ publicKey: PushService.getPublicKey() });
}
