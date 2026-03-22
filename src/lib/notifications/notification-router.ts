import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/integrations/whatsapp";
import { sendSlackMessage } from "@/lib/integrations/slack";

export type NotificationEventType =
  | "new_lead"
  | "handoff"
  | "approval_request"
  | "workflow_complete"
  | "error"
  | "weekly_summary";

export interface NotificationPayload {
  userId: string;
  agentId?: string;
  eventType: NotificationEventType;
  title: string;
  body: string;
  url?: string; // Link zur relevanten Seite
  data?: Record<string, unknown>;
}

interface ChannelConfig {
  email: boolean;
  slack: boolean;
  telegram: boolean;
  whatsapp: boolean;
  browserPush: boolean;
  slackChannel?: string;
  telegramChatId?: string;
  whatsappNumber?: string;
}

/**
 * NotificationRouter — Multi-Channel Notification System.
 * Routet Benachrichtigungen an die bevorzugten Kanäle basierend auf
 * User-Präferenzen (global + agent-spezifisch).
 */
export class NotificationRouter {

  /**
   * Sendet eine Notification an alle konfigurierten Kanäle.
   */
  static async send(payload: NotificationPayload): Promise<{ sent: string[]; failed: string[] }> {
    const config = await this.getChannelConfig(payload.userId, payload.agentId, payload.eventType);
    const sent: string[] = [];
    const failed: string[] = [];

    // E-Mail
    if (config.email) {
      try {
        await this.sendEmail(payload);
        sent.push("email");
      } catch {
        failed.push("email");
      }
    }

    // Slack
    if (config.slack && config.slackChannel) {
      try {
        await this.sendSlack(payload, config.slackChannel);
        sent.push("slack");
      } catch {
        failed.push("slack");
      }
    }

    // Telegram
    if (config.telegram && config.telegramChatId) {
      try {
        await this.sendTelegram(payload, config.telegramChatId);
        sent.push("telegram");
      } catch {
        failed.push("telegram");
      }
    }

    // WhatsApp
    if (config.whatsapp && config.whatsappNumber) {
      try {
        await this.sendWhatsApp(payload, config.whatsappNumber);
        sent.push("whatsapp");
      } catch {
        failed.push("whatsapp");
      }
    }

    // Browser Push
    if (config.browserPush) {
      try {
        await this.sendPush(payload);
        sent.push("browserPush");
      } catch {
        failed.push("browserPush");
      }
    }

    return { sent, failed };
  }

  /**
   * Ermittelt die Kanal-Konfiguration für einen Event-Typ.
   * Priorisierung: Agent-spezifisch > Global > Default (nur E-Mail).
   */
  private static async getChannelConfig(
    userId: string,
    agentId: string | undefined,
    eventType: NotificationEventType,
  ): Promise<ChannelConfig> {
    // Zuerst agent-spezifische Präferenz suchen
    if (agentId) {
      const agentPref = await prisma.notificationPreference.findUnique({
        where: { userId_agentId_eventType: { userId, agentId, eventType } },
      });
      if (agentPref) return this.prefToConfig(agentPref);
    }

    // Dann globale Präferenz (agentId = null)
    const globalPref = await prisma.notificationPreference.findFirst({
      where: { userId, agentId: null, eventType },
    });
    if (globalPref) return this.prefToConfig(globalPref);

    // Default: nur E-Mail
    return {
      email: true,
      slack: false,
      telegram: false,
      whatsapp: false,
      browserPush: false,
    };
  }

  private static prefToConfig(pref: {
    email: boolean;
    slack: boolean;
    telegram: boolean;
    whatsapp: boolean;
    browserPush: boolean;
    slackChannel: string | null;
    telegramChatId: string | null;
    whatsappNumber: string | null;
  }): ChannelConfig {
    return {
      email: pref.email,
      slack: pref.slack,
      telegram: pref.telegram,
      whatsapp: pref.whatsapp,
      browserPush: pref.browserPush,
      slackChannel: pref.slackChannel ?? undefined,
      telegramChatId: pref.telegramChatId ?? undefined,
      whatsappNumber: pref.whatsappNumber ?? undefined,
    };
  }

  // ── Kanal-Implementierungen ──────────────────────────────────

  private static async sendEmail(payload: NotificationPayload) {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return;

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { email: true, emailNotifications: true },
    });
    if (!user || !user.emailNotifications) return;
    if (user.email.endsWith("@clerk.temp")) return;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
        <div style="background: linear-gradient(135deg, #F97316, #DC2626); padding: 2px; border-radius: 12px;">
          <div style="background: #0C0A09; border-radius: 11px; padding: 24px;">
            <h2 style="color: #F97316; margin: 0 0 8px;">${this.escapeHtml(payload.title)}</h2>
            <p style="color: #A8A29E; margin: 0 0 16px; font-size: 14px; line-height: 1.5;">${this.escapeHtml(payload.body)}</p>
            ${payload.url ? `<a href="${payload.url}" style="display: inline-block; background: #F97316; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Anzeigen</a>` : ""}
          </div>
        </div>
        <p style="color: #78716C; font-size: 11px; text-align: center; margin-top: 16px;">KILN AI Platform · Hephaistos Systems</p>
      </div>
    `;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "KILN <noreply@kiln.hephaistos-systems.de>",
        to: [user.email],
        subject: payload.title,
        html,
      }),
    });
  }

  private static async sendSlack(payload: NotificationPayload, channel: string) {
    // Integration-Daten aus DB laden
    const integration = await prisma.agentIntegration.findFirst({
      where: {
        agent: { userId: payload.userId },
        integration: { provider: "SLACK" },
        enabled: true,
      },
      select: { config: true },
    });
    if (!integration) return;

    const config = integration.config as Record<string, string> | null;
    const accessToken = config?.accessToken;
    if (!accessToken) return;

    const text = `*${payload.title}*\n${payload.body}${payload.url ? `\n<${payload.url}|Details>` : ""}`;
    await sendSlackMessage(accessToken, channel, text);
  }

  private static async sendTelegram(payload: NotificationPayload, chatId: string) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return;

    const text = `*${this.escapeTelegram(payload.title)}*\n${this.escapeTelegram(payload.body)}${payload.url ? `\n[Details](${payload.url})` : ""}`;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "MarkdownV2",
        disable_web_page_preview: true,
      }),
    });
  }

  private static async sendWhatsApp(payload: NotificationPayload, number: string) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) return;

    const text = `*${payload.title}*\n${payload.body}${payload.url ? `\n${payload.url}` : ""}`;
    await sendWhatsAppMessage(phoneNumberId, number, text, accessToken);
  }

  private static async sendPush(payload: NotificationPayload) {
    const { PushService } = await import("@/lib/notifications/push-service");
    await PushService.sendToUser(payload.userId, {
      title: payload.title,
      body: payload.body,
      url: payload.url,
    });
  }

  // ── Helpers ──────────────────────────────────────────────────

  private static escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  private static escapeTelegram(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
  }
}
