import type { VoiceScriptDefinition } from "@/lib/onboarding/types";

export const kfzVoiceScripts: VoiceScriptDefinition[] = [
  {
    id: "after-hours-greeting",
    title: "Begrüßungs-Skript",
    routingTarget: "kfz-termin-anfragen",
    script: `"Sie sind außerhalb der Öffnungszeiten der Werkstatt {Name}.

Ich bin der digitale Assistent. Was kann ich für Sie tun?

Sagen Sie:
- Termin vereinbaren
- Pannenhilfe
- Auskunft
- Mit Werkstatt verbunden werden"`,
  },
  {
    id: "breakdown-assistance",
    title: "Pannenhilfe-Skript",
    routingTarget: "kfz-termin-anfragen",
    script: `"Sie haben eine Panne. Bitte sicherheitshalber:
1. Auto am sicheren Ort abstellen, Warnblinker an
2. Warndreieck aufstellen
3. Insassen aus dem Auto raus, hinter Leitplanke

Ich verbinde Sie jetzt mit der Pannenhilfe.

Falls lebensbedrohliche Situation: 112 wählen.

Verbinde..."`,
  },
];
