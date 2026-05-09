import type { IndustryTemplateDefinition } from "@/lib/onboarding/types";
import { kfzDepartmentTemplates } from "./department-templates";
import { kfzKnowledgeBaseSeeds } from "./knowledge-base-seeds";
import { getCurrentSeason, shouldTriggerSeasonCampaign } from "./season-logic";
import { kfzVoiceScripts } from "./voice-scripts";
import { kfzWhatsAppSubmissionGuide, kfzWhatsAppTemplates } from "./whatsapp-templates";

export { kfzDepartmentTemplates } from "./department-templates";
export { kfzKnowledgeBaseSeeds } from "./knowledge-base-seeds";
export {
  getCurrentSeason,
  seasonCampaignKey,
  shouldSendSeasonCampaign,
  shouldTriggerSeasonCampaign,
} from "./season-logic";
export { calculateTuevReminder, selectDueTuevReminders } from "./tuev-logic";
export { kfzVoiceScripts } from "./voice-scripts";
export { kfzWhatsAppSubmissionGuide, kfzWhatsAppTemplates } from "./whatsapp-templates";
export type { KfzKnowledgeBaseSeed } from "./knowledge-base-seeds";
export type { KfzSeason, SeasonCampaignLock } from "./season-logic";
export type { TuevCustomerRow, TuevReminderResult, TuevReminderStage } from "./tuev-logic";

export const kfzIndustryTemplate: IndustryTemplateDefinition = {
  industry: "kfz",
  displayName: "KFZ",
  displayNameDe: "KFZ-Werkstatt",
  description: "Production-ready auto repair pack for workshop appointments, estimates, HU reminders, and tire-season campaigns.",
  descriptionDe:
    "Produktionsreifes KFZ-Pack für Werkstatt-Termine, Kostenvoranschläge, TÜV/HU-Erinnerungen und Reifenwechsel-Saisonkampagnen.",
  recommendedChannels: ["email", "whatsapp", "webchat", "voice"],
  sortOrder: 20,
  iconName: "Car",
  knowledgeBaseSeeds: kfzKnowledgeBaseSeeds.map((seed) => ({
    title: `${seed.category}: ${seed.title}`,
    content: seed.content,
  })),
  departmentTemplates: kfzDepartmentTemplates,
  metadata: {
    packVersion: "1.0",
    setupTimeMinutes: 30,
    estimatedManualSetupHours: 7,
    whatsappTemplates: kfzWhatsAppTemplates,
    voiceScripts: kfzVoiceScripts,
    metaSubmissionGuide: kfzWhatsAppSubmissionGuide,
    notes: [
      "German content uses direct workshop language and avoids binding price promises.",
      "Breakdown voice flow falls back to ADAC 22 22 22 when no workshop hotline is configured.",
      "Workshop software integrations are mocked through CSV import in this sprint.",
    ],
    seasonLogic: {
      currentSeason: getCurrentSeason(new Date()).toString(),
      triggerWindows: ["April 1-15", "October 1-15"],
      shouldTriggerToday: shouldTriggerSeasonCampaign(new Date()),
    },
  },
};
