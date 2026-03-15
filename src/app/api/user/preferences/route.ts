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
      select: { advancedMode: true, onboardingCompleted: true },
    });

    return Response.json({
      advancedMode: user?.advancedMode ?? false,
      onboardingCompleted: user?.onboardingCompleted ?? false,
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
    const { advancedMode, onboardingCompleted } = body;

    const updateData: Record<string, boolean> = {};
    if (typeof advancedMode === "boolean") updateData.advancedMode = advancedMode;
    if (typeof onboardingCompleted === "boolean") updateData.onboardingCompleted = onboardingCompleted;

    if (Object.keys(updateData).length === 0) {
      return Response.json({ error: "No valid fields" }, { status: 400 });
    }

    const updated = await prisma.user.upsert({
      where: { id: userId },
      update: updateData,
      create: { id: userId, email: `${userId}@clerk.temp`, ...updateData },
    });

    return Response.json({
      advancedMode: updated.advancedMode,
      onboardingCompleted: updated.onboardingCompleted,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
