export type KfzSeason = "WINTER" | "SUMMER" | "TRANSITION";

export interface SeasonCampaignLock {
  customerId: string;
  season: KfzSeason;
  year: number;
}

export function getCurrentSeason(date: Date): KfzSeason {
  const month = date.getMonth() + 1;
  if (month >= 4 && month <= 9) return "SUMMER";
  if (month >= 10 || month <= 3) return "WINTER";
  return "TRANSITION";
}

export function shouldTriggerSeasonCampaign(date: Date): boolean {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return (month === 10 && day <= 15) || (month === 4 && day <= 15);
}

export function seasonCampaignKey(customerId: string, date: Date): string {
  return `${customerId}:${getCurrentSeason(date)}:${date.getFullYear()}`;
}

export function shouldSendSeasonCampaign(args: {
  customerId: string;
  date: Date;
  existingLocks: SeasonCampaignLock[];
}): boolean {
  if (!shouldTriggerSeasonCampaign(args.date)) return false;
  const season = getCurrentSeason(args.date);
  const year = args.date.getFullYear();
  return !args.existingLocks.some((lock) =>
    lock.customerId === args.customerId &&
    lock.season === season &&
    lock.year === year
  );
}
