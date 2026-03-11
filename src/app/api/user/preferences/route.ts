import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET: User-Preferences laden
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { advancedMode: true },
    });

    return Response.json({
      advancedMode: user?.advancedMode ?? false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// PATCH: User-Preferences aktualisieren
export async function PATCH(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { advancedMode } = body;

    if (typeof advancedMode !== "boolean") {
      return Response.json({ error: "Invalid value" }, { status: 400 });
    }

    await prisma.user.upsert({
      where: { id: userId },
      update: { advancedMode },
      create: { id: userId, email: `${userId}@clerk.temp`, advancedMode },
    });

    return Response.json({ advancedMode });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
