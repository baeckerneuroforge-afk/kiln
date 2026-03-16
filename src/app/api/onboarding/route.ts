import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getUserEmailOrPlaceholder } from "@/lib/clerk-user-email";

// POST: Onboarding-Daten speichern (Company Name)
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { companyName } = await request.json();

    // User upsert (falls noch nicht in DB)
    const userEmail = await getUserEmailOrPlaceholder(userId);
    await prisma.user.upsert({
      where: { id: userId },
      update: { companyName: companyName || null },
      create: { id: userId, email: userEmail, companyName: companyName || null },
    });

    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
