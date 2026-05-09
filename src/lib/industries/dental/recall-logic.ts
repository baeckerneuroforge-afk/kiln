import type { RecallScheduleDefinition } from "@/lib/onboarding/types";

export type RecallFrequencyMonths = 3 | 6 | 12;

export interface RecallPatientRow {
  patientId?: string;
  patientName: string;
  email?: string;
  lastTreatment: string;
  lastVisitDate: string;
  recallMonths: RecallFrequencyMonths;
  preferredChannel?: "email" | "whatsapp";
}

export interface RecallDueResult {
  patientName: string;
  lastTreatment: string;
  lastVisitDate: string;
  recallMonths: RecallFrequencyMonths;
  dueDate: string;
  status: "due" | "soon" | "not_due";
  daysUntilDue: number;
}

export const dentalRecallSchedules: RecallScheduleDefinition[] = [
  { id: "recall-3-months", label: "3-Monats-Recall", months: 3, dailyRunTime: "09:00", cron: "0 9 * * *" },
  { id: "recall-6-months", label: "6-Monats-Recall", months: 6, dailyRunTime: "09:00", cron: "0 9 * * *" },
  { id: "recall-12-months", label: "12-Monats-Recall", months: 12, dailyRunTime: "09:00", cron: "0 9 * * *" },
];

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function evaluateRecallDue(row: RecallPatientRow, referenceDate: Date = new Date()): RecallDueResult {
  const lastVisit = new Date(`${row.lastVisitDate}T00:00:00.000Z`);
  if (Number.isNaN(lastVisit.getTime())) {
    throw new Error(`Invalid lastVisitDate for ${row.patientName}`);
  }

  const dueDate = addMonths(lastVisit, row.recallMonths);
  const today = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()));
  const dueAtMidnight = new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate()));
  const daysUntilDue = Math.ceil((dueAtMidnight.getTime() - today.getTime()) / 86_400_000);

  return {
    patientName: row.patientName,
    lastTreatment: row.lastTreatment,
    lastVisitDate: toIsoDate(lastVisit),
    recallMonths: row.recallMonths,
    dueDate: toIsoDate(dueAtMidnight),
    daysUntilDue,
    status: daysUntilDue <= 0 ? "due" : daysUntilDue <= 14 ? "soon" : "not_due",
  };
}

export function selectDueRecallRows(rows: RecallPatientRow[], referenceDate: Date = new Date()): RecallDueResult[] {
  return rows
    .map((row) => evaluateRecallDue(row, referenceDate))
    .filter((result) => result.status === "due" || result.status === "soon");
}
