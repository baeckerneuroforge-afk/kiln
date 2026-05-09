import type { IndustryTemplateDefinition } from "@/lib/onboarding/types";
import { shkDepartmentTemplates } from "./department-templates";
import { shkKnowledgeBaseSeeds } from "./knowledge-base-seeds";
import {
  classifyShkEmergency,
  getCurrentShkSeason,
  shouldTriggerShkSeasonCampaign,
} from "./seasonal-logic";
import { shkVoiceScripts } from "./voice-scripts";
import { shkWhatsAppSubmissionGuide, shkWhatsAppTemplates } from "./whatsapp-templates";

export { shkDepartmentTemplates } from "./department-templates";
export { shkKnowledgeBaseSeeds, shkKnowledgeBaseSeedCount } from "./knowledge-base-seeds";
export {
  calculateShkMaintenanceReminder,
  selectDueShkMaintenanceReminders,
} from "./maintenance-logic";
export {
  classifyShkEmergency,
  getCurrentShkSeason,
  shkSeasonCampaignKey,
  shouldSendShkSeasonCampaign,
  shouldTriggerShkSeasonCampaign,
} from "./seasonal-logic";
export { shkVoiceScripts } from "./voice-scripts";
export { shkWhatsAppSubmissionGuide, shkWhatsAppTemplates } from "./whatsapp-templates";
export type { ShkKnowledgeBaseSeed } from "./knowledge-base-seeds";
export type {
  ShkMaintenanceCustomerRow,
  ShkMaintenanceReminderResult,
  ShkMaintenanceStage,
  ShkSystemType,
} from "./maintenance-logic";
export type {
  ShkEmergencyClassification,
  ShkSeason,
  ShkSeasonCampaignLock,
} from "./seasonal-logic";

export const shkIndustryTemplate: IndustryTemplateDefinition = {
  industry: "shk",
  displayName: "SHK",
  displayNameDe: "Sanitär/Heizung/Klima",
  description:
    "Production-ready SHK pack for emergency triage, appointment intake, maintenance reminders, cost estimates, and BAFA/KfW funding info.",
  descriptionDe:
    "Produktionsreifes SHK-Pack für Notdienst-Triage, Termin-Anfragen, Wartungs-Erinnerungen, Kostenvoranschläge und BAFA/KfW-Förderinfos.",
  recommendedChannels: ["email", "whatsapp", "webchat", "voice"],
  sortOrder: 30,
  iconName: "Wrench",
  knowledgeBaseSeeds: shkKnowledgeBaseSeeds.map((seed) => ({
    title: `${seed.category}: ${seed.title}`,
    content: seed.content,
  })),
  departmentTemplates: shkDepartmentTemplates,
  metadata: {
    packVersion: "1.0",
    setupTimeMinutes: 30,
    estimatedManualSetupHours: 8,
    whatsappTemplates: shkWhatsAppTemplates,
    voiceScripts: shkVoiceScripts,
    metaSubmissionGuide: shkWhatsAppSubmissionGuide,
    notes: [
      "German content uses direct handwerker-style language and avoids binding price promises.",
      "Gas-Geruch flow always references 0800 280 33 22 (Bundesnetzagentur Gasstörungs-Zentrale) and 112 for life-threatening situations.",
      "BAFA/KfW funding amounts change frequently — info-only flow, never binding figures.",
      "Maintenance CSV import is mocked in this sprint.",
      "Emergency classifier triggers IMMEDIATE for Gas/Water/Heating-in-winter; HEATING is TODAY outside winter.",
    ],
    seasonLogic: {
      currentSeason: getCurrentShkSeason(new Date()).toString(),
      shouldTriggerToday: shouldTriggerShkSeasonCampaign(new Date()),
      preHeatingPushWindow: "August/September",
      postHeatingPushWindow: "April/Mai",
      summerPushWindow: "Juni 1-15 (Klima/Förderungen)",
      gasEmergencyTriage: classifyShkEmergency({ message: "gas-geruch" }).hotlineHint,
    },
  },
};
