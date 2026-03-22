import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { OnboardingManager, type OnboardingAnswers } from "@/lib/onboarding/onboarding-manager";

// POST /api/onboarding/recommend — Template-Empfehlung basierend auf Antworten
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const answers = body as OnboardingAnswers;

  const templateId = OnboardingManager.getRecommendedTemplate(answers);
  const systemPrompt = OnboardingManager.generateSystemPrompt(answers);

  // Antworten speichern
  await OnboardingManager.saveAnswers(userId, answers);

  return NextResponse.json({
    recommendedTemplateId: templateId,
    suggestedSystemPrompt: systemPrompt,
  });
}
