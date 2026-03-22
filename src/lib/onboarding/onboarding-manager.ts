import { prisma } from "@/lib/prisma";

export type OnboardingStep =
  | "welcome"
  | "industry"
  | "first_goal"
  | "create_agent"
  | "test_agent"
  | "customize"
  | "deploy"
  | "celebrate";

export interface OnboardingAnswers {
  purpose?: string;    // "chatbot" | "automate" | "monitor" | "agency"
  industry?: string;   // "ecommerce" | "agency" | "consulting" | "trades" | "saas" | "real_estate" | "recruiting" | "other"
  firstGoal?: string;  // "answer_questions" | "research_competitors" | "monitor_prices" | "qualify_leads" | "generate_reports" | "custom"
  customGoal?: string;
}

// Template-Empfehlungen basierend auf Antworten
const TEMPLATE_MAP: Record<string, Record<string, string>> = {
  answer_questions: {
    ecommerce: "ecommerce-support",
    real_estate: "real-estate-agent",
    saas: "saas-onboarding",
    consulting: "consulting-qualifier",
    trades: "handwerk-assistant",
    recruiting: "recruiting-screener",
    _default: "customer-support",
  },
  research_competitors: {
    _default: "competitor-researcher",
  },
  monitor_prices: {
    _default: "price-monitor",
  },
  qualify_leads: {
    _default: "lead-qualifier",
  },
  generate_reports: {
    _default: "report-generator",
  },
};

/**
 * OnboardingManager — Guided Onboarding Flow.
 * Verwaltet den Onboarding-Zustand und gibt Template-Empfehlungen.
 */
export class OnboardingManager {

  /**
   * Lädt den aktuellen Onboarding-Zustand.
   */
  static async getState(userId: string) {
    const state = await prisma.onboardingState.findUnique({
      where: { userId },
    });

    if (!state) {
      return {
        completedSteps: [] as string[],
        answers: {} as OnboardingAnswers,
        recommendedTemplateId: null,
        completedAt: null,
      };
    }

    return {
      completedSteps: (state.completedSteps as string[]) || [],
      answers: (state.answers as OnboardingAnswers) || {},
      recommendedTemplateId: state.recommendedTemplateId,
      completedAt: state.completedAt,
    };
  }

  /**
   * Markiert einen Schritt als abgeschlossen.
   */
  static async completeStep(userId: string, step: OnboardingStep) {
    const existing = await prisma.onboardingState.findUnique({
      where: { userId },
    });

    const completedSteps = existing
      ? [...new Set([...(existing.completedSteps as string[]), step])]
      : [step];

    const isComplete = step === "celebrate" || step === "deploy";

    await prisma.onboardingState.upsert({
      where: { userId },
      create: {
        userId,
        completedSteps,
        completedAt: isComplete ? new Date() : null,
      },
      update: {
        completedSteps,
        completedAt: isComplete ? new Date() : undefined,
      },
    });

    // Auch in der User-Tabelle markieren wenn fertig
    if (isComplete) {
      await prisma.user.update({
        where: { id: userId },
        data: { onboardingCompleted: true },
      });
    }
  }

  /**
   * Speichert Onboarding-Antworten und generiert Template-Empfehlung.
   */
  static async saveAnswers(userId: string, answers: OnboardingAnswers) {
    const templateId = this.getRecommendedTemplate(answers);

    await prisma.onboardingState.upsert({
      where: { userId },
      create: {
        userId,
        completedSteps: [],
        answers: answers as unknown as import("@prisma/client").Prisma.InputJsonValue,
        recommendedTemplateId: templateId,
      },
      update: {
        answers: answers as unknown as import("@prisma/client").Prisma.InputJsonValue,
        recommendedTemplateId: templateId,
      },
    });

    return templateId;
  }

  /**
   * Ermittelt das beste Template basierend auf den Antworten.
   */
  static getRecommendedTemplate(answers: OnboardingAnswers): string | null {
    const goal = answers.firstGoal;
    if (!goal) return null;

    const goalTemplates = TEMPLATE_MAP[goal];
    if (!goalTemplates) return null;

    const industry = answers.industry;
    if (industry && goalTemplates[industry]) {
      return goalTemplates[industry];
    }

    return goalTemplates._default || null;
  }

  /**
   * Generiert eine System-Prompt basierend auf den Antworten.
   */
  static generateSystemPrompt(answers: OnboardingAnswers): string {
    const parts: string[] = [];

    const industryLabels: Record<string, string> = {
      ecommerce: "E-Commerce",
      agency: "Digital Agency",
      consulting: "Consulting",
      trades: "Handwerk / lokales Gewerbe",
      saas: "SaaS / Tech",
      real_estate: "Immobilien",
      recruiting: "Recruiting / HR",
      other: "Allgemein",
    };

    const goalLabels: Record<string, string> = {
      answer_questions: "Kundenfragen beantworten und Support leisten",
      research_competitors: "Wettbewerber recherchieren und analysieren",
      monitor_prices: "Preise überwachen und bei Änderungen benachrichtigen",
      qualify_leads: "Leads qualifizieren und bewerten",
      generate_reports: "Berichte und Zusammenfassungen generieren",
      custom: answers.customGoal || "Allgemeine Aufgaben erledigen",
    };

    parts.push("Du bist ein professioneller AI-Assistent.");

    if (answers.industry) {
      const label = industryLabels[answers.industry] || answers.industry;
      parts.push(`Du spezialisierst dich auf den Bereich ${label}.`);
    }

    if (answers.firstGoal) {
      const label = goalLabels[answers.firstGoal] || answers.firstGoal;
      parts.push(`Deine Hauptaufgabe ist: ${label}.`);
    }

    parts.push("Sei hilfreich, professionell und präzise. Antworte in der Sprache des Nutzers.");

    return parts.join(" ");
  }
}
