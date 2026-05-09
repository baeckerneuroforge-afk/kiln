export type TuevReminderStage = "SIX_WEEKS" | "TWO_WEEKS" | "THREE_DAYS";

export interface TuevCustomerRow {
  customerId?: string;
  customerName: string;
  vehicleModel: string;
  huDueDate: string;
  huDone?: boolean;
  sentStages?: TuevReminderStage[];
}

export interface TuevReminderResult {
  customerName: string;
  vehicleModel: string;
  huDueDate: string;
  daysUntilDue: number;
  stage: TuevReminderStage | null;
  shouldSend: boolean;
}

const reminderStages: { stage: TuevReminderStage; days: number }[] = [
  { stage: "SIX_WEEKS", days: 42 },
  { stage: "TWO_WEEKS", days: 14 },
  { stage: "THREE_DAYS", days: 3 },
];

function toUtcDateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function parseIsoDate(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid HU due date: ${value}`);
  return parsed;
}

export function calculateTuevReminder(row: TuevCustomerRow, referenceDate: Date = new Date()): TuevReminderResult {
  const due = parseIsoDate(row.huDueDate);
  const today = toUtcDateOnly(referenceDate);
  const daysUntilDue = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  const matched = reminderStages.find((stage) => stage.days === daysUntilDue);
  const alreadySent = matched ? row.sentStages?.includes(matched.stage) === true : false;

  return {
    customerName: row.customerName,
    vehicleModel: row.vehicleModel,
    huDueDate: due.toISOString().slice(0, 10),
    daysUntilDue,
    stage: matched?.stage ?? null,
    shouldSend: row.huDone !== true && Boolean(matched) && !alreadySent,
  };
}

export function selectDueTuevReminders(rows: TuevCustomerRow[], referenceDate: Date = new Date()): TuevReminderResult[] {
  return rows
    .map((row) => calculateTuevReminder(row, referenceDate))
    .filter((result) => result.shouldSend);
}
