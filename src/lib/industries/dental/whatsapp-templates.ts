import type { WhatsAppTemplateDefinition } from "@/lib/onboarding/types";

export const dentalWhatsAppTemplates: WhatsAppTemplateDefinition[] = [
  {
    name: "termin_bestaetigung",
    category: "UTILITY",
    language: "de",
    body: `Sehr geehrte/r {{1}},

Ihr Termin am {{2}} um {{3}} bei {{4}} ist bestaetigt.

Adresse: {{5}}
Bitte bringen Sie Ihren Versicherungsausweis mit.

Bei Fragen rufen Sie uns gerne an: {{6}}`,
    variables: ["Patientenname", "Datum", "Uhrzeit", "Praxisname", "Adresse", "Telefonnummer"],
    submissionNotes: "Utility-Template fuer transaktionale Terminbestaetigungen mit klaren Platzhaltern.",
  },
  {
    name: "termin_erinnerung",
    category: "UTILITY",
    language: "de",
    body: `Hallo {{1}},

morgen um {{2}} haben Sie Ihren Termin in unserer Praxis.

Bitte bestaetigen Sie kurz mit JA oder sagen Sie ab unter: {{3}}

Bis morgen!`,
    variables: ["Patientenname", "Uhrzeit", "Absagekontakt oder Link"],
    submissionNotes: "Utility-Template fuer Erinnerungen innerhalb erlaubter Servicekommunikation.",
  },
  {
    name: "recall_erinnerung",
    category: "UTILITY",
    language: "de",
    body: `Liebe/r {{1}},

Ihre letzte Vorsorge-Untersuchung war am {{2}}.
Es waere Zeit fuer die naechste!

Termin online buchen: {{3}}`,
    variables: ["Patientenname", "Datum der letzten Vorsorge", "Buchungslink"],
    submissionNotes: "Recall-Vorlage vor Einreichung mit Meta-Kategorie und Opt-in der Praxis abgleichen.",
  },
];

export const dentalWhatsAppSubmissionGuide = [
  "Meta Business Manager oeffnen und WhatsApp Manager auswaehlen.",
  "Nachrichtenvorlagen > Vorlage erstellen waehlen.",
  "Kategorie Utility, Sprache Deutsch und exakt einen der vorgeschlagenen Template-Namen verwenden.",
  "Body einfuegen und Variablenbeispiele wie Name, Datum, Uhrzeit, Adresse und Telefonnummer hinterlegen.",
  "Vorlage zur Pruefung einreichen und nach Freigabe in KILN unter WhatsApp-Templates hinterlegen.",
];
