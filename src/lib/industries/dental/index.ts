import type { IndustryTemplateDefinition } from "@/lib/onboarding/types";
import { dentalDepartmentTemplates } from "./department-templates";
import { dentalKnowledgeBaseSeeds } from "./knowledge-base-seeds";
import { dentalRecallSchedules } from "./recall-logic";
import { dentalVoiceScripts } from "./voice-scripts";
import { dentalWhatsAppSubmissionGuide, dentalWhatsAppTemplates } from "./whatsapp-templates";

export {
  dentalDepartmentTemplates,
  dentalKnowledgeBaseSeeds,
  dentalRecallSchedules,
  dentalVoiceScripts,
  dentalWhatsAppSubmissionGuide,
  dentalWhatsAppTemplates,
};
export { evaluateRecallDue, selectDueRecallRows } from "./recall-logic";
export type { DentalKnowledgeBaseSeed } from "./knowledge-base-seeds";
export type { RecallDueResult, RecallFrequencyMonths, RecallPatientRow } from "./recall-logic";

export const dentalIndustryTemplate: IndustryTemplateDefinition = {
  industry: "dental",
  displayName: "Dental",
  displayNameDe: "Zahnarztpraxis",
  description: "Production-ready dental operations pack for appointment intake, recalls, insurance guidance, and emergency triage.",
  descriptionDe:
    "Produktionsreifes Zahnarzt-Pack fuer Termin-Anfragen, Recall-Erinnerungen, Zahnzusatzversicherungs-Beratung und Notfall-Triage.",
  recommendedChannels: ["email", "whatsapp", "webchat", "voice"],
  sortOrder: 10,
  iconName: "Stethoscope",
  knowledgeBaseSeeds: dentalKnowledgeBaseSeeds.map((seed) => ({
    title: `${seed.category}: ${seed.title}`,
    content: seed.content,
  })),
  departmentTemplates: dentalDepartmentTemplates,
  metadata: {
    packVersion: "1.2",
    setupTimeMinutes: 30,
    estimatedManualSetupHours: 8,
    whatsappTemplates: dentalWhatsAppTemplates,
    voiceScripts: dentalVoiceScripts,
    recallSchedules: dentalRecallSchedules,
    metaSubmissionGuide: dentalWhatsAppSubmissionGuide,
    notes: [
      "German content uses formal Sie-Anrede and avoids medical advice.",
      "Emergency defaults remain APPROVAL_FIRST; clinics may enable auto emergency notices after risk review.",
      "Calendar and practice-software integrations are mocked in this sprint.",
    ],
  },
};
