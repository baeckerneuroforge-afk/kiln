import type { VoiceScriptDefinition } from "@/lib/onboarding/types";

export const dentalVoiceScripts: VoiceScriptDefinition[] = [
  {
    id: "after-hours-greeting",
    title: "Begruessungs-Skript",
    routingTarget: "dental-notfall-triage",
    script: `"Sie sind ausserhalb der Oeffnungszeiten von Praxis {Praxis-Name}.

Ich bin {Agent-Name}, der digitale Assistent. Wie kann ich Ihnen helfen?

Sie koennen sagen:
- Termin vereinbaren
- Notfall
- Allgemeine Frage
- Mit Praxis verbunden werden"`,
  },
  {
    id: "emergency-routing",
    title: "Notfall-Routing-Skript",
    routingTarget: "dental-notfall-triage",
    script: `"Sie haben einen Notfall gemeldet. Ich verbinde Sie mit der Notfall-Hotline.

Falls Sie starke Schmerzen haben, einen ausgeschlagenen Zahn oder eine Schwellung mit Atemnot haben: bitte waehlen Sie sofort den Rettungsdienst 112.

Verbindung wird aufgebaut..."`,
  },
  {
    id: "appointment-intake",
    title: "Termin-Skript",
    routingTarget: "dental-termin-anfrage",
    script: `"Ich nehme Ihre Anfrage entgegen. Wie ist Ihr Name?
Welche Behandlung benoetigen Sie?
Welcher Tag passt Ihnen am besten?
Vormittag oder Nachmittag?

Ich notiere Ihre Anfrage. Das Praxis-Team meldet sich morgen frueh bei Ihnen.
Sie erhalten eine SMS-Bestaetigung an die Nummer, von der Sie anrufen."`,
  },
];
