import { auth } from "@clerk/nextjs/server";
import { getGmailIntegrationForUser } from "@/lib/integrations/gmail";

// GET: Gmail-Verbindungsstatus + letzte Nachrichten
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const gmail = await getGmailIntegrationForUser(userId);
    if (!gmail) {
      return Response.json({ connected: false, email: null, recentMessages: [] });
    }

    const { config, integration } = gmail;

    // Letzte 5 Nachrichten laden
    let recentMessages: { id: string; subject: string; from: string; date: string; snippet: string }[] = [];
    try {
      const messages = await integration.getInboxMessages("in:inbox", 5);
      recentMessages = messages.map((m) => ({
        id: m.id,
        subject: m.subject,
        from: m.from,
        date: m.date,
        snippet: m.snippet,
      }));
    } catch {
      // API-Fehler — trotzdem connected zurückgeben
    }

    return Response.json({
      connected: true,
      email: config.email || null,
      isActive: gmail.connection.isActive,
      lastSyncAt: gmail.connection.lastSyncAt,
      recentMessages,
    });
  } catch (error) {
    console.error("Gmail status error:", error);
    return Response.json({ error: "Failed to load Gmail status" }, { status: 500 });
  }
}
