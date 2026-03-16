import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getUserEmailOrPlaceholder } from "@/lib/clerk-user-email";

const ALLOWED_FIELDS = [
  "advancedMode",
  "onboardingCompleted",
  "emailNotifications",
];

// GET: User-Preferences laden
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { advancedMode: true, onboardingCompleted: true, emailNotifications: true },
    });

    return Response.json({
      advancedMode: user?.advancedMode ?? false,
      onboardingCompleted: user?.onboardingCompleted ?? false,
      emailNotifications: user?.emailNotifications ?? true,
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
    const sanitizedData = Object.fromEntries(
      Object.entries(body).filter(([key]) => ALLOWED_FIELDS.includes(key))
    );
    const { advancedMode, onboardingCompleted, emailNotifications } = sanitizedData;

    const updateData: Record<string, boolean> = {};
    if (typeof advancedMode === "boolean") updateData.advancedMode = advancedMode;
    if (typeof onboardingCompleted === "boolean") updateData.onboardingCompleted = onboardingCompleted;
    if (typeof emailNotifications === "boolean") updateData.emailNotifications = emailNotifications;

    if (Object.keys(updateData).length === 0) {
      return Response.json({ error: "No valid fields" }, { status: 400 });
    }

    const userEmail = await getUserEmailOrPlaceholder(userId);
    const updated = await prisma.user.upsert({
      where: { id: userId },
      update: updateData,
      create: { id: userId, email: userEmail, ...updateData },
    });

    return Response.json({
      advancedMode: updated.advancedMode,
      onboardingCompleted: updated.onboardingCompleted,
      emailNotifications: updated.emailNotifications,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
