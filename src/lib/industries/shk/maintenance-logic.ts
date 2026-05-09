export type ShkMaintenanceStage = "SIX_WEEKS" | "TWO_WEEKS" | "THREE_DAYS";
export type ShkSystemType = "Heizung" | "Klima" | "Solarthermie" | "Lüftung";

export interface ShkMaintenanceCustomerRow {
  customerId?: string;
  customerName: string;
  systemType: ShkSystemType;
  brand?: string;
  lastMaintenanceDate: string;
  intervalMonths?: number;
  maintenanceDone?: boolean;
  sentStages?: ShkMaintenanceStage[];
}

export interface ShkMaintenanceReminderResult {
  customerName: string;
  systemType: ShkSystemType;
  brand?: string;
  dueDate: string;
  daysUntilDue: number;
  stage: ShkMaintenanceStage | null;
  shouldSend: boolean;
}

const reminderStages: { stage: ShkMaintenanceStage; days: number }[] = [
  { stage: "SIX_WEEKS", days: 42 },
  { stage: "TWO_WEEKS", days: 14 },
  { stage: "THREE_DAYS", days: 3 },
];

function toUtcDateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function parseIsoDate(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date for SHK maintenance: ${value}`);
  return parsed;
}

function addMonthsUtc(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

export function calculateShkMaintenanceReminder(
  row: ShkMaintenanceCustomerRow,
  referenceDate: Date = new Date(),
): ShkMaintenanceReminderResult {
  const last = parseIsoDate(row.lastMaintenanceDate);
  const interval = row.intervalMonths ?? 12;
  const due = addMonthsUtc(last, interval);
  const today = toUtcDateOnly(referenceDate);
  const dueAtMidnight = toUtcDateOnly(due);
  const daysUntilDue = Math.ceil((dueAtMidnight.getTime() - today.getTime()) / 86_400_000);
  const matched = reminderStages.find((stage) => stage.days === daysUntilDue) ?? null;
  const alreadySent = matched ? row.sentStages?.includes(matched.stage) === true : false;

  return {
    customerName: row.customerName,
    systemType: row.systemType,
    brand: row.brand,
    dueDate: dueAtMidnight.toISOString().slice(0, 10),
    daysUntilDue,
    stage: matched?.stage ?? null,
    shouldSend: row.maintenanceDone !== true && Boolean(matched) && !alreadySent,
  };
}

export function selectDueShkMaintenanceReminders(
  rows: ShkMaintenanceCustomerRow[],
  referenceDate: Date = new Date(),
): ShkMaintenanceReminderResult[] {
  return rows
    .map((row) => calculateShkMaintenanceReminder(row, referenceDate))
    .filter((result) => result.shouldSend);
}
