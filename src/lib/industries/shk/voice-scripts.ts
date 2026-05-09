import type { VoiceScriptDefinition } from "@/lib/onboarding/types";

export const shkVoiceScripts: VoiceScriptDefinition[] = [
  {
    id: "after-hours-greeting",
    title: "Begrüßungs-Skript",
    routingTarget: "shk-termin-anfragen",
    script: `"Sie sind außerhalb der Öffnungszeiten von {Betrieb-Name}.

Ich bin der digitale Assistent. Was kann ich für Sie tun?

Sagen Sie:
- Notdienst — bei akutem Problem
- Termin vereinbaren
- Wartung anfragen
- Mit Mitarbeiter verbinden"`,
  },
  {
    id: "emergency-routing",
    title: "Notdienst-Skript",
    routingTarget: "shk-termin-anfragen",
    script: `"Sie haben einen Notdienst-Fall. Welcher Bereich:
1 = Heizung ausgefallen
2 = Wasserschaden / Rohrbruch
3 = Gasgeruch
4 = Anderes

[Bei Gas]:
'Sicherheitswarnung: Kein Licht anschalten, keine elektrischen Geräte.
Wohnung verlassen. Gas-Notruf 0800 280 33 22.
Falls akute Gefahr: 112 wählen.
Verbinde Sie mit unserem Notdienst.'

[Bei Wasser/Heizung]:
'Hauptabsperrhahn zudrehen wenn möglich.
Wir verbinden Sie mit Notdienst-Bereitschaft.'"`,
  },
  {
    id: "appointment-intake",
    title: "Termin-Skript",
    routingTarget: "shk-termin-anfragen",
    script: `"Ich nehme Ihre Anfrage entgegen.
- Was ist der Anlass: Reparatur, Wartung, Neuinstallation?
- Welche Adresse?
- Welche Marke/Typ Ihrer Heizung/Anlage?
- Welcher Tag passt: nächste Woche, kommende 2 Wochen?

Notiere Ihre Anfrage. Mitarbeiter meldet sich morgen.
SMS-Bestätigung an Anrufer-Nummer."`,
  },
];
