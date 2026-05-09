export type ShkSeason = "PRE_HEATING" | "HEATING" | "POST_HEATING" | "SUMMER";

export interface ShkSeasonCampaignLock {
  customerId: string;
  season: ShkSeason;
  year: number;
}

export function getCurrentShkSeason(date: Date): ShkSeason {
  const month = date.getUTCMonth() + 1;
  if (month === 8 || month === 9) return "PRE_HEATING";
  if (month >= 10 || month <= 3) return "HEATING";
  if (month === 4 || month === 5) return "POST_HEATING";
  return "SUMMER";
}

export function shouldTriggerShkSeasonCampaign(date: Date): boolean {
  const season = getCurrentShkSeason(date);
  const day = date.getUTCDate();
  if (season === "PRE_HEATING") return day <= 21;
  if (season === "SUMMER") return day <= 15 && date.getUTCMonth() + 1 === 6;
  return false;
}

export function shkSeasonCampaignKey(customerId: string, date: Date): string {
  return `${customerId}:${getCurrentShkSeason(date)}:${date.getUTCFullYear()}`;
}

export function shouldSendShkSeasonCampaign(args: {
  customerId: string;
  date: Date;
  existingLocks: ShkSeasonCampaignLock[];
}): boolean {
  if (!shouldTriggerShkSeasonCampaign(args.date)) return false;
  const season = getCurrentShkSeason(args.date);
  const year = args.date.getUTCFullYear();
  return !args.existingLocks.some(
    (lock) => lock.customerId === args.customerId && lock.season === season && lock.year === year,
  );
}

export interface ShkEmergencyClassification {
  category: "GAS" | "WATER" | "HEATING" | "OTHER";
  priority: "IMMEDIATE" | "TODAY" | "ROUTINE";
  hotlineHint: string;
  safetyInstructions: string[];
}

export function classifyShkEmergency(input: {
  message: string;
  isWinter?: boolean;
}): ShkEmergencyClassification {
  const text = input.message.toLowerCase();
  const gasKeywords = ["gas", "gasgeruch", "gas-geruch", "gas geruch"];
  const waterKeywords = ["rohrbruch", "wasserrohr", "wasserschaden", "wasser läuft", "wasseraustritt"];
  const heatingKeywords = ["heizung", "heizungsausfall", "kalte heizung", "kein warmwasser"];

  if (gasKeywords.some((keyword) => text.includes(keyword))) {
    return {
      category: "GAS",
      priority: "IMMEDIATE",
      hotlineHint: "Gas-Notruf 0800 280 33 22 — bei akuter Lebensgefahr 112",
      safetyInstructions: [
        "Wohnung verlassen, kein Licht/Schalter anfassen",
        "Fenster und Türen öffnen, keine elektrischen Geräte benutzen",
        "Gas-Notruf 0800 280 33 22 wählen",
      ],
    };
  }
  if (waterKeywords.some((keyword) => text.includes(keyword))) {
    return {
      category: "WATER",
      priority: "IMMEDIATE",
      hotlineHint: "Notdienst-Bereitschaft des Betriebs",
      safetyInstructions: [
        "Hauptwasserhahn zudrehen",
        "Strom in betroffenen Räumen abschalten",
        "Foto vom Schaden für Versicherung",
      ],
    };
  }
  if (heatingKeywords.some((keyword) => text.includes(keyword))) {
    return {
      category: "HEATING",
      priority: input.isWinter ? "IMMEDIATE" : "TODAY",
      hotlineHint: "Notdienst-Bereitschaft des Betriebs",
      safetyInstructions: [
        "Räume nicht zu stark auskühlen lassen",
        "Türen zu unbeheizten Räumen schließen",
        "Stromversorgung und Smart-Thermostat prüfen",
      ],
    };
  }
  return {
    category: "OTHER",
    priority: "ROUTINE",
    hotlineHint: "Termin innerhalb der Öffnungszeiten",
    safetyInstructions: [],
  };
}
