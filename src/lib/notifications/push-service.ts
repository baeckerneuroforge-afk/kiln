import { prisma } from "@/lib/prisma";
import webpush from "web-push";

// VAPID Keys aus Umgebungsvariablen
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:noreply@kilnbase.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
}

/**
 * PushService — Web Push API Integration.
 * Verwaltet Push-Subscriptions und sendet Browser-Benachrichtigungen.
 */
export class PushService {

  /**
   * Registriert eine neue Push-Subscription.
   */
  static async subscribe(
    userId: string,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string,
  ) {
    return prisma.pushSubscription.upsert({
      where: {
        userId_endpoint: { userId, endpoint: subscription.endpoint },
      },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent,
      },
      update: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent,
      },
    });
  }

  /**
   * Entfernt eine Push-Subscription.
   */
  static async unsubscribe(userId: string, endpoint: string) {
    return prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
  }

  /**
   * Sendet eine Push-Notification an alle Geräte eines Users.
   */
  static async sendToUser(userId: string, payload: PushPayload) {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify({
              title: payload.title,
              body: payload.body,
              url: payload.url || "/dashboard",
              icon: payload.icon || "/icon-192.png",
              badge: payload.badge || "/badge-72.png",
            }),
          );
        } catch (err: unknown) {
          // 410 Gone = Subscription abgelaufen → entfernen
          if (err && typeof err === "object" && "statusCode" in err && (err as { statusCode: number }).statusCode === 410) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } });
          }
          throw err;
        }
      }),
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    return { sent, failed };
  }

  /**
   * Gibt den VAPID Public Key für das Frontend zurück.
   */
  static getPublicKey(): string {
    return VAPID_PUBLIC_KEY;
  }
}
