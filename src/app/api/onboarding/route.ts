import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getUserEmailOrPlaceholder } from "@/lib/clerk-user-email";
import { OnboardingManager, type OnboardingStep } from "@/lib/onboarding/onboarding-manager";

// GET /api/onboarding — Aktuellen Onboarding-Zustand laden
export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const state = await OnboardingManager.getState(userId);
  return Response.json(state);
}

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

// PUT /api/onboarding — Schritt abschließen + Antworten speichern
export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { step, answers } = body;

  if (step) {
    await OnboardingManager.completeStep(userId, step as OnboardingStep);
  }

  if (answers) {
    const templateId = await OnboardingManager.saveAnswers(userId, answers);
    return Response.json({ success: true, recommendedTemplateId: templateId });
  }

  return Response.json({ success: true });
}
