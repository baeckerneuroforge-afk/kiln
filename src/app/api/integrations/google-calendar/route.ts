import { auth } from "@clerk/nextjs/server";
import {
  getGoogleCalendarIntegrationForUser,
  type GoogleCalendarConnectionConfig,
} from "@/lib/integrations/google-calendar";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const calendarConnection = await getGoogleCalendarIntegrationForUser(userId);
    if (!calendarConnection) {
      return Response.json({
        connected: false,
        calendars: [],
        upcomingAppointments: [],
      });
    }

    const { connection, config, integration, saveConfig } = calendarConnection;
    const calendars = await integration.listCalendars();
    const selectedCalendar =
      calendars.find((calendar) => calendar.id === config.selectedCalendarId) ||
      calendars.find((calendar) => calendar.primary) ||
      calendars[0] ||
      null;

    if (selectedCalendar && selectedCalendar.id !== config.selectedCalendarId) {
      const nextConfig: GoogleCalendarConnectionConfig = {
        ...config,
        selectedCalendarId: selectedCalendar.id,
        selectedCalendarName: selectedCalendar.summary,
      };
      await saveConfig(nextConfig);
    }

    const upcomingAppointments = selectedCalendar
      ? await integration.listUpcomingEvents(selectedCalendar.id, 5)
      : [];

    return Response.json({
      connected: true,
      name: connection.name,
      isActive: connection.isActive,
      lastSyncAt: connection.lastSyncAt,
      selectedCalendarId: selectedCalendar?.id || null,
      selectedCalendarName: selectedCalendar?.summary || null,
      calendars,
      upcomingAppointments: upcomingAppointments.map((event) => ({
        id: event.id,
        summary: event.summary,
        htmlLink: event.htmlLink,
        start: event.start.dateTime || event.start.date || null,
        end: event.end.dateTime || event.end.date || null,
        status: event.status || null,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Google Calendar";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const calendarId = typeof body.calendarId === "string" ? body.calendarId : "";
    if (!calendarId) {
      return Response.json({ error: "calendarId is required" }, { status: 400 });
    }

    const calendarConnection = await getGoogleCalendarIntegrationForUser(userId);
    if (!calendarConnection) {
      return Response.json({ error: "Google Calendar is not connected" }, { status: 404 });
    }

    const { config, integration, saveConfig } = calendarConnection;
    const calendars = await integration.listCalendars();
    const selectedCalendar = calendars.find((calendar) => calendar.id === calendarId);
    if (!selectedCalendar) {
      return Response.json({ error: "Calendar not found" }, { status: 404 });
    }

    const nextConfig: GoogleCalendarConnectionConfig = {
      ...config,
      selectedCalendarId: selectedCalendar.id,
      selectedCalendarName: selectedCalendar.summary,
    };

    await saveConfig(nextConfig);

    return Response.json({
      selectedCalendarId: selectedCalendar.id,
      selectedCalendarName: selectedCalendar.summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update Google Calendar";
    return Response.json({ error: message }, { status: 500 });
  }
}
