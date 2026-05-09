import type { WhatsAppTemplateDefinition } from "@/lib/onboarding/types";

export const kfzWhatsAppTemplates: WhatsAppTemplateDefinition[] = [
  {
    name: "termin_bestaetigung_kfz",
    category: "UTILITY",
    language: "de",
    body: `Hallo {{1}},
Ihr Werkstatt-Termin am {{2}} um {{3}} ist bestätigt.
Adresse: {{4}}
Bitte bringen Sie mit:
- Fahrzeugschein
- Schlüssel
- ggf. Versicherungsdaten

Bei Fragen: {{5}}`,
    variables: ["Kundenname", "Datum", "Uhrzeit", "Werkstatt-Adresse", "Telefonnummer"],
    submissionNotes: "Utility-Template für transaktionale Werkstatt-Terminbestätigungen.",
  },
  {
    name: "tuev_erinnerung",
    category: "UTILITY",
    language: "de",
    body: `Hallo {{1}},
Ihr TÜV läuft am {{2}} ab.
Termin online buchen: {{3}}
Kosten: ab {{4}}€`,
    variables: ["Kundenname", "HU-Fälligkeitsdatum", "Buchungslink", "Startpreis"],
    submissionNotes: "Utility-Template für HU/AU-Erinnerungen mit Opt-in und sachlichem Kostenhinweis.",
  },
  {
    name: "reifen_saison_einladung",
    category: "UTILITY",
    language: "de",
    body: `Hallo {{1}},
{{2}}-Saison naht. Wechsel-Termin?
Online buchen: {{3}}`,
    variables: ["Kundenname", "Sommerreifen- oder Winterreifen", "Buchungslink"],
    submissionNotes: "Saisonale Service-Nachricht; Meta-Kategorie vor Einreichung mit Opt-in prüfen.",
  },
];

export const kfzWhatsAppSubmissionGuide = [
  "Meta Business Manager öffnen und WhatsApp Manager auswählen.",
  "Nachrichtenvorlagen > Vorlage erstellen wählen.",
  "Kategorie Utility, Sprache Deutsch und exakt einen der vorgeschlagenen Template-Namen verwenden.",
  "Body einfügen und Beispielwerte für Name, Datum, Uhrzeit, Adresse, Preis und Link hinterlegen.",
  "Nach Freigabe Template-Namen in der Werkstatt-Konfiguration dokumentieren.",
];
