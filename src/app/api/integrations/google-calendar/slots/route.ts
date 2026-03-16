import { auth } from "@clerk/nextjs/server";
import { getGoogleCalendarIntegrationForUser } from "@/lib/integrations/google-calendar";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const calendarConnection = await getGoogleCalendarIntegrationForUser(userId);
    if (!calendarConnection) {
      return Response.json({ error: "Google Calendar is not connected" }, { status: 404 });
    }

    const url = new URL(request.url);
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    const calendarId = url.searchParams.get("calendarId") || calendarConnection.config.selectedCalendarId;

    if (!start || !end) {
      return Response.json({ error: "start and end are required" }, { status: 400 });
    }

    if (!calendarId) {
      return Response.json({ error: "No calendar selected" }, { status: 400 });
    }

    const timezone = url.searchParams.get("timezone") || "UTC";
    const slots = await calendarConnection.integration.getAvailableSlots(calendarId, {
      start,
      end,
      timezone,
    });

    return Response.json({ calendarId, slots });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load slots";
    return Response.json({ error: message }, { status: 500 });
  }
}
