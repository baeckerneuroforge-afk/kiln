import { auth } from "@clerk/nextjs/server";
import { getGoogleSheetsIntegrationForUser } from "@/lib/integrations/google-sheets";

// GET: Google Sheets Verbindungsstatus + Spreadsheet-Liste
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sheets = await getGoogleSheetsIntegrationForUser(userId);
    if (!sheets) {
      return Response.json({ connected: false, email: null, spreadsheets: [] });
    }

    const { config, integration } = sheets;

    let spreadsheets: { id: string; name: string }[] = [];
    try {
      spreadsheets = await integration.listSpreadsheets(10);
    } catch {
      // API-Fehler — trotzdem connected zurückgeben
    }

    return Response.json({
      connected: true,
      email: config.email || null,
      isActive: sheets.connection.isActive,
      lastSyncAt: sheets.connection.lastSyncAt,
      spreadsheets,
    });
  } catch (error) {
    console.error("Google Sheets status error:", error);
    return Response.json({ error: "Failed to load Google Sheets status" }, { status: 500 });
  }
}
