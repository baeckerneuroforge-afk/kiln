import type { WhatsAppTemplateDefinition } from "@/lib/onboarding/types";

export const shkWhatsAppTemplates: WhatsAppTemplateDefinition[] = [
  {
    name: "termin_bestaetigung_shk",
    category: "UTILITY",
    language: "de",
    body: `Hallo {{1}},
Ihr SHK-Termin am {{2}} um {{3}} ist bestätigt.

Adresse: {{4}}
Geschätzte Dauer: {{5}}
Bitte bereithalten: Schlüssel zum Heizungsraum/Bad

Bei Fragen: {{6}}`,
    variables: ["Kundenname", "Datum", "Uhrzeit", "Adresse", "Geschätzte Dauer", "Telefonnummer"],
    submissionNotes: "Utility-Template für transaktionale SHK-Terminbestätigungen mit Anfahrt und Vorbereitung.",
  },
  {
    name: "notdienst_eingegangen",
    category: "UTILITY",
    language: "de",
    body: `Hallo {{1}},
Ihr Notruf ist eingegangen. Wir melden uns innerhalb {{2}} Min mit Anfahrtszeit.
Bei akuter Gefahr (Gas, Wasser):
- Hauptabsperrhahn zudrehen
- Bei Gas: Wohnung verlassen, kein Licht!
- Notruf 112 wenn Lebensgefahr`,
    variables: ["Kundenname", "Rückrufzeit in Minuten"],
    submissionNotes: "Utility-Template für Notdienst-Eingangsbestätigung mit Sicherheits-Hinweisen.",
  },
  {
    name: "wartung_erinnerung",
    category: "UTILITY",
    language: "de",
    body: `Hallo {{1}},
Ihre {{2}}-Wartung steht an. Letzte: {{3}}.
Termin online: {{4}}
Vor Heizsaison empfehlenswert.`,
    variables: ["Kundenname", "Anlagentyp", "Datum letzte Wartung", "Buchungslink"],
    submissionNotes: "Utility-Template für Wartungs-Erinnerungen; Meta-Kategorie vor Einreichung mit Opt-in prüfen.",
  },
];

export const shkWhatsAppSubmissionGuide = [
  "Meta Business Manager öffnen und WhatsApp Manager auswählen.",
  "Nachrichtenvorlagen > Vorlage erstellen wählen.",
  "Kategorie Utility, Sprache Deutsch und exakt einen der vorgeschlagenen Template-Namen verwenden.",
  "Body einfügen und Beispielwerte für Name, Datum, Uhrzeit, Adresse, Dauer und Link hinterlegen.",
  "Nach Freigabe Template-Namen in der SHK-Konfiguration dokumentieren.",
];
